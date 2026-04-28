"""Unit tests for SarvamSTTHandler.

Uses mocked WebSockets so no real Sarvam API calls are made.
"""

from __future__ import annotations

import base64
import json
from unittest.mock import AsyncMock, patch

import pytest

from voice_agent.stt_handler import SarvamSTTHandler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_client_ws(messages: list) -> AsyncMock:
    """Build a mock FastAPI WebSocket that returns messages in sequence."""
    ws = AsyncMock()
    ws.receive.side_effect = messages
    ws.send_json = AsyncMock()
    return ws


def make_sarvam_ws(messages: list) -> AsyncMock:
    """Build a mock Sarvam WebSocket that returns messages in sequence."""
    ws = AsyncMock()
    ws.recv.side_effect = messages
    ws.send = AsyncMock()
    return ws


def _ws_receive_bytes(data: bytes) -> dict:
    return {"type": "websocket.receive", "bytes": data, "text": None}


def _ws_receive_text(text: str) -> dict:
    return {"type": "websocket.receive", "bytes": None, "text": text}


def _sarvam_data(transcript: str) -> str:
    return json.dumps({"type": "data", "data": {"transcript": transcript}})


def _sarvam_event(signal: str) -> str:
    return json.dumps({"type": "events", "data": {"signal_type": signal}})


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pcm_bytes_wrapped_as_base64_json():
    """Binary frames from client should be base64-encoded inside Sarvam's JSON envelope."""
    pcm = b"\x00\x01" * 100

    client_ws = make_client_ws(
        [
            _ws_receive_bytes(pcm),
            _ws_receive_text(json.dumps({"type": "flush"})),
        ]
    )

    sarvam_ws = make_sarvam_ws([_sarvam_data("hello")])

    handler = SarvamSTTHandler(api_key="test-key")

    with patch("voice_agent.stt_handler.websockets.connect") as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=sarvam_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.transcribe_session(client_ws)

    # Find the audio frame send call
    audio_frames = []
    for call in sarvam_ws.send.call_args_list:
        payload = call.args[0]
        if not isinstance(payload, str):
            continue
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if "audio" in parsed:
            audio_frames.append(parsed["audio"])

    assert len(audio_frames) == 1
    frame = audio_frames[0]
    assert frame["sample_rate"] == "16000"
    assert frame["encoding"] == "audio/wav"
    assert base64.b64decode(frame["data"]) == pcm


@pytest.mark.asyncio
async def test_flush_signal_forwarded_to_sarvam():
    """Client {'type': 'flush'} JSON must trigger Sarvam flush."""
    client_ws = make_client_ws(
        [
            _ws_receive_text(json.dumps({"type": "flush"})),
        ]
    )
    sarvam_ws = make_sarvam_ws([_sarvam_data("done")])

    handler = SarvamSTTHandler(api_key="test-key")

    with patch("voice_agent.stt_handler.websockets.connect") as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=sarvam_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.transcribe_session(client_ws)

    flush_sent = any(
        '"flush"' in str(call) for call in sarvam_ws.send.call_args_list
    )
    assert flush_sent, "Flush message was not forwarded to Sarvam"


@pytest.mark.asyncio
async def test_interim_transcript_forwarded_to_client():
    """Pre-flush data messages should be forwarded to client as {'type': 'interim'}."""
    import asyncio

    # Gates to serialize the mocks in realistic order:
    # audio → sarvam interim → client releases flush → sarvam final.
    interim_delivered = asyncio.Event()
    flush_forwarded = asyncio.Event()

    async def client_receive():
        if not client_receive.sent_audio:
            client_receive.sent_audio = True
            return _ws_receive_bytes(b"\x00\x01" * 50)
        await interim_delivered.wait()
        return _ws_receive_text(json.dumps({"type": "flush"}))

    client_receive.sent_audio = False

    sarvam_sent_calls = []

    async def sarvam_send(msg):
        sarvam_sent_calls.append(msg)
        if isinstance(msg, str) and '"flush"' in msg:
            flush_forwarded.set()

    async def sarvam_recv():
        if not sarvam_recv.sent_interim:
            sarvam_recv.sent_interim = True
            return _sarvam_data("ek na")
        await flush_forwarded.wait()
        return _sarvam_data("ek naan")

    sarvam_recv.sent_interim = False

    client_ws = AsyncMock()
    client_ws.receive = AsyncMock(side_effect=client_receive)
    send_json_calls = []

    async def client_send_json(msg):
        send_json_calls.append(msg)
        if msg.get("type") == "interim":
            interim_delivered.set()

    client_ws.send_json = client_send_json

    sarvam_ws = AsyncMock()
    sarvam_ws.send = sarvam_send
    sarvam_ws.recv = sarvam_recv

    handler = SarvamSTTHandler(api_key="test-key")

    with patch("voice_agent.stt_handler.websockets.connect") as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=sarvam_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.transcribe_session(client_ws)

    types = [m.get("type") for m in send_json_calls]
    assert "interim" in types, f"No interim message sent. Got: {send_json_calls}"
    assert "final" in types, f"No final message sent. Got: {send_json_calls}"


@pytest.mark.asyncio
async def test_final_transcript_returned():
    """transcribe_session() should return the last transcript string."""
    client_ws = make_client_ws(
        [
            _ws_receive_text(json.dumps({"type": "flush"})),
        ]
    )
    sarvam_ws = make_sarvam_ws([_sarvam_data("ek butter chicken dena")])

    handler = SarvamSTTHandler(api_key="test-key")

    with patch("voice_agent.stt_handler.websockets.connect") as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=sarvam_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await handler.transcribe_session(client_ws)

    assert result == "ek butter chicken dena"


@pytest.mark.asyncio
async def test_vad_events_forwarded_to_client():
    """START_SPEECH and END_SPEECH events should be mapped to speech_start/speech_end."""
    client_ws = make_client_ws(
        [
            _ws_receive_text(json.dumps({"type": "flush"})),
        ]
    )
    sarvam_ws = make_sarvam_ws(
        [
            _sarvam_event("START_SPEECH"),
            _sarvam_event("END_SPEECH"),
            _sarvam_data("hello"),
        ]
    )

    handler = SarvamSTTHandler(api_key="test-key")

    with patch("voice_agent.stt_handler.websockets.connect") as mock_connect:
        mock_connect.return_value.__aenter__ = AsyncMock(return_value=sarvam_ws)
        mock_connect.return_value.__aexit__ = AsyncMock(return_value=False)

        await handler.transcribe_session(client_ws)

    sent = [call.args[0] for call in client_ws.send_json.call_args_list]
    event_types = {m.get("type") for m in sent}
    assert "speech_start" in event_types
    assert "speech_end" in event_types
