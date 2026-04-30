"""Restaurant configuration loader.

Loads per-restaurant TTS settings (language, speaker) from
backend/config/restaurants.json.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RestaurantConfig:
    name: str
    language_code: str
    speaker: str
    menu_path: str
    fallback_language_code: str | None = None
    fallback_speaker: str | None = None
    db_restaurant_id: str | None = None


def load_restaurant_config(path: Path) -> dict[str, RestaurantConfig]:
    """Load all restaurant configs from a JSON file.

    Returns a dict keyed by restaurant_id.
    Raises KeyError if a restaurant_id is not found when accessed by callers.
    """
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {k: RestaurantConfig(**v) for k, v in raw.items()}
