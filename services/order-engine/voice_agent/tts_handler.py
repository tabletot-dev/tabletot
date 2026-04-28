"""Sarvam TTS WebSocket handler.

Persistent WebSocket per table session.
- configure() called once on session start
- speak() converts text to audio, streams chunks back
- keepalive() sends ping every 30s (run as background asyncio.Task)
- close() gracefully shuts down
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
from websockets.asyncio.client import ClientConnection

logger = logging.getLogger(__name__)

# macOS Python from python.org ships without system CA certs.
# Use certifi's bundle so WSS connections to api.sarvam.ai verify correctly.
_SSL_CTX = ssl.create_default_context(cafile=certifi.where())

_SARVAM_TTS_URL = (
    "wss://api.sarvam.ai/text-to-speech/ws"
    "?model=bulbul:v3"
    "&send_completion_event=True"
)
_KEEPALIVE_INTERVAL = 30  # seconds


class SarvamTTSHandler:
    """Persistent Sarvam TTS WebSocket for one table session."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._ws: ClientConnection | None = None
        self._keepalive_task: asyncio.Task | None = None
        # Stored for reconnection after idle-timeout closes
        self._language_code: str | None = None
        self._speaker: str | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def configure(self, language_code: str, speaker: str) -> None:
        """Open the WebSocket, send the one-time config message, and store
        config params so speak() can reconnect if Sarvam closes due to inactivity.
        """
        self._language_code = language_code
        self._speaker = speaker
        await self._open_and_configure()

    async def speak(self, text: str) -> AsyncGenerator[bytes, None]:
        """Send text to TTS and yield raw PCM audio chunks as they arrive.

        Reconnects automatically if Sarvam closed the WebSocket due to
        inactivity between configure() and this call.

        Sends a convert message followed by flush, then yields binary frames
        until a completion event is received.
        """
        if self._language_code is None:
            raise RuntimeError("TTS handler not configured — call configure() first")

        await self._ensure_connected()

        await self._ws.send(  # type: ignore[union-attr]
            json.dumps({"type": "text", "data": {"text": text}})
        )
        await self._ws.send(json.dumps({"type": "flush"}))
        logger.debug("TTS speak: %r", text[:60])

        while True:
            try:
                msg = await self._ws.recv()
            except websockets.exceptions.ConnectionClosedOK:
                # Sarvam closes the connection when speech is done.
                logger.debug("TTS speak: connection closed by server (complete)")
                break
            except websockets.exceptions.ConnectionClosed as e:
                logger.warning("TTS speak: unexpected connection close: %s", e)
                raise
            if isinstance(msg, bytes):
                # Not used by Sarvam v3 (audio arrives as base64 JSON), but
                # forward any raw frames for forward compatibility.
                yield msg
                continue
            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                logger.debug("TTS speak: non-JSON server message: %r", msg[:120])
                continue
            msg_type = data.get("type", "")
            if msg_type == "audio":
                audio_b64 = data.get("data", {}).get("audio")
                if audio_b64:
                    try:
                        yield base64.b64decode(audio_b64)
                    except (ValueError, TypeError) as e:
                        logger.warning("TTS speak: bad base64 audio payload: %s", e)
            elif msg_type == "event":
                if data.get("data", {}).get("event_type") == "final":
                    logger.debug("TTS speak: final event received")
                    break
            elif msg_type == "error":
                logger.error("TTS speak: server error: %s", msg[:500])
                break
            else:
                logger.info("TTS speak: server message type=%r data=%s", msg_type, msg[:200])

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _open_and_configure(self) -> None:
        """Open a fresh WebSocket to Sarvam and send the config message."""
        self._ws = await websockets.connect(
            _SARVAM_TTS_URL,
            additional_headers={"api-subscription-key": self._api_key},
            ssl=_SSL_CTX,
        )
        config_msg = json.dumps(
            {
                "type": "config",
                "data": {
                    "speaker": self._speaker,
                    "target_language_code": self._language_code,
                    "pace": 1.0,
                    "min_buffer_size": 50,
                    "max_chunk_length": 150,
                    "output_audio_codec": "linear16",
                },
            }
        )
        await self._ws.send(config_msg)
        logger.info(
            "TTS (re)configured: language=%s speaker=%s",
            self._language_code,
            self._speaker,
        )

        # Sarvam sends a response to the config before it will accept a convert.
        # Consume it here so speak() starts with a clean receive queue.
        try:
            ack = await asyncio.wait_for(self._ws.recv(), timeout=5.0)
            logger.info("TTS config server response: %s", ack)
        except asyncio.TimeoutError:
            logger.debug("TTS config: no server response within timeout — proceeding")
        except Exception as e:
            logger.warning("TTS config ack error: %s", e)

    async def _ensure_connected(self) -> None:
        """Reconnect if Sarvam closed the WebSocket due to inactivity."""
        from websockets.protocol import State

        if self._ws is None or self._ws.state in (State.CLOSING, State.CLOSED):
            logger.info("TTS WebSocket closed — reconnecting")
            # Restart keepalive for the new connection.
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
        return self._language_code is not None

    def start_keepalive(self) -> asyncio.Task:
        """Start the keepalive background task. Returns the task."""
        self._keepalive_task = asyncio.create_task(self.keepalive())
        return self._keepalive_task
