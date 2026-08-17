"""Unit tests for SessionManager's STT/TTS provider selection (Task 4).

Uses minimal in-memory menu fixtures instead of test_session_manager.py's
DB-backed ones — create_session() only stores menu_data/menu_index and hands
them to Orchestrator, which reads menu_data via generate_menu_summary()
(tolerant of an empty dict) and never touches menu_index directly at
construction time.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from voice_agent.elevenlabs_tts_handler import ElevenLabsTTSHandler
from voice_agent.restaurant_config import RestaurantConfig
from voice_agent.session_manager import SessionManager
from voice_agent.tts_handler import SarvamTTSHandler

_CONFIGS = {
    "silver-ssc-hyd": RestaurantConfig(
        name="Silver Specialty Coffee Hyderabad",
        language_code="hi-IN",
        speaker="meera",
        menu_path="menus/silver-ssc-hyd.json",
    )
}
_MENUS = {"silver-ssc-hyd": ({}, MagicMock())}


def _mgr(**overrides) -> SessionManager:
    kwargs = dict(
        restaurant_configs=_CONFIGS,
        sarvam_api_key="sarvam-key",
        anthropic_api_key="anthropic-key",
        menus=_MENUS,
    )
    kwargs.update(overrides)
    return SessionManager(**kwargs)


def test_stt_and_tts_provider_default_to_elevenlabs():
    mgr = _mgr()
    assert mgr._tts_provider == "elevenlabs"
    assert mgr._stt_provider == "elevenlabs"


def test_elevenlabs_api_key_defaults_to_empty_string():
    mgr = _mgr()
    assert mgr._elevenlabs_api_key == ""


@pytest.mark.asyncio
async def test_create_session_uses_elevenlabs_tts_handler_when_configured():
    mgr = _mgr(elevenlabs_api_key="ek", tts_provider="elevenlabs")
    with patch("voice_agent.session_manager.create_provider", return_value=MagicMock()):
        session = await mgr.create_session("T-01", "silver-ssc-hyd")
    assert isinstance(session.tts_handler, ElevenLabsTTSHandler)


@pytest.mark.asyncio
async def test_create_session_uses_sarvam_tts_handler_when_configured():
    mgr = _mgr(tts_provider="sarvam")
    with patch("voice_agent.session_manager.create_provider", return_value=MagicMock()):
        session = await mgr.create_session("T-01", "silver-ssc-hyd")
    assert isinstance(session.tts_handler, SarvamTTSHandler)


@pytest.mark.asyncio
async def test_end_session_closes_whichever_handler_was_created():
    mgr = _mgr(tts_provider="elevenlabs")
    with patch("voice_agent.session_manager.create_provider", return_value=MagicMock()):
        session = await mgr.create_session("T-01", "silver-ssc-hyd")

    with patch.object(session.tts_handler, "close", new=AsyncMock()) as mock_close:
        await mgr.end_session(session.session_id)

    mock_close.assert_called_once()
