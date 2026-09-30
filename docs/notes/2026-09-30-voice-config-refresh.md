# Voice config refresh via /admin/refresh-menu (2026-09-30)

Speaker / voice settings live in the `restaurants` table:

- Sarvam TTS: `speaker`, `fallback_speaker` (migration 0028)
- ElevenLabs TTS: `elevenlabs_voice_id`, `elevenlabs_fallback_voice_id` (migration 0064)

Before this change the order-engine read them once at startup, so a DB edit
needed a Railway restart. `POST /admin/refresh-menu` (header `X-Admin-Key`)
now also reloads them, updating the shared config dict in place.

- New voice sessions pick up the new voice; already-open sessions keep theirs.
- The 6-hour background loop still refreshes menu + pairing graph only.
- Models, Sarvam pace and STT language are hardcoded in `voice_agent/*` (frozen) and are not covered.
- Not yet exercised against a running server — only syntax-checked.
