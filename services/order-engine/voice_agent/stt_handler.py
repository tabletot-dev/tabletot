"""Sarvam STT WebSocket handler.

Stateless per PTT press — opens, proxies audio, closes.

Two concurrent tasks run inside each session:
  - _forward_client_to_sarvam: base64-wraps PCM frames into Sarvam's JSON
    envelope and forwards flush
  - _forward_sarvam_to_client: unwraps Sarvam's {type, data} responses and
    sends speech_start / speech_end / interim / final to the client

Sarvam's saaras:v3 has no is_final flag. After the client's flush is forwarded,
the next data response is treated as the final transcript.
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

_SARVAM_STT_URL = (
    "wss://api.sarvam.ai/speech-to-text/ws"
    "?model=saaras:v3"
    "&language-code=unknown"
    "&mode=transcribe"
    "&flush_signal=True"
    "&vad_signals=True"
    "&input_audio_codec=pcm_s16le"
    "&sample_rate=16000"
)
_FINALIZE_TIMEOUT = 10.0


class SarvamSTTHandler:
    """Per-PTT-press Sarvam STT proxy."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def transcribe_session(self, client_ws: WebSocket) -> str | None:
        """Run a full STT proxy session for one PTT press.

        Opens a Sarvam STT WebSocket, runs two concurrent tasks:
        - client→Sarvam: forwards base64-encoded PCM chunks and the flush signal
        - Sarvam→client: forwards VAD events and progressive transcripts

        Sarvam's saaras:v3 protocol has no is_final flag — transcripts are
        progressive. We wait for the client to send flush, then wait (with
        timeout) for Sarvam's post-flush finalization response, treating the
        latest transcript as the final.

        Returns the final transcript string, or None on disconnect/error.
        """
        async with websockets.connect(
            _SARVAM_STT_URL,
            additional_headers={"api-subscription-key": self._api_key},
            ssl=_SSL_CTX,
        ) as sarvam_ws:
            flush_sent = asyncio.Event()
            transcript_holder: list[str] = []

            client_task = asyncio.create_task(
                self._forward_client_to_sarvam(client_ws, sarvam_ws, flush_sent)
            )
            sarvam_task = asyncio.create_task(
                self._forward_sarvam_to_client(
                    sarvam_ws, client_ws, transcript_holder, flush_sent
                )
            )

            try:
                await client_task
                try:
                    await asyncio.wait_for(sarvam_task, timeout=_FINALIZE_TIMEOUT)
                except asyncio.TimeoutError:
                    logger.warning("STT finalize timeout after flush")
            finally:
                for t in (client_task, sarvam_task):
                    if not t.done():
                        t.cancel()
                        try:
                            await t
                        except (asyncio.CancelledError, Exception):
                            pass

            return transcript_holder[-1] if transcript_holder else None

    async def _forward_client_to_sarvam(
        self,
        client_ws: WebSocket,
        sarvam_ws: object,
        flush_sent: asyncio.Event,
    ) -> None:
        """Loop: read client frames, wrap PCM in Sarvam's JSON envelope, forward.

        On flush, send Sarvam's flush JSON, mark flush_sent, and exit.
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
                    audio_msg = json.dumps(
                        {
                            "audio": {
                                "data": base64.b64encode(raw_bytes).decode("ascii"),
                                "sample_rate": "16000",
                                "encoding": "audio/wav",
                            }
                        }
                    )
                    await sarvam_ws.send(audio_msg)
                elif raw_text:
                    try:
                        parsed = json.loads(raw_text)
                    except json.JSONDecodeError:
                        continue
                    if parsed.get("type") == "flush":
                        logger.debug("STT: forwarding flush to Sarvam")
                        await sarvam_ws.send(json.dumps({"type": "flush"}))
                        flush_sent.set()
                        return

            elif msg_type in ("websocket.disconnect", "websocket.close"):
                return

    async def _forward_sarvam_to_client(
        self,
        sarvam_ws: object,
        client_ws: WebSocket,
        transcript_holder: list[str],
        flush_sent: asyncio.Event,
    ) -> None:
        """Loop: read Sarvam events, forward to client.

        Sarvam responses are wrapped as {"type": "data|events|error", "data": {...}}.
        Since there's no is_final flag, we treat every transcript as progressive
        and return when a data message arrives after flush_sent (that one is final).
        """
        try:
            while True:
                msg = await sarvam_ws.recv()

                if isinstance(msg, bytes):
                    continue

                try:
                    envelope = json.loads(msg)
                except json.JSONDecodeError:
                    continue

                env_type = envelope.get("type", "")
                payload = envelope.get("data", {}) or {}

                if env_type == "events":
                    signal = payload.get("signal_type", "")
                    if signal == "START_SPEECH":
                        await client_ws.send_json({"type": "speech_start"})
                    elif signal == "END_SPEECH":
                        await client_ws.send_json({"type": "speech_end"})

                elif env_type == "data":
                    text = payload.get("transcript", "") or ""
                    transcript_holder.append(text)

                    if flush_sent.is_set():
                        logger.debug("STT final: %r", text)
                        await client_ws.send_json({"type": "final", "text": text})
                        return
                    else:
                        await client_ws.send_json({"type": "interim", "text": text})

                elif env_type == "error":
                    err = payload.get("error", "unknown error")
                    code = payload.get("code", "")
                    logger.error("Sarvam STT error code=%s: %s", code, err)
                    await client_ws.send_json(
                        {"type": "error", "message": f"{code}: {err}" if code else err}
                    )
                    return
        except ConnectionClosedOK:
            pass
        except ConnectionClosed as e:
            logger.warning("Sarvam STT connection closed: %s", e)
