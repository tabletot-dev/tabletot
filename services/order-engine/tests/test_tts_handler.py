"""Unit tests for SarvamTTSHandler.

Uses mocked WebSockets so no real Sarvam API calls are made.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from voice_agent.tts_handler import SarvamTTSHandler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_sarvam_tts_ws(recv_messages: list) -> AsyncMock:
    ws = AsyncMock()
    ws.recv.side_effect = recv_messages
    ws.send = AsyncMock()
    ws.ping = AsyncMock()
    ws.close = AsyncMock()
    return ws


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_configure_sends_correct_config_message():
    """configure() must open WS and send the correct JSON config message."""
    ws = make_sarvam_tts_ws([])

    handler = SarvamTTSHandler(api_key="test-key")

    # Use AsyncMock so that `await websockets.connect(...)` returns `ws`
    with patch(
        "voice_agent.tts_handler.websockets.connect",
        new_callable=AsyncMock,
    ) as mock_connect:
        mock_connect.return_value = ws

        await handler.configure(language_code="hi-IN", speaker="meera")

    # Verify connect was called with correct URL
    assert mock_connect.call_count == 1
    connect_url = mock_connect.call_args.args[0]
    assert "bulbul:v3" in connect_url
    assert "send_completion_event=True" in connect_url

    # Verify config message was sent
    assert ws.send.call_count == 1
    config_msg = json.loads(ws.send.call_args.args[0])
    assert config_msg["type"] == "config"
    assert config_msg["data"]["speaker"] == "meera"
    assert config_msg["data"]["target_language_code"] == "hi-IN"
    assert config_msg["data"]["output_audio_codec"] == "linear16"
    # bulbul:v3 must NOT have pitch or loudness
    assert "pitch" not in config_msg["data"]
    assert "loudness" not in config_msg["data"]


@pytest.mark.asyncio
async def test_speak_yields_audio_chunks():
    """speak() should yield decoded audio chunks from Sarvam's base64 JSON frames.

    Sarvam v3 sends audio as text frames of the form
    ``{"type": "audio", "data": {"audio": "<base64>"}}`` and terminates with
    ``{"type": "event", "data": {"event_type": "final"}}``.
    """
    import base64

    audio1 = b"\x01\x02\x03\x04"
    audio2 = b"\x05\x06\x07\x08"
    frame1 = json.dumps({"type": "audio", "data": {"audio": base64.b64encode(audio1).decode()}})
    frame2 = json.dumps({"type": "audio", "data": {"audio": base64.b64encode(audio2).decode()}})
    final = json.dumps({"type": "event", "data": {"event_type": "final"}})

    ws = make_sarvam_tts_ws([frame1, frame2, final])

    handler = SarvamTTSHandler(api_key="test-key")
    handler._ws = ws  # bypass configure()
    handler._language_code = "hi-IN"
    handler._speaker = "meera"

    chunks = []
    async for chunk in handler.speak("Butter chicken, done!"):
        chunks.append(chunk)

    assert chunks == [audio1, audio2]


@pytest.mark.asyncio
async def test_speak_sends_text_and_flush():
    """speak() must send a text message then a flush message (Sarvam wire protocol)."""
    final = json.dumps({"type": "event", "data": {"event_type": "final"}})
    ws = make_sarvam_tts_ws([final])

    handler = SarvamTTSHandler(api_key="test-key")
    handler._ws = ws
    handler._language_code = "hi-IN"
    handler._speaker = "meera"

    async for _ in handler.speak("Hello"):
        pass

    assert ws.send.call_count == 2
    first_msg = json.loads(ws.send.call_args_list[0].args[0])
    second_msg = json.loads(ws.send.call_args_list[1].args[0])
    assert first_msg["type"] == "text"
    assert first_msg["data"]["text"] == "Hello"
    assert second_msg["type"] == "flush"


@pytest.mark.asyncio
async def test_keepalive_sends_ping():
    """keepalive() should call ws.ping() after the sleep interval."""
    ws = make_sarvam_tts_ws([])
    handler = SarvamTTSHandler(api_key="test-key")
    handler._ws = ws

    call_count = 0

    async def fake_sleep(n):
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            # Stop the loop after first ping cycle
            raise asyncio.CancelledError

    with patch("voice_agent.tts_handler.asyncio.sleep", side_effect=fake_sleep):
        # keepalive catches CancelledError and returns normally
        await handler.keepalive()

    # ping() must have been called once (after first sleep)
    ws.ping.assert_called_once()


@pytest.mark.asyncio
async def test_close_cancels_keepalive_task_and_closes_ws():
    """close() should cancel the keepalive task and close the WS."""
    ws = make_sarvam_tts_ws([])
    handler = SarvamTTSHandler(api_key="test-key")
    handler._ws = ws

    # Create a keepalive task that just sleeps forever
    async def _forever():
        await asyncio.sleep(10000)

    handler._keepalive_task = asyncio.create_task(_forever())

    await handler.close()

    assert ws.close.called
    assert handler._ws is None
    assert handler._keepalive_task is None


@pytest.mark.asyncio
async def test_speak_raises_if_not_configured():
    """speak() must raise RuntimeError if configure() was not called."""
    handler = SarvamTTSHandler(api_key="test-key")

    with pytest.raises(RuntimeError, match="not configured"):
        async for _ in handler.speak("hello"):
            pass
