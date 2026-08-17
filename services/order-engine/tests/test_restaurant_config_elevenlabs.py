"""Unit tests for RestaurantConfig's ElevenLabs voice ID fields (Task 5).

psycopg2.connect is mocked so no real DB connection is made.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from voice_agent.restaurant_config import load_restaurant_config


def _row(elevenlabs_voice_id=None, elevenlabs_fallback_voice_id=None):
    return (
        "uuid-1",
        "silver-ssc-hyd",
        "Silver Specialty Coffee Hyderabad",
        "en-IN",
        "rohan",
        "hi-IN",
        "ishita",
        "persona text",
        elevenlabs_voice_id,
        elevenlabs_fallback_voice_id,
    )


def _mock_conn(rows: list[tuple]) -> MagicMock:
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = rows
    conn.cursor.return_value = cur
    return conn


def test_load_restaurant_config_includes_elevenlabs_voice_ids():
    conn = _mock_conn(
        [_row("pNInz6obpgDQGcFmaJgB", "21m00Tcm4TlvDq8ikWAM")]
    )

    with patch("psycopg2.connect", return_value=conn):
        configs = load_restaurant_config("postgresql://fake")

    cfg = configs["silver-ssc-hyd"]
    assert cfg.elevenlabs_voice_id == "pNInz6obpgDQGcFmaJgB"
    assert cfg.elevenlabs_fallback_voice_id == "21m00Tcm4TlvDq8ikWAM"


def test_load_restaurant_config_elevenlabs_voice_ids_default_to_none():
    conn = _mock_conn([_row()])

    with patch("psycopg2.connect", return_value=conn):
        configs = load_restaurant_config("postgresql://fake")

    cfg = configs["silver-ssc-hyd"]
    assert cfg.elevenlabs_voice_id is None
    assert cfg.elevenlabs_fallback_voice_id is None
