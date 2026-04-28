"""FastAPI application entry point — Stage 3 voice backend.

Run from the project root:
    uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

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


def _load_restaurant_menus(project_root: Path, restaurant_configs: dict) -> dict:
    from src.loader import load_menu
    menus = {}
    for rid, cfg in restaurant_configs.items():
        menu_path = project_root / cfg.menu_path
        menu_data = json.loads(menu_path.read_text(encoding="utf-8"))
        menus[rid] = (menu_data, load_menu(menu_path))
    return menus


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_dotenv()

    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    sarvam_api_key = os.environ.get("SARVAM_API_KEY", "")

    if not anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set — LLM calls will fail")
    if not sarvam_api_key:
        logger.warning("SARVAM_API_KEY not set — voice calls will fail")

    restaurant_configs = load_restaurant_config(_RESTAURANTS_PATH)
    menus = _load_restaurant_menus(_PROJECT_ROOT, restaurant_configs)

    app.state.session_manager = SessionManager(
        restaurant_configs=restaurant_configs,
        sarvam_api_key=sarvam_api_key,
        anthropic_api_key=anthropic_api_key,
        menus=menus,
    )
    logger.info(
        "Voice backend ready — %d restaurant(s) loaded",
        len(restaurant_configs),
    )

    yield

    # Graceful shutdown: close all active sessions
    await app.state.session_manager.end_all_sessions()
    logger.info("Voice backend shut down")


app = FastAPI(title="Roast CCx Voice Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(voice_router, prefix="/voice")
