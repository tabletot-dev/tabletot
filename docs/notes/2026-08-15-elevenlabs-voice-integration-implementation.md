# ElevenLabs Voice Integration — Implementation Notes

Implementation of `docs/plans/2026-08-15-elevenlabs-voice-integration.md`,
Tasks 1–6, all complete. The live smoke test (Task 2) is done and found a
real bug — see below. Manual on-device testing on the Tab K9 is still
Rohan's to do.

## What shipped

- `voice_agent/elevenlabs_stt_handler.py` — `ElevenLabsSTTHandler`, same
  `transcribe_session(client_ws) -> str | None` shape as `SarvamSTTHandler`.
- `voice_agent/elevenlabs_tts_handler.py` — `ElevenLabsTTSHandler`, same
  shape as `SarvamTTSHandler`, `inactivity_timeout=180` set explicitly on
  connect (API default is 20s).
- `voice_agent/factory.py` — `create_stt_handler()`/`create_tts_handler()`,
  mirrors `src/llm/__init__.py:create_provider`'s shape.
- `voice_agent/session_manager.py`, `backend/routers/voice.py`,
  `backend/main.py` — wired behind `STT_PROVIDER`/`TTS_PROVIDER` env vars
  (both default `elevenlabs`, both fall back to `sarvam`). `/voice/health`
  now reports both providers' reachability.
- `voice_agent/restaurant_config.py` — `RestaurantConfig` gains
  `elevenlabs_voice_id`/`elevenlabs_fallback_voice_id`.
- `supabase/migrations/0064_restaurant_elevenlabs_voice_config.sql` —
  applied to local Supabase via `supabase db reset`. Remote
  (`tabletot-staging`) untouched — Rohan pushes that himself per convention.
- Supabase TS types regenerated for kiosk, pos, and dashboard apps.

Sarvam's own handler code and behavior are untouched throughout — confirmed
by the full test suite staying green (197 passed, 3 skipped, 0 failed)
after every task. `test_session_manager.py`'s mock-patch targets did move
(from `SarvamTTSHandler` to `create_tts_handler`, Task 4) to follow the new
call site — same assertions, same intent, necessary consequence of the
refactor rather than an incidental touch.

## Corrections made along the way

The plan was drafted from a documentation review before implementation
started. Two things it got wrong, caught by cross-checking the live API
reference during Task 1:

1. **STT message field names.** The plan assumed PascalCase
   (`InputAudioChunk`, `SessionStarted`, `PartialTranscript`,
   `CommittedTranscript`). The real API is snake_case
   (`input_audio_chunk`, `session_started`, `partial_transcript`,
   `committed_transcript`), and there's no `speech_start`/`speech_end`
   event type at all — Scribe v2 Realtime doesn't send VAD events the way
   Sarvam does. Fixed before any code was written against the wrong
   contract.
2. **TTS message field names were actually right** — `InitializeConnection`,
   `SendText`, `AudioOutput`/`isFinal` are genuinely PascalCase per the
   real API, unlike the STT side. No correction needed there, just
   confirmation.

One thing the plan flagged as unverified turned out to be fine: decision 3's
claim that Scribe v2 Realtime covers Hindi and Telugu is confirmed by
ElevenLabs' own docs (`docs/notes/elevenlabsapi-helper/transcription.md`) —
both languages are explicitly listed, both in the "High Accuracy" WER tier.

## A real bug, found by the live smoke test (2026-08-17)

The smoke test's actual purpose — confirming ElevenLabs' TTS WS returns raw
PCM, not MP3 (decision 4's risk) — passed clean on the first successful run.
But getting there took real debugging, because every attempt through
`smoke_test_elevenlabs.py` hung and eventually died with:

```
1008 policy violation: Have not received a new text input within the
timeout of 180 seconds
```

That message is misleading — the text *was* sent. Root-caused with
`superpowers:systematic-debugging`, not guessed: a raw probe that bypassed
`ElevenLabsTTSHandler` entirely, sending the exact same messages by hand,
showed the difference. With a `{"text": ""}` (`CloseConnection`) message
sent right after the flushed `SendText`, ElevenLabs delivers the audio,
sends `isFinal: true`, and closes cleanly (code 1000). Without it, the audio
still arrives, but the connection just sits open — no `isFinal`, no close —
until its own `inactivity_timeout` (which we'd set to 180s) kills it.

**Root cause:** `SarvamTTSHandler`'s pattern — `except ConnectionClosedOK:
break`, relying on the *server* to close proactively when speech is done —
was copied into `ElevenLabsTTSHandler` without checking whether ElevenLabs
actually behaves that way. It doesn't. Sarvam closes on its own; ElevenLabs
waits for the client to say it's done. `eleven_flash_v2_5`'s docs describe
`isFinal` as if it's a natural per-utterance signal, but empirically it's
tied to `CloseConnection`, not to `flush` alone.

**Fix:** `speak()` now sends `{"text": ""}` immediately after the flushed
text. `tests/test_elevenlabs_tts_handler.py::test_speak_sends_text_with_flush`
updated to assert both messages get sent; watched it fail against the
pre-fix code before applying the fix (TDD, not a blind patch). Re-ran the
live smoke test end-to-end afterward — passes in seconds now.

**A real architectural consequence, not just a bug fix:** because
`CloseConnection` ends the WebSocket, every `speak()` call now closes the
connection at the end of each utterance rather than keeping one truly
persistent socket open for the whole table session, unlike Sarvam. This is
fine functionally — `_ensure_connected()` already reconnects transparently
on the next `speak()` call, and a real table session has gaps between
utterances anyway that could trigger the idle-timeout regardless — but it's
a real difference from the "Persistent per table session" framing in the
plan's Task 2, worth knowing if session-level connection reuse ever matters
for cost or latency reasons.

## Voice IDs

Still the plan's placeholders — no listening test has happened yet:

| Role | Voice | ID |
|---|---|---|
| Primary (maps to Sarvam's `speaker: "rohan"`) | Adam | `pNInz6obpgDQGcFmaJgB` |
| Fallback (maps to Sarvam's `fallback_speaker: "ishita"`) | Rachel | `21m00Tcm4TlvDq8ikWAM` |

Update this table and the migration's seed values together once real voices
are picked.

## Deferred — not yet done

- **Manual end-to-end testing** — Rohan's pass. Test both
  `STT_PROVIDER=elevenlabs`/`TTS_PROVIDER=elevenlabs` (default) and the
  `sarvam` fallback path, on the Tab K9.

## Verified in this session

- **Live smoke test (Task 2)** — done via `scripts/smoke_test_elevenlabs.py`,
  real API key, real audio (user-supplied MP3 converted to WAV with
  ffmpeg). PCM output confirmed genuinely raw, not MP3. Found and fixed a
  real bug along the way — see above.
- **`test_session_manager.py`'s DB-backed assertions** — verified green in
  this session once local Supabase was brought up (11/11 passing,
  including `test_end_session_calls_tts_close`, whose mock-patch target had
  to move from `SarvamTTSHandler` to `create_tts_handler` to match the
  refactored call site).
- Full suite: 197 passed, 3 skipped, 0 failed.
