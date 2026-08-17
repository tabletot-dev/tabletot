"""Unit tests for the STT/TTS provider factory (voice_agent/factory.py)."""

from __future__ import annotations

import pytest

from voice_agent.elevenlabs_stt_handler import ElevenLabsSTTHandler
from voice_agent.elevenlabs_tts_handler import ElevenLabsTTSHandler
from voice_agent.factory import create_stt_handler, create_tts_handler
from voice_agent.stt_handler import SarvamSTTHandler
from voice_agent.tts_handler import SarvamTTSHandler


def test_create_stt_handler_sarvam():
    handler = create_stt_handler("sarvam", sarvam_api_key="sk", elevenlabs_api_key="ek")
    assert isinstance(handler, SarvamSTTHandler)


def test_create_stt_handler_elevenlabs():
    handler = create_stt_handler(
        "elevenlabs", sarvam_api_key="sk", elevenlabs_api_key="ek"
    )
    assert isinstance(handler, ElevenLabsSTTHandler)


def test_create_stt_handler_unknown_provider_raises():
    with pytest.raises(ValueError, match="Unknown"):
        create_stt_handler("nope", sarvam_api_key="sk", elevenlabs_api_key="ek")


def test_create_tts_handler_sarvam():
    handler = create_tts_handler("sarvam", sarvam_api_key="sk", elevenlabs_api_key="ek")
    assert isinstance(handler, SarvamTTSHandler)


def test_create_tts_handler_elevenlabs():
    handler = create_tts_handler(
        "elevenlabs", sarvam_api_key="sk", elevenlabs_api_key="ek"
    )
    assert isinstance(handler, ElevenLabsTTSHandler)


def test_create_tts_handler_unknown_provider_raises():
    with pytest.raises(ValueError, match="Unknown"):
        create_tts_handler("nope", sarvam_api_key="sk", elevenlabs_api_key="ek")
