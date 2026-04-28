"""Voice session lifecycle manager.

Each table session owns:
- A persistent SarvamTTSHandler (WebSocket open for the duration)
- An Orchestrator instance (LLM + resolver + order state)
- A tts_queue (asyncio.Queue) used to pass response text from the STT
  endpoint to the TTS endpoint without coupling the two WebSocket handlers.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from src.llm import create_provider
from src.loader import MenuIndex, load_menu
from src.orchestrator import Orchestrator
from voice_agent.restaurant_config import RestaurantConfig
from voice_agent.tts_handler import SarvamTTSHandler

logger = logging.getLogger(__name__)


@dataclass
class VoiceSession:
    session_id: str
    table_id: str
    restaurant_id: str
    tts_handler: SarvamTTSHandler
    orchestrator: Orchestrator
    tts_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    keepalive_task: asyncio.Task | None = None


class SessionManager:
    """In-memory store of active voice sessions.

    Created once at app startup and shared across all requests via
    app.state.session_manager.
    """

    def __init__(
        self,
        restaurant_configs: dict[str, RestaurantConfig],
        sarvam_api_key: str,
        anthropic_api_key: str,
        menus: dict[str, tuple[dict, MenuIndex]],
    ) -> None:
        self._sessions: dict[str, VoiceSession] = {}
        self._configs = restaurant_configs
        self._sarvam_api_key = sarvam_api_key
        self._anthropic_api_key = anthropic_api_key
        self._menus = menus

    async def create_session(
        self, table_id: str, restaurant_id: str
    ) -> VoiceSession:
        """Create a new voice session.

        The TTS WebSocket is NOT opened here — it is opened lazily when the
        client connects to /voice/tts/{session_id}. This keeps session start
        fast and avoids a 500 if Sarvam is temporarily unreachable.

        Raises KeyError if restaurant_id is not in the config.
        """
        _ = self._configs[restaurant_id]  # validate restaurant_id early
        session_id = uuid.uuid4().hex

        menu_data, menu_index = self._menus[restaurant_id]
        provider = create_provider("claude", self._anthropic_api_key)
        orchestrator = Orchestrator(provider, menu_index, menu_data)

        # TTS handler created but NOT yet configured — lazy init on first TTS WS connect
        tts_handler = SarvamTTSHandler(self._sarvam_api_key)

        session = VoiceSession(
            session_id=session_id,
            table_id=table_id,
            restaurant_id=restaurant_id,
            tts_handler=tts_handler,
            orchestrator=orchestrator,
        )
        self._sessions[session_id] = session
        logger.info(
            "Session created: %s table=%s restaurant=%s",
            session_id,
            table_id,
            restaurant_id,
        )
        return session

    def get_session(self, session_id: str) -> VoiceSession | None:
        """Return the session for session_id, or None if not found."""
        return self._sessions.get(session_id)

    async def end_session(self, session_id: str) -> None:
        """Close the TTS WebSocket, cancel keepalive, remove session."""
        session = self._sessions.pop(session_id, None)
        if session is None:
            return
        # Signal the TTS endpoint loop to exit
        await session.tts_queue.put(None)
        await session.tts_handler.close()
        logger.info("Session ended: %s", session_id)

    async def end_all_sessions(self) -> None:
        """Gracefully end all active sessions (called on app shutdown)."""
        for session_id in list(self._sessions):
            await self.end_session(session_id)
