"""ElevenLabs STT WebSocket handler.

Stateless per PTT press — opens, proxies audio, closes. Same call shape as
SarvamSTTHandler (voice_agent/stt_handler.py) so it's a drop-in swap behind
create_stt_handler() (Task 3).

Unlike Sarvam's saaras:v3, Scribe v2 Realtime has an explicit committed vs.
partial distinction and a `commit` flag on the audio chunk itself instead of
a separate flush message.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import ssl

import certifi
import websockets
from fastapi import WebSocket
from websockets.exceptions import ConnectionClosed, ConnectionClosedOK

_SSL_CTX = ssl.create_default_context(cafile=certifi.where())

logger = logging.getLogger(__name__)

_ELEVENLABS_STT_URL = (
    "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
    "?model_id=scribe_v2_realtime"
    "&audio_format=pcm_16000"
)
_SAMPLE_RATE = 16000
_FINALIZE_TIMEOUT = 20.0


class ElevenLabsSTTHandler:
    """Per-PTT-press ElevenLabs Scribe v2 Realtime STT proxy."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def transcribe_session(self, client_ws: WebSocket) -> str | None:
        """Run a full STT proxy session for one PTT press.

        Returns the committed transcript string, or None on
        disconnect/no-speech — same contract as SarvamSTTHandler.
        """
        async with websockets.connect(
            _ELEVENLABS_STT_URL,
            additional_headers={"xi-api-key": self._api_key},
            ssl=_SSL_CTX,
        ) as elevenlabs_ws:
            committed = asyncio.Event()
            transcript_holder: list[str] = []

            client_task = asyncio.create_task(
                self._forward_client_to_elevenlabs(client_ws, elevenlabs_ws)
            )
            elevenlabs_task = asyncio.create_task(
                self._forward_elevenlabs_to_client(
                    elevenlabs_ws, client_ws, transcript_holder, committed
                )
            )

            try:
                await client_task
                try:
                    await asyncio.wait_for(
                        elevenlabs_task, timeout=_FINALIZE_TIMEOUT
                    )
                except asyncio.TimeoutError:
                    logger.warning("STT finalize timeout after commit")
            finally:
                for t in (client_task, elevenlabs_task):
                    if not t.done():
                        t.cancel()
                        try:
                            await t
                        except (asyncio.CancelledError, Exception):
                            pass

            return transcript_holder[-1] if transcript_holder else None

    async def _forward_client_to_elevenlabs(
        self,
        client_ws: WebSocket,
        elevenlabs_ws: object,
    ) -> None:
        """Loop: read client frames, wrap PCM as input_audio_chunk, forward.

        On flush, send a final input_audio_chunk with commit=true and exit.
        """
        while True:
            msg = await client_ws.receive()
            if not isinstance(msg, dict):
                return

            msg_type = msg.get("type")
            if msg_type == "websocket.receive":
                raw_bytes = msg.get("bytes")
                raw_text = msg.get("text")

                if raw_bytes:
                    await elevenlabs_ws.send(
                        json.dumps(
                            {
                                "message_type": "input_audio_chunk",
                                "audio_base_64": base64.b64encode(
                                    raw_bytes
                                ).decode("ascii"),
                                "commit": False,
                                "sample_rate": _SAMPLE_RATE,
                            }
                        )
                    )
                elif raw_text:
                    try:
                        parsed = json.loads(raw_text)
                    except json.JSONDecodeError:
                        continue
                    if parsed.get("type") == "flush":
                        logger.debug("STT: sending commit=true to ElevenLabs")
                        await elevenlabs_ws.send(
                            json.dumps(
                                {
                                    "message_type": "input_audio_chunk",
                                    "audio_base_64": "",
                                    "commit": True,
                                    "sample_rate": _SAMPLE_RATE,
                                }
                            )
                        )
                        return

            elif msg_type in ("websocket.disconnect", "websocket.close"):
                return

    async def _forward_elevenlabs_to_client(
        self,
        elevenlabs_ws: object,
        client_ws: WebSocket,
        transcript_holder: list[str],
        committed: asyncio.Event,
    ) -> None:
        """Loop: read ElevenLabs events, forward to client.

        partial_transcript -> {"type": "interim", "text": ...}
        committed_transcript -> {"type": "final", "text": ...}, then return.
        """
        try:
            while True:
                msg = await elevenlabs_ws.recv()

                if isinstance(msg, bytes):
                    continue

                try:
                    envelope = json.loads(msg)
                except json.JSONDecodeError:
                    continue

                msg_type = envelope.get("message_type", "")

                if msg_type == "session_started":
                    continue

                elif msg_type == "partial_transcript":
                    text = envelope.get("text", "") or ""
                    await client_ws.send_json({"type": "interim", "text": text})

                elif msg_type == "committed_transcript":
                    text = envelope.get("text", "") or ""
                    transcript_holder.append(text)
                    committed.set()
                    logger.debug("STT final: %r", text)
                    await client_ws.send_json({"type": "final", "text": text})
                    return

                elif msg_type in (
                    "auth_error",
                    "quota_exceeded",
                    "rate_limited",
                    "resource_exhausted",
                ):
                    err = envelope.get("message", "unknown error")
                    logger.error("ElevenLabs STT error %s: %s", msg_type, err)
                    await client_ws.send_json(
                        {"type": "error", "message": f"{msg_type}: {err}"}
                    )
                    return
        except ConnectionClosedOK:
            pass
        except ConnectionClosed as e:
            logger.warning("ElevenLabs STT connection closed: %s", e)
