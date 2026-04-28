# Development Stages Overview

This document provides context on the full 3-stage development plan. **Only Stage 1 is being built now.** Stages 2 and 3 are documented here so the developer understands where this code fits in the larger system.

---

## Stage 1 — Menu Resolver (Current)

**Goal:** Build and prove the deterministic matching engine in isolation.

**Input:** Raw text string (simulating what an LLM or STT would produce)
**Output:** Matched menu item(s), ambiguity candidates, or failure

**No LLM, no STT, no network calls.** Pure Python, CLI only.

**Success criteria:**
- Resolver correctly handles ~90%+ of a 50+ item test battery
- Every interaction is logged with developer pass/fail verdicts
- Failure log directly feeds alias table growth
- All unit tests pass

**Deliverable:** A Python package (`menu-resolver/`) that can be imported as a module in Stage 2.

---

## Stage 2 — LLM Intent Extraction + Resolver (Next)

**Goal:** Connect Claude Sonnet to the resolver. Natural language in, resolved menu items out.

**Input:** Full sentences like "bhaiya ek butter chicken aur do garlic naan, naan mein extra butter"
**Processing:** LLM extracts structured intents → Resolver matches each intent → Results combined
**Output:** List of resolved items with quantities, notes, and modifiers

**What gets built:**
- LLM system prompt with simplified menu context (names/categories only, no prices/IDs)
- Intent extraction contract: LLM outputs `{action, raw_name, qty, modifiers, special_notes}`
- Conversation state management (multi-turn: add, remove, modify, confirm)
- Ambiguity resolution loop (resolver flags ambiguity → LLM asks user → user responds → resolver resolves)
- Review system expanded: logs both LLM output AND resolver result separately, so failures are attributed to the correct layer

**The resolver from Stage 1 is imported directly** — its `resolve()` function is called by the LLM orchestrator.

---

## Stage 3 — STT Integration (After Stage 2)

**Goal:** Replace typed text with actual speech-to-text transcription.

**What gets built:**
- Deepgram Nova-3 integration (streaming STT, Hindi/Telugu/English)
- LiveKit as WebRTC transport layer
- STT parameter tuning (utterance_end_ms, VAD, language hints)
- Cartesia TTS for spoken confirmations
- Audio pipeline: mic → Deepgram → transcript → LLM → Resolver → TTS

**The only new failure mode is transcription accuracy.** Everything downstream (LLM intent extraction, resolver matching) is already proven from Stages 1 and 2.

---

## How the Resolver Fits in the Full System

```
[Stage 3]  Microphone → Deepgram STT → transcript text
                                            │
[Stage 2]                          Claude Sonnet LLM
                                   (intent extraction)
                                            │
                                   structured intent
                                   {raw_name, qty, mods}
                                            │
[Stage 1]                        ┌──────────▼──────────┐
                                 │    MENU RESOLVER     │
                                 │  (this is what we're │
                                 │   building now)      │
                                 └──────────┬──────────┘
                                            │
                                   resolved item
                                   {id, name, price}
                                            │
                                      Order State
                                            │
                                      KDS / POS
```

The resolver is the foundation. It must be rock-solid before the layers above it are added.
