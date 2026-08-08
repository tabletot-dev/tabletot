# Sarvam docs audit — to-do for later

Read-only check of `services/order-engine/voice_agent/` against current
`docs.sarvam.ai`. Nothing changed — voice pipeline is frozen, needs explicit
go-ahead per file. Ordered by priority.

## 1. Verify TTS language field name — `target_language_code` vs `language_code`

**File:** `services/order-engine/voice_agent/tts_handler.py:134`

Code sends `"target_language_code"` in the TTS config message. Current Sarvam
docs (WS example + REST API) consistently use `"language_code"` — no rename
noted in the changelog, so this may have been wrong from the start.

**Why it matters:** non-negotiable rule is native-script-only TTS output
(Hindi/Telugu). If Sarvam silently ignores the unrecognized key, language
could be defaulting rather than being honored on every request.

**Action:** live-test a Hindi/Telugu TTS turn before touching code. If it's
genuinely wrong, fix is a one-line key rename.

## 2. Drop dead STT param — `input_audio_codec`

**File:** `services/order-engine/voice_agent/stt_handler.py:39`

`input_audio_codec=pcm_s16le` in the connection URL. Removed by Sarvam in
Jan 2026 — API now auto-detects codec, param is silently ignored. Not
broken, just stale. Low priority, cosmetic cleanup.

## 3. Consider migrating STT: legacy Streaming API → Realtime API

Currently on `saaras:v3` at `/speech-to-text/ws` ("legacy" per current
docs). Sarvam steers new work to `saaras:v3-realtime` at
`/speech-to-text-realtime/ws` — real partial transcripts, ms-based VAD
tuning, live mid-call reconfig without reconnect.

No sunset date documented for the legacy endpoint — nothing at risk of
breaking. This is a real migration (different message envelope: `audio_input`
event vs current `{"audio":{"data":...}}`, different finalize signaling),
not a drop-in swap. Someday-maybe, not urgent.

## Confirmed fine, no action

`bulbul:v3` (stable, not `-beta`), `output_audio_codec: "linear16"`, pace
range, no pitch/loudness on v3, 30s keepalive, all STT connection query
params (`model`, `language-code`, `mode`, `flush_signal`, `vad_signals`,
`sample_rate`).
