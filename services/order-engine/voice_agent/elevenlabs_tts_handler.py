"""ElevenLabs TTS WebSocket handler.

Persistent WebSocket per table session — same shape as SarvamTTSHandler
(voice_agent/tts_handler.py) so it's a drop-in swap behind
create_tts_handler() (Task 3).
- configure() called once on session start (speaker == ElevenLabs voice_id)
- speak() converts text to audio, streams chunks back
- keepalive() pings to stay under inactivity_timeout (set to 180s on
  connect, ElevenLabs' max, vs. Sarvam's fixed 60s)
- close() gracefully shuts down

Unlike Sarvam's {"type": ..., "data": {...}} envelope, ElevenLabs' stream-input
protocol has no discriminator field on server messages — an AudioOutput
message carries "audio", a FinalOutput message carries "isFinal": true.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import ssl
from typing import AsyncGenerator

import certifi
import websockets

logger = logging.getLogger(__name__)

_SSL_CTX = ssl.create_default_context(cafile=certifi.where())

_KEEPALIVE_INTERVAL = 30  # seconds — safely under the 180s inactivity_timeout below
_INACTIVITY_TIMEOUT = 180  # seconds — ElevenLabs' max, mirrors Sarvam's persistent-session intent


def _tts_url(voice_id: str) -> str:
    return (
        f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"
        f"?output_format=pcm_24000&model_id=eleven_flash_v2_5"
        f"&inactivity_timeout={_INACTIVITY_TIMEOUT}"
    )


class ElevenLabsTTSHandler:
    """Persistent ElevenLabs TTS WebSocket for one table session."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._ws = None
        self._keepalive_task: asyncio.Task | None = None
        # Stored for reconnection after idle-timeout closes
        self._language_code: str | None = None
        self._voice_id: str | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def configure(self, language_code: str, speaker: str) -> None:
        """Open the WebSocket for `speaker` (an ElevenLabs voice_id) and send
        InitializeConnection. Stores config so speak() can reconnect if
        ElevenLabs closes the socket due to inactivity.
        """
        self._language_code = language_code
        self._voice_id = speaker
        await self._open_and_configure()

    async def speak(self, text: str) -> AsyncGenerator[bytes, None]:
        """Send text to TTS and yield raw PCM audio chunks as they arrive.

        Reconnects automatically if ElevenLabs closed the WebSocket due to
        inactivity between configure() and this call.
        """
        if self._voice_id is None:
            raise RuntimeError("TTS handler not configured — call configure() first")

        await self._ensure_connected()

        await self._ws.send(json.dumps({"text": text, "flush": True}))
        # ElevenLabs doesn't proactively signal completion (no isFinal, no
        # close) after a flush alone — it waits for either more text or this
        # explicit CloseConnection message before finishing. Confirmed via
        # live testing 2026-08-17: without this, the connection hangs until
        # the server's own inactivity_timeout fires (~180s), never yielding
        # isFinal. Unlike Sarvam, which closes proactively when done.
        await self._ws.send(json.dumps({"text": ""}))
        logger.debug("TTS speak: %r", text[:60])

        while True:
            try:
                msg = await self._ws.recv()
            except websockets.exceptions.ConnectionClosedOK:
                logger.debug("TTS speak: connection closed by server (complete)")
                break
            except websockets.exceptions.ConnectionClosed as e:
                logger.warning("TTS speak: unexpected connection close: %s", e)
                raise
            if isinstance(msg, bytes):
                continue
            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                logger.debug("TTS speak: non-JSON server message: %r", msg[:120])
                continue

            # The final message can carry the last audio chunk alongside
            # isFinal in the same payload — yield audio before breaking, or
            # every sentence loses its trailing audio.
            audio_b64 = data.get("audio")
            if audio_b64:
                try:
                    yield base64.b64decode(audio_b64)
                except (ValueError, TypeError) as e:
                    logger.warning("TTS speak: bad base64 audio payload: %s", e)

            if data.get("isFinal"):
                logger.debug("TTS speak: final event received")
                break

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _open_and_configure(self) -> None:
        """Open a fresh WebSocket to ElevenLabs and send InitializeConnection."""
        self._ws = await websockets.connect(
            _tts_url(self._voice_id),
            additional_headers={"xi-api-key": self._api_key},
            ssl=_SSL_CTX,
        )
        await self._ws.send(json.dumps({"text": " "}))
        logger.info(
            "TTS (re)configured: language=%s voice_id=%s",
            self._language_code,
            self._voice_id,
        )

    async def _ensure_connected(self) -> None:
        """Reconnect if ElevenLabs closed the WebSocket due to inactivity."""
        from websockets.protocol import State

        if self._ws is None or self._ws.state in (State.CLOSING, State.CLOSED):
            logger.info("TTS WebSocket closed — reconnecting")
            if self._keepalive_task and not self._keepalive_task.done():
                self._keepalive_task.cancel()
                try:
                    await self._keepalive_task
                except asyncio.CancelledError:
                    pass
            await self._open_and_configure()
            self.start_keepalive()

    async def keepalive(self) -> None:
        """Send a WebSocket ping every 30 seconds to prevent idle disconnect.

        Run this as an asyncio.Task. It is cancelled by close().
        """
        try:
            while True:
                await asyncio.sleep(_KEEPALIVE_INTERVAL)
                if self._ws is not None:
                    try:
                        await self._ws.ping()
                        logger.debug("TTS keepalive ping sent")
                    except Exception:
                        logger.debug("TTS keepalive ping failed — socket closed")
                        break
        except asyncio.CancelledError:
            pass

    async def close(self) -> None:
        """Cancel keepalive task and close the WebSocket connection."""
        if self._keepalive_task is not None:
            self._keepalive_task.cancel()
            try:
                await self._keepalive_task
            except asyncio.CancelledError:
                pass
            self._keepalive_task = None

        if self._ws is not None:
            await self._ws.close()
            self._ws = None
            logger.debug("TTS connection closed")

    @property
    def is_configured(self) -> bool:
        """True if configure() has been called (reconnect handles closed sockets)."""
        return self._voice_id is not None

    def start_keepalive(self) -> asyncio.Task:
        """Start the keepalive background task. Returns the task."""
        self._keepalive_task = asyncio.create_task(self.keepalive())
        return self._keepalive_task
