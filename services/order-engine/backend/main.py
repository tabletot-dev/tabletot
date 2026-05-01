"""FastAPI application entry point — Stage 3 voice backend.

Run from the project root:
    uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers.voice import router as voice_router
from voice_agent.restaurant_config import load_restaurant_config
from voice_agent.session_manager import SessionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).parent.parent
_RESTAURANTS_PATH = _PROJECT_ROOT / "backend" / "config" / "restaurants.json"
_MENU_REFRESH_INTERVAL = 300  # seconds


def _load_restaurant_menus(project_root: Path, restaurant_configs: dict, db_url: str | None) -> dict:
    from src.loader import (
        apply_aliases_overlay,
        apply_overlay,
        load_aliases_from_db,
        load_menu,
        load_menu_overlay_from_db,
    )
    overlay = load_menu_overlay_from_db(db_url)
    menus = {}
    for rid, cfg in restaurant_configs.items():
        menu_path = project_root / cfg.menu_path
        menu_data = json.loads(menu_path.read_text(encoding="utf-8"))
        index = apply_overlay(load_menu(menu_path), overlay)
        db_aliases = load_aliases_from_db(db_url, getattr(cfg, "db_restaurant_id", None))
        index = apply_aliases_overlay(index, db_aliases)
        menus[rid] = (menu_data, index)
        logger.info("Menu loaded: %d entries for %s", len(index.entries), rid)
    return menus


async def _refresh_loop(session_manager: SessionManager, restaurant_configs: dict, db_url: str | None) -> None:
    """Background task: reload menu overlay and aliases from DB every 5 minutes."""
    from src.loader import (
        apply_aliases_overlay,
        apply_overlay,
        load_aliases_from_db,
        load_menu,
        load_menu_overlay_from_db,
    )
    while True:
        await asyncio.sleep(_MENU_REFRESH_INTERVAL)
        try:
            overlay = await asyncio.to_thread(load_menu_overlay_from_db, db_url)
            for rid, cfg in restaurant_configs.items():
                menu_path = _PROJECT_ROOT / cfg.menu_path
                menu_data, _ = session_manager._menus[rid]
                index = apply_overlay(load_menu(menu_path), overlay)
                db_aliases = await asyncio.to_thread(
                    load_aliases_from_db, db_url, getattr(cfg, "db_restaurant_id", None)
                )
                index = apply_aliases_overlay(index, db_aliases)
                session_manager._menus[rid] = (menu_data, index)
                logger.info("Menu refreshed: %d entries for %s", len(index.entries), rid)
        except Exception as exc:
            logger.warning("Menu refresh failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_dotenv()

    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    sarvam_api_key = os.environ.get("SARVAM_API_KEY", "")
    db_url = os.environ.get("DATABASE_URL")

    if not anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set — LLM calls will fail")
    if not sarvam_api_key:
        logger.warning("SARVAM_API_KEY not set — voice calls will fail")

    restaurant_configs = load_restaurant_config(_RESTAURANTS_PATH)
    menus = _load_restaurant_menus(_PROJECT_ROOT, restaurant_configs, db_url)

    session_manager = SessionManager(
        restaurant_configs=restaurant_configs,
        sarvam_api_key=sarvam_api_key,
        anthropic_api_key=anthropic_api_key,
        menus=menus,
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


app = FastAPI(title="Roast CCx Voice Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(voice_router, prefix="/voice")


@app.post("/admin/refresh-menu")
async def refresh_menu() -> dict:
    """Immediately reload menu prices and active flags from DB.

    Call this from POS admin after editing menu items to propagate changes
    without waiting for the 5-minute background cycle.
    """
    from src.loader import (
        apply_aliases_overlay,
        apply_overlay,
        load_aliases_from_db,
        load_menu,
        load_menu_overlay_from_db,
    )

    session_manager: SessionManager = app.state.session_manager
    restaurant_configs: dict = app.state.restaurant_configs
    db_url: str | None = app.state.db_url

    overlay = await asyncio.to_thread(load_menu_overlay_from_db, db_url)
    total_entries = 0
    for rid, cfg in restaurant_configs.items():
        menu_path = _PROJECT_ROOT / cfg.menu_path
        menu_data, _ = session_manager._menus[rid]
        index = apply_overlay(load_menu(menu_path), overlay)
        db_aliases = await asyncio.to_thread(
            load_aliases_from_db, db_url, getattr(cfg, "db_restaurant_id", None)
        )
        index = apply_aliases_overlay(index, db_aliases)
        session_manager._menus[rid] = (menu_data, index)
        total_entries += len(index.entries)
        logger.info("Menu refreshed via /admin/refresh-menu: %d entries for %s", len(index.entries), rid)

    return {"status": "ok", "item_count": total_entries}
