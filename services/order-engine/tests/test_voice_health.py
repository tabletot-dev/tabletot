"""Unit tests for the dual-provider /voice/health endpoint (Task 4).

Both Sarvam and ElevenLabs reachability are checked so the health endpoint
still reflects real connectivity regardless of which provider is active via
STT_PROVIDER/TTS_PROVIDER.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers import voice as voice_router


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(voice_router.router)
    mgr = MagicMock()
    mgr._sarvam_api_key = "sarvam-key"
    mgr._elevenlabs_api_key = "elevenlabs-key"
    app.state.session_manager = mgr
    return app


def _ok_connect(*args, **kwargs):
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=MagicMock())
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _unreachable_connect(*args, **kwargs):
    raise ConnectionRefusedError("boom")


def test_health_ok_when_both_reachable():
    app = _make_app()
    with patch("backend.routers.voice.websockets.connect", side_effect=_ok_connect):
        resp = TestClient(app).get("/health")

    body = resp.json()
    assert body["status"] == "ok"
    assert body["sarvam"] == "reachable"
    assert body["elevenlabs"] == "reachable"


def test_health_degraded_when_both_unreachable():
    app = _make_app()
    with patch(
        "backend.routers.voice.websockets.connect", side_effect=_unreachable_connect
    ):
        resp = TestClient(app).get("/health")

    body = resp.json()
    assert body["status"] == "degraded"
    assert body["sarvam"] == "unreachable"
    assert body["elevenlabs"] == "unreachable"


def test_health_ok_when_only_one_provider_reachable():
    app = _make_app()

    def _connect(url, **kwargs):
        if "sarvam.ai" in url:
            return _ok_connect()
        raise ConnectionRefusedError("boom")

    with patch("backend.routers.voice.websockets.connect", side_effect=_connect):
        resp = TestClient(app).get("/health")

    body = resp.json()
    assert body["status"] == "ok"
    assert body["sarvam"] == "reachable"
    assert body["elevenlabs"] == "unreachable"
