"""Unit tests for ElevenLabsSTTHandler.

Uses mocked WebSockets so no real ElevenLabs API calls are made.
"""

from __future__ import annotations

import base64
import json
from unittest.mock import AsyncMock, patch

import pytest
from websockets.exceptions import ConnectionClosedOK

from voice_agent.elevenlabs_stt_handler import ElevenLabsSTTHandler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_client_ws(messages: list) -> AsyncMock:
    """Build a mock FastAPI WebSocket that returns messages in sequence."""
    ws = AsyncMock()
    ws.receive.side_effect = messages
    ws.send_json = AsyncMock()
    return ws


def make_elevenlabs_ws(messages: list) -> AsyncMock:
    """Build a mock ElevenLabs WebSocket that returns messages in sequence."""
    ws = AsyncMock()
    ws.recv.side_effect = messages
    ws.send = AsyncMock()
    return ws


def _ws_receive_bytes(data: bytes) -> dict:
    return {"type": "websocket.receive", "bytes": data, "text": None}


def _ws_receive_text(text: str) -> dict:
    return {"type": "websocket.receive", "bytes": None, "text": text}


def _partial_transcript(text: str) -> str:
    return json.dumps({"message_type": "partial_transcript", "text": text})


def _committed_transcript(text: str) -> str:
    return json.dumps({"message_type": "committed_transcript", "text": text})


def _session_started() -> str:
    return json.dumps(
        {"message_type": "session_started", "session_id": "sess-1", "config": {}}
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pcm_bytes_wrapped_as_input_audio_chunk():
    """Binary frames from client should become input_audio_chunk messages, commit=false."""
    pcm = b"\x00\x01" * 100

    client_ws = make_client_ws(
        [
            _ws_receive_bytes(pcm),
            _ws_receive_text(json.dumps({"type": "flush"})),
        ]
    )
    elevenlabs_ws = make_elevenlabs_ws([_committed_transcript("hello")])

    handler = ElevenLabsSTTHandler(api_key="test-key")

    with patch(
        "voice_agent.elevenlabs_stt_handler.websockets.connect"
    ) as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=elevenlabs_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.transcribe_session(client_ws)

    audio_chunks = []
    for call in elevenlabs_ws.send.call_args_list:
        payload = call.args[0]
        try:
            parsed = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            continue
        if parsed.get("message_type") == "input_audio_chunk" and parsed.get(
            "audio_base_64"
        ):
            audio_chunks.append(parsed)

    assert len(audio_chunks) == 1
    chunk = audio_chunks[0]
    assert chunk["commit"] is False
    assert chunk["sample_rate"] == 16000
    assert base64.b64decode(chunk["audio_base_64"]) == pcm


@pytest.mark.asyncio
async def test_flush_sends_commit_true_to_elevenlabs():
    """Client {'type': 'flush'} JSON must trigger a commit=true input_audio_chunk."""
    client_ws = make_client_ws(
        [
            _ws_receive_text(json.dumps({"type": "flush"})),
        ]
    )
    elevenlabs_ws = make_elevenlabs_ws([_committed_transcript("done")])

    handler = ElevenLabsSTTHandler(api_key="test-key")

    with patch(
        "voice_agent.elevenlabs_stt_handler.websockets.connect"
    ) as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=elevenlabs_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.transcribe_session(client_ws)

    committed = False
    for call in elevenlabs_ws.send.call_args_list:
        payload = call.args[0]
        try:
            parsed = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            continue
        if (
            parsed.get("message_type") == "input_audio_chunk"
            and parsed.get("commit") is True
        ):
            committed = True

    assert committed, "No commit=true input_audio_chunk was sent to ElevenLabs"


@pytest.mark.asyncio
async def test_partial_transcript_forwarded_as_interim():
    """partial_transcript messages should be forwarded to client as {'type': 'interim'}."""
    client_ws = make_client_ws(
        [
            _ws_receive_text(json.dumps({"type": "flush"})),
        ]
    )
    elevenlabs_ws = make_elevenlabs_ws(
        [
            _session_started(),
            _partial_transcript("ek na"),
            _committed_transcript("ek naan"),
        ]
    )

    handler = ElevenLabsSTTHandler(api_key="test-key")

    with patch(
        "voice_agent.elevenlabs_stt_handler.websockets.connect"
    ) as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=elevenlabs_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.transcribe_session(client_ws)

    sent = [call.args[0] for call in client_ws.send_json.call_args_list]
    interim = [m for m in sent if m.get("type") == "interim"]
    assert interim, f"No interim message sent. Got: {sent}"
    assert interim[0]["text"] == "ek na"


@pytest.mark.asyncio
async def test_final_transcript_returned():
    """transcribe_session() should return the committed transcript string."""
    client_ws = make_client_ws(
        [
            _ws_receive_text(json.dumps({"type": "flush"})),
        ]
    )
    elevenlabs_ws = make_elevenlabs_ws(
        [_session_started(), _committed_transcript("ek butter chicken dena")]
    )

    handler = ElevenLabsSTTHandler(api_key="test-key")

    with patch(
        "voice_agent.elevenlabs_stt_handler.websockets.connect"
    ) as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=elevenlabs_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await handler.transcribe_session(client_ws)

    assert result == "ek butter chicken dena"


@pytest.mark.asyncio
async def test_client_disconnect_before_any_transcript_returns_none():
    """No committed transcript before disconnect should return None, not raise."""
    client_ws = make_client_ws(
        [
            {"type": "websocket.disconnect"},
        ]
    )
    elevenlabs_ws = make_elevenlabs_ws([_session_started(), ConnectionClosedOK(None, None)])

    handler = ElevenLabsSTTHandler(api_key="test-key")

    with patch(
        "voice_agent.elevenlabs_stt_handler.websockets.connect"
    ) as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=elevenlabs_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await handler.transcribe_session(client_ws)

    assert result is None
