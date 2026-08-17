"""Unit tests for ElevenLabsTTSHandler.

Uses mocked WebSockets so no real ElevenLabs API calls are made.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest

from voice_agent.elevenlabs_tts_handler import ElevenLabsTTSHandler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_elevenlabs_tts_ws(recv_messages: list) -> AsyncMock:
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
async def test_configure_sends_initialize_connection():
    """configure() must open the voice_id-scoped WS and send InitializeConnection."""
    ws = make_elevenlabs_tts_ws([])

    handler = ElevenLabsTTSHandler(api_key="test-key")

    with patch(
        "voice_agent.elevenlabs_tts_handler.websockets.connect",
        new_callable=AsyncMock,
    ) as mock_connect:
        mock_connect.return_value = ws

        await handler.configure(language_code="hi-IN", speaker="pNInz6obpgDQGcFmaJgB")

    assert mock_connect.call_count == 1
    connect_url = mock_connect.call_args.args[0]
    assert "/text-to-speech/pNInz6obpgDQGcFmaJgB/stream-input" in connect_url
    assert "output_format=pcm_24000" in connect_url
    assert "model_id=eleven_flash_v2_5" in connect_url

    assert ws.send.call_count == 1
    init_msg = json.loads(ws.send.call_args.args[0])
    assert init_msg["text"] == " "


@pytest.mark.asyncio
async def test_speak_yields_audio_chunks():
    """speak() should yield decoded audio chunks until isFinal:true, per AudioOutput/FinalOutput."""
    import base64

    audio1 = b"\x01\x02\x03\x04"
    audio2 = b"\x05\x06\x07\x08"
    frame1 = json.dumps({"audio": base64.b64encode(audio1).decode()})
    frame2 = json.dumps({"audio": base64.b64encode(audio2).decode()})
    final = json.dumps({"isFinal": True})

    ws = make_elevenlabs_tts_ws([frame1, frame2, final])

    handler = ElevenLabsTTSHandler(api_key="test-key")
    handler._ws = ws  # bypass configure()
    handler._language_code = "hi-IN"
    handler._voice_id = "pNInz6obpgDQGcFmaJgB"

    chunks = []
    async for chunk in handler.speak("Butter chicken, done!"):
        chunks.append(chunk)

    assert chunks == [audio1, audio2]


@pytest.mark.asyncio
async def test_speak_sends_text_with_flush():
    """speak() must send a SendText message with flush:true (ElevenLabs wire protocol)."""
    final = json.dumps({"isFinal": True})
    ws = make_elevenlabs_tts_ws([final])

    handler = ElevenLabsTTSHandler(api_key="test-key")
    handler._ws = ws
    handler._language_code = "hi-IN"
    handler._voice_id = "pNInz6obpgDQGcFmaJgB"

    async for _ in handler.speak("Hello"):
        pass

    assert ws.send.call_count == 2
    text_msg = json.loads(ws.send.call_args_list[0].args[0])
    assert text_msg["text"] == "Hello"
    assert text_msg["flush"] is True

    close_msg = json.loads(ws.send.call_args_list[1].args[0])
    assert close_msg["text"] == ""


@pytest.mark.asyncio
async def test_keepalive_sends_ping():
    """keepalive() should call ws.ping() after the sleep interval."""
    ws = make_elevenlabs_tts_ws([])
    handler = ElevenLabsTTSHandler(api_key="test-key")
    handler._ws = ws

    call_count = 0

    async def fake_sleep(n):
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            raise asyncio.CancelledError

    with patch("voice_agent.elevenlabs_tts_handler.asyncio.sleep", side_effect=fake_sleep):
        await handler.keepalive()

    ws.ping.assert_called_once()


@pytest.mark.asyncio
async def test_close_cancels_keepalive_task_and_closes_ws():
    """close() should cancel the keepalive task and close the WS."""
    ws = make_elevenlabs_tts_ws([])
    handler = ElevenLabsTTSHandler(api_key="test-key")
    handler._ws = ws

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
    handler = ElevenLabsTTSHandler(api_key="test-key")

    with pytest.raises(RuntimeError, match="not configured"):
        async for _ in handler.speak("hello"):
            pass


@pytest.mark.asyncio
async def test_is_configured_reflects_configure_call():
    """is_configured is False before configure(), True after."""
    handler = ElevenLabsTTSHandler(api_key="test-key")
    assert handler.is_configured is False

    ws = make_elevenlabs_tts_ws([])
    with patch(
        "voice_agent.elevenlabs_tts_handler.websockets.connect",
        new_callable=AsyncMock,
    ) as mock_connect:
        mock_connect.return_value = ws
        await handler.configure(language_code="hi-IN", speaker="pNInz6obpgDQGcFmaJgB")

    assert handler.is_configured is True
