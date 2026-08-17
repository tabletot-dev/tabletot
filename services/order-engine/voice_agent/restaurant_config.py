"""Restaurant configuration loader.

Loads per-restaurant TTS settings (language, speaker) from the DB
restaurants table. No JSON fallback — startup fails loudly if the DB
is unreachable or no configs are found.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RestaurantConfig:
    name: str
    language_code: str
    speaker: str
    menu_path: str  # derived as menus/{slug}.json; removed after Wave 3 loader refactor
    fallback_language_code: str | None = None
    fallback_speaker: str | None = None
    db_restaurant_id: str | None = None
    voice_persona: str | None = None
    elevenlabs_voice_id: str | None = None
    elevenlabs_fallback_voice_id: str | None = None


def load_restaurant_config(db_url: str) -> dict[str, RestaurantConfig]:
    """Load all restaurant configs from the DB restaurants table.

    Returns a dict keyed by slug.
    Raises RuntimeError if the DB is unreachable or no configs are found.
    No JSON fallback — failure is loud by design.
    """
    import psycopg2  # local import so unit tests can import this module without psycopg2

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, slug, name, language_code, speaker,
                   fallback_language_code, fallback_speaker, voice_persona,
                   elevenlabs_voice_id, elevenlabs_fallback_voice_id
            FROM   restaurants
            WHERE  slug IS NOT NULL
              AND  language_code IS NOT NULL
            ORDER  BY slug
            """
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as exc:
        raise RuntimeError(f"Failed to load restaurant config from DB: {exc}") from exc

    if not rows:
        raise RuntimeError(
            "No restaurant configs found in DB — ensure slug and language_code are set "
            "(migration 0028 populates them)."
        )

    result: dict[str, RestaurantConfig] = {}
    for (
        rid, slug, name, language_code, speaker,
        fallback_language_code, fallback_speaker, voice_persona,
        elevenlabs_voice_id, elevenlabs_fallback_voice_id,
    ) in rows:
        result[slug] = RestaurantConfig(
            name=name,
            language_code=language_code,
            speaker=speaker or "",
            menu_path=f"menus/{slug}.json",  # derived convention; unused after Wave 3
            fallback_language_code=fallback_language_code,
            fallback_speaker=fallback_speaker,
            db_restaurant_id=str(rid),
            voice_persona=voice_persona,
            elevenlabs_voice_id=elevenlabs_voice_id,
            elevenlabs_fallback_voice_id=elevenlabs_fallback_voice_id,
        )

    logger.info("Restaurant configs loaded from DB: %d restaurant(s)", len(result))
    return result
