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
from fastapi import FastAPI
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


async def _refresh_loop(session_manager: SessionManager, restaurant_configs: dict, db_url: str) -> None:
    """Background task: reload menu and graph from DB every 6 hours."""
    from src.loader import load_menu_data_from_db, load_menu_from_db
    from src.menu_graph import load_menu_graph_from_db

    while True:
        await asyncio.sleep(_MENU_REFRESH_INTERVAL)
        try:
            for rid, cfg in restaurant_configs.items():
                db_rid = getattr(cfg, "db_restaurant_id", None)
                menu_data = await asyncio.to_thread(load_menu_data_from_db, db_url, db_rid)
                index = await asyncio.to_thread(load_menu_from_db, db_url, db_rid)
                graph = await asyncio.to_thread(load_menu_graph_from_db, db_url, db_rid)
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
    logger.info("LLM provider: %s  model: %s", provider_name, provider_model or "(default)")

    if not db_url:
        raise RuntimeError(
            "DATABASE_URL is not set — required for restaurant config and menu loading."
        )
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
    )
    app.state.session_manager = session_manager
    app.state.restaurant_configs = restaurant_configs
    app.state.db_url = db_url

    refresh_task = asyncio.create_task(
        _refresh_loop(session_manager, restaurant_configs, db_url)
    )

    logger.info(
        "Voice backend ready — %d restaurant(s) loaded",
        len(restaurant_configs),
    )

    yield

    refresh_task.cancel()
    try:
        await refresh_task
    except asyncio.CancelledError:
        pass

    # Graceful shutdown: close all active sessions
    await session_manager.end_all_sessions()
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
async def refresh_menu() -> dict:
    """Immediately reload menu from DB.

    Call this from POS admin after editing menu items to propagate changes
    without waiting for the 6-hour background cycle.
    """
    from src.loader import load_menu_data_from_db, load_menu_from_db

    session_manager: SessionManager = app.state.session_manager
    restaurant_configs: dict = app.state.restaurant_configs
    db_url: str = app.state.db_url

    total_items = 0
    for rid, cfg in restaurant_configs.items():
        db_rid = getattr(cfg, "db_restaurant_id", None)
        menu_data = await asyncio.to_thread(load_menu_data_from_db, db_url, db_rid)
        index = await asyncio.to_thread(load_menu_from_db, db_url, db_rid)
        session_manager._menus[rid] = (menu_data, index)
        total_items += len(index.items_by_id)
        logger.info("Menu refreshed via /admin/refresh-menu: %d items for %s", len(index.items_by_id), rid)

    return {"status": "ok", "item_count": total_items}
