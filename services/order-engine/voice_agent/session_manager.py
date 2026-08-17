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
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from src.llm import create_provider
from src.loader import MenuIndex, load_menu
from src.menu_graph import MenuGraph
from src.orchestrator import Orchestrator
from voice_agent.elevenlabs_tts_handler import ElevenLabsTTSHandler
from voice_agent.factory import create_tts_handler
from voice_agent.restaurant_config import RestaurantConfig
from voice_agent.tts_handler import SarvamTTSHandler

if TYPE_CHECKING:
    import psycopg2.pool

logger = logging.getLogger(__name__)

# Sentinel: placed in tts_queue after all sentences of a turn have been enqueued.
# Tells the TTS loop to emit speech_complete without speaking additional text.
TURN_END = object()


@dataclass
class VoiceSession:
    session_id: str
    table_id: str
    restaurant_id: str
    restaurant_slug: str  # internal slug for config/menu lookups
    tts_handler: SarvamTTSHandler | ElevenLabsTTSHandler
    orchestrator: Orchestrator
    client_session_id: str | None = None
    tts_queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=20))
    current_turn_id: int = 0
    keepalive_task: asyncio.Task | None = None
    last_active_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


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
        provider_name: str = "claude",
        provider_api_key: str = "",
        provider_model: str | None = None,
        menu_graphs: dict[str, MenuGraph] | None = None,
        db_pool: "psycopg2.pool.ThreadedConnectionPool | None" = None,
        elevenlabs_api_key: str = "",
        stt_provider: str = "elevenlabs",
        tts_provider: str = "elevenlabs",
    ) -> None:
        self._sessions: dict[str, VoiceSession] = {}
        self._configs = restaurant_configs
        self._sarvam_api_key = sarvam_api_key
        self._anthropic_api_key = anthropic_api_key  # kept for backward compat
        self._menus = menus
        self._menu_graphs: dict[str, MenuGraph] = menu_graphs or {}
        self._provider_name = provider_name
        # Fall back to anthropic_api_key when provider is claude and no explicit key given
        self._provider_api_key = provider_api_key or anthropic_api_key
        self._provider_model = provider_model or None
        self._db_pool = db_pool
        self._elevenlabs_api_key = elevenlabs_api_key
        # stt_provider isn't used internally — STT handlers are created fresh
        # per PTT press by routers/voice.py, not held on the session.
        self._stt_provider = stt_provider
        self._tts_provider = tts_provider

    # ------------------------------------------------------------------
    # DB persistence helpers — all fire-and-forget, never block callers.
    # ------------------------------------------------------------------

    def _db_insert_session(self, session: "VoiceSession") -> None:
        """Synchronous insert; called via asyncio.to_thread."""
        if self._db_pool is None:
            return
        conn = self._db_pool.getconn()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO voice_sessions
                  (session_id, restaurant_id, table_id, client_session_key, status)
                VALUES (%s, %s, %s, %s, 'active')
                ON CONFLICT (session_id) DO NOTHING
                """,
                (
                    session.session_id,
                    session.restaurant_id,
                    session.table_id,
                    session.client_session_id,
                ),
            )
            conn.commit()
            cur.close()
        finally:
            self._db_pool.putconn(conn)

    def _db_update_status(self, session_id: str, status: str) -> None:
        """Synchronous status update; called via asyncio.to_thread."""
        if self._db_pool is None:
            return
        conn = self._db_pool.getconn()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE voice_sessions
                SET status = %s, ended_at = now()
                WHERE session_id = %s
                """,
                (status, session_id),
            )
            conn.commit()
            cur.close()
        finally:
            self._db_pool.putconn(conn)

    def _db_interrupt_stale(self) -> int:
        """Mark any rows still 'active' as 'interrupted' (previous crash).

        Returns the number of rows updated.
        """
        if self._db_pool is None:
            return 0
        conn = self._db_pool.getconn()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE voice_sessions
                SET status = 'interrupted', ended_at = now()
                WHERE status = 'active'
                """,
            )
            count = cur.rowcount
            conn.commit()
            cur.close()
            return count
        finally:
            self._db_pool.putconn(conn)

    async def startup_cleanup(self) -> None:
        """Mark lingering 'active' rows from a previous process as 'interrupted'.

        Call once during app lifespan startup, before accepting requests.
        """
        try:
            count = await asyncio.to_thread(self._db_interrupt_stale)
            if count:
                logger.info(
                    "startup_cleanup: marked %d stale voice session(s) as interrupted", count
                )
        except Exception as exc:
            logger.warning("startup_cleanup DB error (non-blocking): %s", exc)

    def _resolve_restaurant_slug(self, restaurant_id: str) -> str:
        """Resolve restaurant_id (slug or UUID) to internal slug key.

        First tries direct slug lookup, then searches by db_restaurant_id.
        Raises KeyError if not found.
        """
        if restaurant_id in self._configs:
            return restaurant_id
        for slug, cfg in self._configs.items():
            if cfg.db_restaurant_id == restaurant_id:
                return slug
        raise KeyError(restaurant_id)

    async def create_session(
        self, table_id: str, restaurant_id: str, client_session_id: str | None = None
    ) -> VoiceSession:
        """Create a new voice session.

        The TTS WebSocket is NOT opened here — it is opened lazily when the
        client connects to /voice/tts/{session_id}. This keeps session start
        fast and avoids a 500 if Sarvam is temporarily unreachable.

        Raises KeyError if restaurant_id is not in the config.
        """
        slug = self._resolve_restaurant_slug(restaurant_id)  # validate & resolve
        session_id = uuid.uuid4().hex

        cfg = self._configs[slug]
        menu_data, menu_index = self._menus[slug]
        menu_graph = self._menu_graphs.get(slug)
        provider = create_provider(self._provider_name, self._provider_api_key, self._provider_model)
        orchestrator = Orchestrator(
            provider, menu_index, menu_data,
            voice_persona=cfg.voice_persona,
            menu_graph=menu_graph,
        )

        # TTS handler created but NOT yet configured — lazy init on first TTS WS connect
        tts_handler = create_tts_handler(
            self._tts_provider, self._sarvam_api_key, self._elevenlabs_api_key
        )

        session = VoiceSession(
            session_id=session_id,
            table_id=table_id,
            restaurant_id=restaurant_id,
            restaurant_slug=slug,
            tts_handler=tts_handler,
            orchestrator=orchestrator,
            client_session_id=client_session_id,
        )
        self._sessions[session_id] = session
        logger.info(
            "Session created: %s table=%s restaurant=%s",
            session_id,
            table_id,
            restaurant_id,
        )
        # Persist to DB — fire-and-forget; never blocks session creation.
        if self._db_pool is not None:
            asyncio.create_task(
                asyncio.to_thread(self._db_insert_session, session)
            )
        return session

    def get_session(self, session_id: str) -> VoiceSession | None:
        """Return the session for session_id, or None if not found."""
        return self._sessions.get(session_id)

    def touch_session(self, session_id: str) -> None:
        """Refresh last_active_at for a session. Call on every PTT press."""
        session = self._sessions.get(session_id)
        if session:
            session.last_active_at = datetime.now(timezone.utc)

    async def reap_idle_sessions(self, idle_seconds: int = 900) -> int:
        """End sessions that have been idle for longer than idle_seconds.

        Returns the number of sessions reaped.
        """
        cutoff = datetime.now(timezone.utc).timestamp() - idle_seconds
        stale = [
            sid
            for sid, s in list(self._sessions.items())
            if s.last_active_at.timestamp() < cutoff
        ]
        for sid in stale:
            logger.info("Reaping idle session %s", sid)
            # Update DB directly to 'reaped' instead of going through end_session,
            # which would write 'closed'. Both statuses mean the session is over.
            session = self._sessions.pop(sid, None)
            if session:
                await session.tts_queue.put(None)
                await session.tts_handler.close()
                if self._db_pool is not None:
                    asyncio.create_task(
                        asyncio.to_thread(self._db_update_status, sid, "reaped")
                    )
        return len(stale)

    def get_restaurant_config(self, session: VoiceSession) -> RestaurantConfig:
        """Return the RestaurantConfig for a session (using resolved slug)."""
        return self._configs[session.restaurant_slug]

    async def end_session(self, session_id: str) -> None:
        """Close the TTS WebSocket, cancel keepalive, remove session."""
        session = self._sessions.pop(session_id, None)
        if session is None:
            return
        # Signal the TTS endpoint loop to exit
        await session.tts_queue.put(None)
        await session.tts_handler.close()
        logger.info("Session ended: %s", session_id)
        if self._db_pool is not None:
            asyncio.create_task(
                asyncio.to_thread(self._db_update_status, session_id, "closed")
            )

    async def end_all_sessions(self) -> None:
        """Gracefully end all active sessions (called on app shutdown)."""
        for session_id in list(self._sessions):
            await self.end_session(session_id)
