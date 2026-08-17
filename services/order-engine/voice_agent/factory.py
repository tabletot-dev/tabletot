"""STT/TTS provider factory.

Same pattern as src/llm/__init__.py:create_provider — a provider_name switch,
no ABC (the Sarvam handlers aren't under one either; see the plan's
Architecture section for why one isn't added here).
"""

from __future__ import annotations

from voice_agent.elevenlabs_stt_handler import ElevenLabsSTTHandler
from voice_agent.elevenlabs_tts_handler import ElevenLabsTTSHandler
from voice_agent.stt_handler import SarvamSTTHandler
from voice_agent.tts_handler import SarvamTTSHandler


def create_stt_handler(
    provider_name: str, sarvam_api_key: str, elevenlabs_api_key: str
) -> SarvamSTTHandler | ElevenLabsSTTHandler:
    if provider_name == "elevenlabs":
        return ElevenLabsSTTHandler(elevenlabs_api_key)
    elif provider_name == "sarvam":
        return SarvamSTTHandler(sarvam_api_key)
    else:
        raise ValueError(f"Unknown STT provider: {provider_name}")


def create_tts_handler(
    provider_name: str, sarvam_api_key: str, elevenlabs_api_key: str
) -> SarvamTTSHandler | ElevenLabsTTSHandler:
    if provider_name == "elevenlabs":
        return ElevenLabsTTSHandler(elevenlabs_api_key)
    elif provider_name == "sarvam":
        return SarvamTTSHandler(sarvam_api_key)
    else:
        raise ValueError(f"Unknown TTS provider: {provider_name}")
