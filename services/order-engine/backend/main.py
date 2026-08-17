"""FastAPI application entry point — Stage 3 voice backend.

Run from the project root:
    uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from backend.routers.voice import router as voice_router
from voice_agent.restaurant_config import load_restaurant_config
from voice_agent.session_manager import SessionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_MENU_REFRESH_INTERVAL = 6 * 60 * 60  # 6 hours


def _load_restaurant_menus(restaurant_configs: dict, db_url: str) -> dict:
    from src.loader import load_menu_data_from_db, load_menu_from_db

    menus = {}
    for rid, cfg in restaurant_configs.items():
        db_rid = getattr(cfg, "db_restaurant_id", None)
        menu_data = load_menu_data_from_db(db_url, db_rid)
        index = load_menu_from_db(db_url, db_rid)
        menus[rid] = (menu_data, index)
        logger.info("Menu loaded: %d items for %s", len(index.items_by_id), rid)
    return menus


def _load_menu_graphs(restaurant_configs: dict, db_url: str) -> dict:
    from src.menu_graph import load_menu_graph_from_db

    graphs = {}
    for rid, cfg in restaurant_configs.items():
        db_rid = getattr(cfg, "db_restaurant_id", None)
        graph = load_menu_graph_from_db(db_url, db_rid)
        graphs[rid] = graph
        logger.info(
            "MenuGraph loaded: %d anchors, %d pairing sources for %s",
            len(graph.anchors), len(graph.pairings), rid,
        )
    return graphs


_SESSION_IDLE_SECONDS = 30 * 60  # 30 minutes — raised from 15 to accommodate long menu-browsing
_REAPER_INTERVAL = 5 * 60       # sweep every 5 minutes


async def _reaper_loop(session_manager: SessionManager) -> None:
    """Background task: reap voice sessions idle for more than 30 minutes."""
    while True:
        await asyncio.sleep(_REAPER_INTERVAL)
        try:
            reaped = await session_manager.reap_idle_sessions(_SESSION_IDLE_SECONDS)
            if reaped:
                logger.info("Session reaper: ended %d idle session(s)", reaped)
        except Exception as exc:
            logger.warning("Session reaper error: %s", exc)


async def _refresh_loop(session_manager: SessionManager, restaurant_configs: dict, db_url: str) -> None:
    """Background task: reload menu and graph from DB every 6 hours."""
    from src.loader import load_menu_data_from_db, load_menu_from_db
    from src.menu_graph import load_menu_graph_from_db

    while True:
        await asyncio.sleep(_MENU_REFRESH_INTERVAL)
        try:
            for rid, cfg in restaurant_configs.items():
                db_rid = getattr(cfg, "db_restaurant_id", None)
                # Load all three concurrently, then assign both dicts without
                # an await between them. This prevents a new session from
                # picking up a new _menus entry but an old _menu_graphs entry
                # (or vice versa) if create_session() runs mid-refresh.
                menu_data, index, graph = await asyncio.gather(
                    asyncio.to_thread(load_menu_data_from_db, db_url, db_rid),
                    asyncio.to_thread(load_menu_from_db, db_url, db_rid),
                    asyncio.to_thread(load_menu_graph_from_db, db_url, db_rid),
                )
                session_manager._menus[rid] = (menu_data, index)
                session_manager._menu_graphs[rid] = graph
                logger.info("Menu refreshed: %d items for %s", len(index.items_by_id), rid)
        except Exception as exc:
            logger.warning("Menu refresh failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_dotenv()

    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    sarvam_api_key = os.environ.get("SARVAM_API_KEY", "")
    elevenlabs_api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    stt_provider = os.environ.get("STT_PROVIDER", "elevenlabs").strip().lower()
    tts_provider = os.environ.get("TTS_PROVIDER", "elevenlabs").strip().lower()
    db_url = os.environ.get("DATABASE_URL")

    provider_name = os.environ.get("LLM_PROVIDER", "claude").strip().lower()
    provider_model = os.environ.get("LLM_MODEL", "").strip() or None
    _provider_key_env = {
        "claude": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "gemini": "GEMINI_API_KEY",
    }
    provider_api_key = os.environ.get(_provider_key_env.get(provider_name, "ANTHROPIC_API_KEY"), "")

    if not provider_api_key:
        logger.warning("%s not set — LLM calls will fail", _provider_key_env.get(provider_name))
    if not sarvam_api_key:
        logger.warning("SARVAM_API_KEY not set — voice calls will fail")
    if not elevenlabs_api_key:
        logger.warning(
            "ELEVENLABS_API_KEY not set — voice calls will fail if "
            "STT_PROVIDER or TTS_PROVIDER is elevenlabs"
        )
    logger.info("LLM provider: %s  model: %s", provider_name, provider_model or "(default)")
    logger.info("STT provider: %s  TTS provider: %s", stt_provider, tts_provider)

    if not db_url:
        raise RuntimeError(
            "DATABASE_URL is not set — required for restaurant config and menu loading."
        )
    import psycopg2.pool as _pg_pool
    db_pool = _pg_pool.ThreadedConnectionPool(minconn=1, maxconn=3, dsn=db_url)

    restaurant_configs = load_restaurant_config(db_url)
    menus = _load_restaurant_menus(restaurant_configs, db_url)
    menu_graphs = _load_menu_graphs(restaurant_configs, db_url)

    session_manager = SessionManager(
        restaurant_configs=restaurant_configs,
        sarvam_api_key=sarvam_api_key,
        anthropic_api_key=anthropic_api_key,
        menus=menus,
        provider_name=provider_name,
        provider_api_key=provider_api_key,
        provider_model=provider_model,
        menu_graphs=menu_graphs,
        db_pool=db_pool,
        elevenlabs_api_key=elevenlabs_api_key,
        stt_provider=stt_provider,
        tts_provider=tts_provider,
    )

    app.state.session_manager = session_manager
    app.state.restaurant_configs = restaurant_configs
    app.state.db_url = db_url
    app.state.db_pool = db_pool

    # Mark any sessions from a previous process as interrupted.
    await session_manager.startup_cleanup()

    refresh_task = asyncio.create_task(
        _refresh_loop(session_manager, restaurant_configs, db_url)
    )
    reaper_task = asyncio.create_task(_reaper_loop(session_manager))

    logger.info(
        "Voice backend ready — %d restaurant(s) loaded",
        len(restaurant_configs),
    )

    yield

    reaper_task.cancel()
    refresh_task.cancel()
    for task in (reaper_task, refresh_task):
        try:
            await task
        except asyncio.CancelledError:
            pass

    # Graceful shutdown: close all active sessions
    await session_manager.end_all_sessions()
    db_pool.closeall()
    logger.info("Voice backend shut down")


_raw_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080",
)
_allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="Tabletot Voice Engine", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(voice_router, prefix="/voice")


@app.post("/admin/refresh-menu")
async def refresh_menu(request: Request) -> dict:
    """Immediately reload menu from DB.

    Requires the X-Admin-Key header to match the ADMIN_API_KEY env var.
    Call this from POS admin after editing menu items to propagate changes
    without waiting for the 6-hour background cycle.
    """
    from src.loader import load_menu_data_from_db, load_menu_from_db
    from src.menu_graph import load_menu_graph_from_db

    admin_key = os.environ.get("ADMIN_API_KEY", "")
    if not admin_key:
        raise HTTPException(status_code=503, detail="ADMIN_API_KEY not configured on this server")
    if request.headers.get("X-Admin-Key") != admin_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    session_manager: SessionManager = app.state.session_manager
    restaurant_configs: dict = app.state.restaurant_configs
    db_url: str = app.state.db_url

    total_items = 0
    for rid, cfg in restaurant_configs.items():
        db_rid = getattr(cfg, "db_restaurant_id", None)
        # Same atomic-assignment pattern as _refresh_loop: load all three
        # concurrently, then assign both dicts with no await between them, so
        # a session created mid-refresh can't see a new _menus entry paired
        # with a stale _menu_graphs entry. This endpoint previously only
        # refreshed _menus — pairing data (item_pairings, anchor_items) stayed
        # stale until the next 6-hour background cycle.
        menu_data, index, graph = await asyncio.gather(
            asyncio.to_thread(load_menu_data_from_db, db_url, db_rid),
            asyncio.to_thread(load_menu_from_db, db_url, db_rid),
            asyncio.to_thread(load_menu_graph_from_db, db_url, db_rid),
        )
        session_manager._menus[rid] = (menu_data, index)
        session_manager._menu_graphs[rid] = graph
        total_items += len(index.items_by_id)
        logger.info("Menu refreshed via /admin/refresh-menu: %d items for %s", len(index.items_by_id), rid)

    return {"status": "ok", "item_count": total_items}
