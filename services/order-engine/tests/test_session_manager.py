"""Unit tests for SessionManager and VoiceSession.

SarvamTTSHandler is fully mocked so no real WebSocket calls are made.
The Orchestrator is instantiated with a MockProvider so no LLM calls are made.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.loader import load_menu_data_from_db, load_menu_from_db
from voice_agent.restaurant_config import RestaurantConfig
from voice_agent.session_manager import SessionManager, VoiceSession

_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
_RESTAURANT_ID = "b22b5d53-6dd8-4f5b-8276-2e828cd1ab91"
_MENU_DATA = load_menu_data_from_db(_DB_URL, _RESTAURANT_ID)
_MENU_INDEX = load_menu_from_db(_DB_URL, _RESTAURANT_ID)

_CONFIGS = {
    "silver-ssc-hyd": RestaurantConfig(
        name="Silver Specialty Coffee Hyderabad",
        language_code="hi-IN",
        speaker="meera",
        menu_path="menus/silver-ssc-hyd.json",
    )
}

_MENUS = {"silver-ssc-hyd": (_MENU_DATA, _MENU_INDEX)}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_mock_tts_handler():
    """Return a fully mocked SarvamTTSHandler."""
    mock = AsyncMock()
    mock.configure = AsyncMock()
    mock.close = AsyncMock()
    mock.start_keepalive = MagicMock(return_value=asyncio.create_task(asyncio.sleep(0)))
    return mock


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_session_returns_voicesession():
    with patch("voice_agent.session_manager.SarvamTTSHandler", return_value=make_mock_tts_handler()):
        mgr = SessionManager(
            restaurant_configs=_CONFIGS,
            sarvam_api_key="sarvam-key",
            anthropic_api_key="anthropic-key",
            menus=_MENUS,
        )

        with patch("voice_agent.session_manager.create_provider") as mock_create:
            mock_create.return_value = MagicMock()
            session = await mgr.create_session("T-01", "silver-ssc-hyd")

    assert isinstance(session, VoiceSession)
    assert session.table_id == "T-01"
    assert session.restaurant_id == "silver-ssc-hyd"
    assert len(session.session_id) == 32  # uuid hex


@pytest.mark.asyncio
async def test_get_session_returns_none_for_unknown():
    mgr = SessionManager(
        restaurant_configs=_CONFIGS,
        sarvam_api_key="key",
        anthropic_api_key="key",
        menus=_MENUS,
    )
    assert mgr.get_session("nonexistent-id") is None


@pytest.mark.asyncio
async def test_get_session_returns_session_after_create():
    with patch("voice_agent.session_manager.SarvamTTSHandler", return_value=make_mock_tts_handler()):
        mgr = SessionManager(
            restaurant_configs=_CONFIGS,
            sarvam_api_key="key",
            anthropic_api_key="key",
            menus=_MENUS,
        )
        with patch("voice_agent.session_manager.create_provider") as mock_create:
            mock_create.return_value = MagicMock()
            session = await mgr.create_session("T-01", "silver-ssc-hyd")

    found = mgr.get_session(session.session_id)
    assert found is session


@pytest.mark.asyncio
async def test_end_session_removes_from_dict():
    mock_tts = make_mock_tts_handler()

    with patch("voice_agent.session_manager.SarvamTTSHandler", return_value=mock_tts):
        mgr = SessionManager(
            restaurant_configs=_CONFIGS,
            sarvam_api_key="key",
            anthropic_api_key="key",
            menus=_MENUS,
        )
        with patch("voice_agent.session_manager.create_provider") as mock_create:
            mock_create.return_value = MagicMock()
            session = await mgr.create_session("T-01", "silver-ssc-hyd")

    await mgr.end_session(session.session_id)

    assert mgr.get_session(session.session_id) is None


@pytest.mark.asyncio
async def test_end_session_calls_tts_close():
    mock_tts = make_mock_tts_handler()

    with patch("voice_agent.session_manager.SarvamTTSHandler", return_value=mock_tts):
        mgr = SessionManager(
            restaurant_configs=_CONFIGS,
            sarvam_api_key="key",
            anthropic_api_key="key",
            menus=_MENUS,
        )
        with patch("voice_agent.session_manager.create_provider") as mock_create:
            mock_create.return_value = MagicMock()
            session = await mgr.create_session("T-01", "silver-ssc-hyd")

    await mgr.end_session(session.session_id)

    mock_tts.close.assert_called_once()


@pytest.mark.asyncio
async def test_two_concurrent_sessions_have_independent_ids():
    def fresh_mock():
        return make_mock_tts_handler()

    with patch("voice_agent.session_manager.SarvamTTSHandler", side_effect=[fresh_mock(), fresh_mock()]):
        mgr = SessionManager(
            restaurant_configs=_CONFIGS,
            sarvam_api_key="key",
            anthropic_api_key="key",
            menus=_MENUS,
        )
        with patch("voice_agent.session_manager.create_provider") as mock_create:
            mock_create.return_value = MagicMock()
            s1 = await mgr.create_session("T-01", "silver-ssc-hyd")
            mock_create.return_value = MagicMock()
            s2 = await mgr.create_session("T-02", "silver-ssc-hyd")

    assert s1.session_id != s2.session_id
    assert s1.orchestrator is not s2.orchestrator


@pytest.mark.asyncio
async def test_end_session_nonexistent_is_noop():
    """Ending a session that doesn't exist should not raise."""
    mgr = SessionManager(
        restaurant_configs=_CONFIGS,
        sarvam_api_key="key",
        anthropic_api_key="key",
        menus=_MENUS,
    )
    await mgr.end_session("does-not-exist")  # should not raise
