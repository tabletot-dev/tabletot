# Voice / menu intelligence — design discussion log

**Date:** 2026-05-30
**Status:** Tracks A–F complete (2026-05-30). See §12 for remaining open items.
**Participants:** Rohan + Claude
**Why this doc exists:** We are designing how to make the voice/LLM ordering feel
genuinely *smart* to the customer, driven dynamically by the menu data. This is a
long multi-session discussion; this file preserves the full reasoning and the
question→answer exchanges verbatim-in-spirit so we don't lose context. Refer back
here before future discussions.

> Tag conventions used below: `#decided`, `#open-question`, `#deferred`.

Related docs:
- [`pos-restaurant-scoping.md`](pos-restaurant-scoping.md) — the earlier part of
  this session (the `restaurant_tables` 406 bug + POS scoping fix). Separate
  concern; documented there.
- [`pos-table-diagnosis.md`](pos-table-diagnosis.md) — full inventory of POS
  Supabase writes (referenced for the "audit other scoped-table inserts" follow-up).

---

## 0. How this started — the voice screenshot review

Rohan shared two screenshots of a live voice-module interaction ("Ask Tabletot"
panel) and asked for a review. Transcript:

1. **Customer:** "Can I get something for breakfast?"
2. **Tabletot:** "We have a great selection of breakfast options, including our
   signature Silver Breakfast platters, avocado toast, and a variety of bagels,
   **pancakes**, and omelettes. Would you like to hear more about any of those?"
3. **Customer:** "Yes, can you suggest me a pancake and one omelette?"
4. **Tabletot:** "I've **added the French Omelette** to your order. For pancakes,
   **we don't have those**, but would you like to try our Cacao or Banana
   smoothie bowls instead?" (UI shows a French Omelette card, qty 1, ₹350)

### Initial review (THIS WAS LATER PROVEN PARTLY WRONG — see §3)

First-pass diagnosis from the screenshots alone flagged three issues:
1. **Self-contradiction** — turn 2 offered "pancakes", turn 4 said "we don't have
   those". Hypothesised as a Pass-2 **menu-grounding/hallucination** failure.
2. **Consent** — customer said "*suggest* me… one omelette"; system *added* the
   French Omelette to the cart. (This one held up — see §3.)
3. **Weak substitution** — offering smoothie bowls as a pancake alternative.

What worked: name-based resolution produced a real item card (French Omelette,
₹350); tone/pacing read naturally.

**Important correction (§3):** issue #1 was misdiagnosed. Pancakes ARE on the
menu. The contradiction is a *resolver miss*, not a hallucination.

---

## 1. Codebase exploration & the architecture

Followed the repo rule (`/graphify` first). Finding: the existing graph at the
repo root (`graphify-out/graph.json`, 667 nodes) only covers the **POS frontend**
(`apps/pos/src`). There was no graph for the order-engine Python backend (the
`services/order-engine/graphify-out` graph referenced in git status did not exist
on disk). Per the repo's own fallback rule, explored `services/order-engine`
directly.

### The two-pass voice architecture (order-engine, ADR-007)

```
Natural language input
   │
   ▼
Pass 1 (LLM): extract_intents  — structured intents only, NO user-facing reply
   → receives item names/categories/tags ONLY (never prices or IDs)
   → outputs <intents> + <language>
   │
   ▼
Resolver (deterministic Python): 5-step cascade, matches intents → menu.json
   → ConfidentMatch | NeedsVariantSelection | Ambiguous | NoMatch | Unavailable
   → mutates Order State
   │
   ▼
Pass 2 (LLM, streaming): customer-facing reply, grounded in what the resolver
   ACTUALLY did. Streams sentence-by-sentence into TTS.
```

**Non-negotiable rule (order-engine CLAUDE.md):** the LLM never sees prices or
IDs — `menu_summary.py` enforces this to prevent hallucination of order data.
LLM provider is configurable (`LLM_PROVIDER`): claude / openai / gemini.
**Rohan is running Gemini, not Claude.** This matters for capability assumptions
(see §5).

### Key files

| File | Role |
|---|---|
| `src/llm/prompts/system_prompt.py` | Builds both Pass-1 (`_INTENT_ROLE_AND_FORMAT`) and Pass-2 (`_RESPONSE_ROLE_TEMPLATE`) system prompts |
| `src/llm/prompts/menu_summary.py` | `generate_menu_summary()` — flat text menu for prompt injection (~2,400 tokens), no prices/IDs |
| `src/orchestrator.py` | Wires Pass1 → resolver → Pass2; `_handle_add/_remove/_modify`; intent dispatch |
| `src/resolver.py` | `resolve(raw, index, time)` — pure 5-step fuzzy cascade |
| `src/loader.py` | `load_menu_from_db` / `load_menu_data_from_db` — builds `MenuIndex` + menu_data from DB |
| `src/normalizer.py` | `normalize()` — lowercase, strip accents, strip filler words. **No stemming.** |
| `src/models.py` | Result dataclasses: `ConfidentMatch`, `NeedsVariantSelection`, `Ambiguous`, `NoMatch`, `Unavailable`; `IndexEntry`, `VariantItem`, `Category` |
| `src/llm/gemini_provider.py` | Gemini two-pass impl (uses `google-genai` SDK) |

### Relevant prompt facts (with line refs as of this session)

- Pass-2 "CRITICAL Truth Rules" (`system_prompt.py:154-167`) only constrain the
  **order-confirmation** path — rule 4: *"NEVER say 'I added X' if X isn't under
  Successfully processed."* There is **no rule** forbidding *naming/offering* a
  dish in prose. (Relevant to the originally-suspected grounding gap.)
- Pass-2 menu is injected as `## Menu (for answering menu questions only)`
  (`system_prompt.py:206`).
- Pass-1 intent actions (`system_prompt.py:39-49`): `add_item`, `remove_item`,
  `modify_item`, `select_variant`, `confirm_order`, `ask_menu`,
  `accept_upsell`/`reject_upsell`, `none`. **No `recommend`/`browse`/`filter`
  action exists.**
- Pass-1 rule: `raw_name` must be "as the customer said it", English/Roman, and
  the LLM must NOT correct/translate/substitute — the resolver handles matching
  (`system_prompt.py:52, 57`). i.e. **Pass 1 is deliberately dumb about item
  reference today.**
- Orchestrator `_handle_add` (`orchestrator.py:254-275`): on `ConfidentMatch` it
  immediately adds to the order. `ask_menu` just records a `menu_question`
  outcome (`orchestrator.py:127-128`).

---

## 2. The real menu data (queried from local Supabase)

Queried the running local Supabase (`menu_items` table, restaurant
`silver-ssc-hyd`) via the Docker DB container. **49 items / 14 categories:**

```
Silver Breakfast (2) · All Day Breakfast (6) · Pancakes (3) · Smoothie Bowls (4)
Sandwiches (3) · Burgers (2) · Focaccia (2) · Pastas (4) · Fries (3) · Desserts (1)
Hot Coffee (6) · Iced Coffee (5) · Signature Coffee (6) · Tea & Chocolate (2)
```

`menu_items` columns: `id, name, category, price, active, tags, created_at,
restaurant_id, is_veg, image_url, description, modifiers, json_id`.
(NB: there is **no `type` column** in the DB — relevant in §3.)

Full item list (category / name / is_veg / description) — abbreviated highlights:
- **Pancakes:** `Banana`, `Original` ("Classic pancakes."), `PB & J`
  ("Peanut butter and jelly pancakes.")
- **All Day Breakfast:** Avocado Toast, Egg Bagel, **French Omelette**, French
  Toast, Turkish Eggs, Veggie Bagel
- **Smoothie Bowls:** Berry, Cacao, Greek Yogurt, Vanilla Mush
- **Signature Coffee:** Espresso Lime/Tonic, Silver Cold Brew, Silver Cold
  Coffee, Silver Espresso, Spanish Latte
- (others per query — coffees, pastas, sandwiches, fries, etc.)

**77 aliases** in `menu_item_aliases` (cols: `id, restaurant_id, item_id, alias,
created_at`). Aliases relevant to the screenshots:
- `"pancakes"` (plural) exists → points to **`Original`** (one arbitrary item)
- `"omelette"` exists → points to **`French Omelette`**
- Category-ish aliases also collapse to single items:
  `"cold coffee"→Silver Cold Coffee`, `"chicken sandwich"→Peri Peri Chicken`,
  `"berry bowl"→Berry`
- **No singular `"pancake"` alias.** Aliases present: `pancakes`,
  `banana pancakes`, `classic pancakes`, `original pancakes`,
  `peanut butter pancakes`, `peanut butter jelly pancakes`.

---

## 3. CORRECTED diagnosis — what actually went wrong

**Pancakes ARE on the menu** (whole category: Banana / Original / PB & J). So:

- **Turn 2 was correct and grounded** — Pass 2 read "Pancakes" off the category
  header in the injected menu context. There was **no hallucination**. The
  initial review's issue #1 was WRONG.
- **The contradiction in turn 4 is a resolver miss**, not a Pass-2 invention.

### Why "pancake" failed — three structural gaps

1. **Singular/plural miss.** Customer said "pancake" (singular). Alias table has
   `"pancakes"` (plural), not `"pancake"`. `normalize()` does **no stemming**
   (`normalizer.py` lowercases, strips accents/fillers only). So step-2 exact
   alias lookup misses by one trailing `s`.
2. **Fuzzy never sees aliases.** Resolver steps 3–4 fuzzy-match only against
   `index.normalized_names` (item *display names*: Banana, Original, PB & J).
   Aliases live in a separate `index.aliases` dict used ONLY for exact lookup.
   So "pancake" is never even fuzzy-compared to "pancakes". → `no_match` →
   nearest item names by token_sort = smoothie bowls (Cacao, Banana).
3. **The hierarchy is flattened away.** Even `"pancakes"` (plural) resolves to a
   single arbitrary item ("Original"), never a "which one?" prompt. The loader
   hardcodes `type="simple"` for EVERY DB item (`loader.py:453` and `:520`), so
   the resolver's `NeedsVariantSelection` machinery is **dead on the DB path** —
   no group ever asks the customer to choose. And **categories are loaded into
   `index.categories` but never indexed as resolvable entries**
   (`loader.py:460-461`), so the most natural way to ask ("a pancake", "a
   coffee", "a sandwich") has nowhere to land.

### The consent issue (#2) still holds

"Suggest me a pancake and one **omelette**" → Pass 1 emitted `add_item`(omelette)
→ alias `omelette → French Omelette` → `ConfidentMatch` → `_handle_add` added it
to the cart immediately. The customer asked for a *suggestion*; the system
*committed* the item. There is no `recommend` intent, so "suggest me X" collapses
to "add X". `#open-question` how to fix — see §5.

---

## 4. Q: Is the menu resolver generic, or tied to the pilot menu?

**A: Fully generic / menu-agnostic. [DECIDED — established fact]**

`resolve()` is a pure 5-step fuzzy cascade over a `MenuIndex`. `load_menu_from_db`
just pulls `menu_items` + `menu_item_aliases` for a `restaurant_id`. **Zero**
Silver-specific content anywhere in the resolver. Its entire "knowledge" is:
item names + alias dictionary + categories. This is the right foundation for
menu-driven intelligence — the smarts must live in **algorithm + data**, not in
per-pilot hardcoding.

Resolver cascade (`resolver.py`): (1) exact normalized, (2) alias exact, (3)
fuzzy combined token_sort (threshold 80), (4) fuzzy partial-only (threshold 90,
skips inputs <4 chars), (5) no-match with closest suggestions. Tunables at top of
file. `NeedsVariantSelection` is produced when clustered fuzzy candidates all
belong to one variant group — but this never fires on the DB path (see §3.3).

---

## 5. The menu-driven "smartness" design — four tiers

Core principle Rohan set: **the intelligence must be derived dynamically from the
menu data, not hardcoded per menu.** The data already carries the structure
(`category`, `is_veg`, `description`, `modifiers`) plus curation tables
(`item_pairings`, `anchor_items`, `meal_completion_rules`) — the voice path just
discards it. Four tiers, each fully generic:

- **Tier 0 — matching correctness.** Plural/singular robustness + fold aliases
  into the fuzzy candidate pool. "pancake" ≈ "pancakes" must resolve. Pure bug
  fix, no behavior change.
- **Tier 1 — category as a navigable node (the core "smart" feel).** Index every
  category name as a resolvable entry that returns a "narrow down" result:
  "A pancake?" → "We've got Banana, Original, or PB & J — which sounds good?"
  100% from `menu_items.category`, zero hardcoding. Highest leverage; also
  revives the dormant variant machinery's *conversational* path.
- **Tier 2 — attribute-aware.** `is_veg` → "something veg" filters and "is the
  omelette veg?" answered from data; index `description` tokens so "peanut
  butter" finds PB & J.
- **Tier 3 — a real `recommend` intent.** Surfaces a suggestion WITHOUT adding to
  cart, drawing candidates from `anchor_items` / `item_pairings` (already curated
  per-restaurant in the DB; the touch path's Patterns 1/3/6 query them in SQL).
  Fixes the consent gap and is "smart" via human-curated data, not LLM guessing.

Throughline: encode smartness as **generic algorithms over `MenuIndex`** +
**richer data in the menu/curation tables** — never as per-menu prompt text.

---

## 6. The architecture fork — how to model category navigation  `#decided`

### Q (Claude → Rohan): reuse/rename `NeedsVariantSelection`, or a distinct `ChooseFromCategory`?

**What exists today — `NeedsVariantSelection` (`models.py:83`):**
```python
@dataclass
class NeedsVariantSelection:
    group_id: str
    group_name: str          # e.g. "Pancakes"
    category: str
    variants: list[VariantItem]   # choosable children
    score: float
    match_method: str
```
This already flows end-to-end: `orchestrator._handle_add` emits feedback
`{"type":"needs_variant"}` + outcome `{"status":"needs_variant"}`; Pass-2 renders
"NEEDS VARIANT selection: … Ask which one."; the feedback carries to the next turn
so Pass 1 interprets the reply as `select_variant`. So the "which one?" dialog
machinery is already built.

**Option A — reuse `NeedsVariantSelection`.** Treat a category as a pseudo-group
and its items as pseudo-`VariantItem`s. Zero changes to orchestrator/prompts/
feedback; the behavior lights up immediately.

**Option B — distinct `ChooseFromCategory`:**
```python
@dataclass
class ChooseFromCategory:
    category: str
    options: list[ConfidentMatch]   # real items, with description/is_veg
    score: float
    match_method: str
```
Add to the `ResolveResult` union; new orchestrator branch; new prompt rendering
branch. More wiring (~4 files), but models reality.

**Why it's a real fork, not naming:** the two encode different menu relationships.
- Variant selection = a product's **mutually-exclusive forms** (a Latte's
  sizes); you CANNOT order the parent abstractly — must pick one; children are
  `VariantItem` (need a real `parent_id`/`parent_name`).
- Category navigation = **distinct products** sharing a section; each is
  independently orderable; "pick one" is a convenience; children are full menu
  items with their own `description`/`is_veg`.
- Option A forces fabricated `VariantItem`s whose `parent_name` is the category;
  display rendering is `f"{parent_name} - {variant.name}"` ("Pancakes - Banana"
  OK, "Hot Coffee - Latte" awkward). `VariantItem` has **no slot** for
  `description`/`is_veg` — exactly the fields Tier 2 needs. So Option A caps how
  smart category nav can get.

**The wrinkle that tips it:** the variant machinery is currently DEAD on the DB
path (everything `type="simple"`). So "reuse" = reviving a dormant type AND
repurposing it for a second meaning at once. When real variants return (coffee
sizes, modifiers in DB), every consumer of `NeedsVariantSelection` would have to
ask "is this a true variant group or a category in disguise?" — classic
overloading cost: free today, expensive exactly when the concepts diverge.

**Claude's recommendation:** Option B, but **reuse the existing prompt/feedback
plumbing** (same "ask which one" rendering, same continuity mechanism) so we pay
modeling honesty without rebuilding dialog handling.

### A (Rohan): **Option B chosen.**  `#decided`
Wants to discuss more before touching files.

---

## 7. Q (Rohan): Can we give the LLM/resolver a precomputed graph from the DB menu to traverse fast? And can the LLM understand intent before sending to the resolver?

### 7a. The graph idea

**A: Yes — but NOT as a matching-speed optimization.** `#open-question` (agreed in
principle, sequencing TBD)

- Menu is 49 items / 14 categories. Resolver already matches in microseconds.
  "Fast traversal" is not the win — there is no speed problem at this scale.
- The real question is whether there's genuinely graph-shaped structure. There
  is, and it's concentrated:

| Relationship | Graph-shaped? | Lives in |
|---|---|---|
| name → item (resolution) | No — string similarity, not traversal | resolver/index (fine as-is) |
| category → items (Tier 1) | Weakly — a 1-level tree | just needs category indexing |
| **item ↔ item pairings** | **Strongly** — arbitrary edges | `item_pairings` |
| **anchors / meal completion** | **Strongly** | `anchor_items`, `meal_completion_rules` |

- So a graph earns its keep at **Tier 3 (recommendation/navigation)** — "what
  pairs with the cold brew", "what completes this meal", "anchor for empty cart".
  Those are literal item↔item edges, already present as relational tables (the
  touch path's Patterns 1/3/6 query them in SQL).
- Proposal: a precomputed in-memory `MenuGraph`, built once at menu load (like
  `menu_summary` is), keyed off the DB — categories, items, `is_veg`, pairings,
  completion rules. It's the right model for relationship intelligence and
  **unifies the touch path's SQL recommendations with the voice path.** It is NOT
  a matching optimization; do NOT route name-resolution through it.

**Two cautions:**
1. **Sequencing.** `ChooseFromCategory` (Tier 1) does NOT need a graph — just
   index category names + enumerate children. Build Tier 1 first WITHOUT the
   graph; introduce `MenuGraph` when Tier 3 lands. Otherwise it's a general graph
   layer serving a 1-level tree (over-engineering for a 21-day pilot).
2. **Don't feed the graph to the LLM.** For 49 items the flat `menu_summary` text
   is better prompt input (cheaper tokens, easier comprehension). The graph is
   for the deterministic layer's logic, not prompt injection.

### 7b. LLM understanding intent before the resolver

**A: Yes — for intent TYPE only; never for item IDENTITY.** `#open-question`
(principle agreed, taxonomy shape TBD — that's the question Rohan answers next)

Design principle proposed:
> **The LLM owns *intent* (what the customer wants to DO). The resolver owns
> *reference* (which menu node they mean).**

- Today Pass 1 is deliberately dumb about reference (`raw_name` "as said", no
  resolving). That should STAY — it's the grounding guarantee from ADR-007 (LLM
  never sees prices/IDs, never invents an orderable item).
- But Pass 1 is **underusing its intent understanding**, and that's the bugs:
  - "**suggest** me a pancake" — only the LLM can know "suggest" = recommend,
    don't commit. The resolver sees "pancake" and can't know it shouldn't be
    added. So the consent bug is fundamentally an **LLM-intent** job.
  - "a pancake" (narrow) vs "is there a pancake?" (menu Q) vs "I'll take a
    pancake" (order) — same `raw_name`, three intents; resolver can't tell them
    apart from the name; the LLM can from the full utterance.
- So: let the LLM classify the **shape/illocution** — `add` vs `recommend` vs
  `browse_category` vs `ask_menu` vs `filter_by_attribute` — and still hand the
  *name* to the resolver for identity. "Pancake" then flows as `browse`/`recommend`
  → resolver → `ChooseFromCategory` → "Banana, Original, or PB & J?".
- **Do NOT** let the LLM resolve item identity directly against the in-context
  menu (skip the resolver). That reintroduces the hallucination/grounding risk
  ADR-007 prevents, and on **Gemini Flash** specifically, item-identity is exactly
  where it confabulates (close-enough matches, plural drift, made-up combos).
  Intent *classification* it does reliably; item *reference* it does not. The
  split is a model-capability fit, not just purism.

**Costs to weigh:** growing the Pass-1 intent taxonomy = more prompt surface,
more misclassification modes, more eval cases (`tests/test_silver_voice_intents.py`
would expand). No added latency (still one Pass-1 call; graph traversal is
in-memory). Add actions deliberately, one Tier at a time, with eval coverage.

**How the three compose:**
```
Pass 1 (LLM)            → classifies INTENT TYPE + extracts raw_name
                           (add / recommend / browse / ask / filter)
        │
        ▼
Resolver (deterministic) → owns REFERENCE: name → item | ChooseFromCategory
        │                  (Tier 1: category indexing; no graph needed yet)
        ▼
MenuGraph (later, Tier 3)→ owns RELATIONSHIPS: pairings, completion, anchors
        │                  (built at load from DB; replaces ad-hoc recommend logic)
        ▼
Pass 2 (LLM)             → grounded reply (unchanged guarantees)
```
Both ideas are **additive** to the existing two-layer design, not replacements.

---

## 8. §8 ANSWERED — Separate Pass-1 actions  `#decided`

**A (Rohan): Separate Pass-1 actions chosen.** All three new intents
(`browse_category`, `recommend`, `filter`) are required pre-pilot. Each gets its
own first-class action in the Pass-1 schema, not a `mode` field on `add_item`.

**Why separate actions wins:**
- The three intents have genuinely different data flows: `browse_category` →
  `ChooseFromCategory`, `recommend` → MenuGraph (Tier 3), `filter` →
  attribute-aware matching (Tier 2). Encoding them as modes of `add_item` would
  make the orchestrator dispatch lie about what the branch does.
- Incremental delivery: `browse_category` ships with Tier 1; `filter` with Tier
  2; `recommend` with Tier 3. Each is a plain new `elif` in the orchestrator —
  zero rework of what shipped before.
- Gemini Flash (the runtime LLM) classifies flat enum labels reliably; a
  two-dimensional action + mode output would add misclassification surface.
- `test_silver_voice_intents.py` organises naturally as one section per action.

**New Pass-1 action taxonomy (Tier 0→3 rollout):**

| Action | Tier | Orchestrator path | Resolver result |
|---|---|---|---|
| `add_item` | existing | `_handle_add()` | `ConfidentMatch` / variants |
| `remove_item` | existing | `_handle_remove()` | — |
| `modify_item` | existing | `_handle_modify()` | — |
| `select_variant` | existing | `_handle_add()` | — |
| `confirm_order` | existing | inline | — |
| `ask_menu` | existing | inline | — |
| `accept_upsell`/`reject_upsell` | existing | inline | — |
| `none` | existing | inline | — |
| **`browse_category`** | **Tier 1** | **`_handle_browse()`** | **`ChooseFromCategory`** |
| **`filter`** | **Tier 2** | **`_handle_filter()`** | attribute-filtered list |
| **`recommend`** | **Tier 3** | **`_handle_recommend()`** | MenuGraph traversal |

---

## 9. Voice path hardening — bugs found  `#pre-pilot blocking`

**Date of audit:** 2026-05-30. Codebase explored via graphify + direct file reads.
**Status:** No fixes applied yet. All blocking items must be resolved pre-pilot.

### Bug inventory

| # | Sev | File(s) | What |
|---|---|---|---|
| H1 | **Critical** | `VoiceConversationPanel.tsx:102-127` | No `bargeIn()` on PTT press in conversation mode — TTS audio keeps playing while STT records |
| H2 | **Critical** | `voice.py:312-330`, `session_manager.py:40` | No `tts_queue` abort on new PTT press — stale sentences from previous turn play before new response |
| H3 | **High** | `voice.py:404-428` | TTS loop has no turn ID — cannot discard sentences from a superseded turn |
| H4 | **High** | `session_manager.py:40` | `asyncio.Queue` has no `maxsize` — unbounded growth on rapid PTT presses |
| H5 | **Medium** | `voice.py:222-257` | `_apply_cart_sync()` overwrites full order state — late cart_sync drops touch-path adds |
| H6 | **Low** | `stt_handler.py` | Synthetic `no_speech` on WS close can fire after an explicit `stop()` + `flush` in a narrow timing window |

### Proposed fixes

**H1 (one line):** Add `ttsRef?.current?.bargeIn()` to `VoiceConversationPanel`
`handleToggle()` before `startSttPress()`, mirroring `VoiceOrderButton.tsx:120`.

**H2 + H3 (the real fix):** Carry `(sentence, turn_id)` tuples through the
`tts_queue`. The orchestrator already tracks `turn_count` (`orchestrator.py:83`);
pass it into `process_turn_streaming()` and tag each sentence. In the TTS loop
(`voice.py:404-428`), read the session's `current_turn_id` and discard any tuple
where `sentence_turn_id < current_turn_id`. When a new STT WebSocket opens, bump
`session.current_turn_id` before the new orchestrator call starts.

**H4 (one line):** `asyncio.Queue(maxsize=20)` in `session_manager.py:40`.

**H5 (design clarification needed):** Current behaviour — cart_sync replaces order
state entirely (`_apply_cart_sync` lines 222-257). This is intentional for keeping
voice and touch carts in sync, but the 500ms receive timeout means a touch add that
arrives marginally late will be lost. For the pilot (single kiosk, single user) the
race is unlikely; document the known limitation and address post-pilot if needed.

**H6:** Low priority for pilot. The `terminalReceived` flag already mitigates
duplicate emission; the window is sub-millisecond. No action pre-pilot.

### Pilot blocking verdict
- **Must fix before pilot:** H1, H2, H3, H4
- **Document and defer:** H5, H6

---

## 10. Dead code removed  `#done`

Cleaned up during the voice path audit (2026-05-30). No logic changed.

- **Deleted:** `apps/kiosk/src/components/CompactCard.tsx` — 26-line card
  component, zero imports.
- **Deleted:** `apps/kiosk/src/components/NavLink.tsx` — 28-line react-router
  compat shim, zero imports.
- **Removed stale TODO:** `VoiceAssistantOverlay` entry in
  `apps/kiosk/docs/TODOs.md` — the file it referenced had already been deleted;
  only the TODO text remained.
- **Left in place:** `apps/kiosk/src/components/UpsellPrompt.tsx` — built for
  touch recommendation Pattern 1, deferred but not abandoned.
- **Left in place:** `apps/voice-test-page/` — development spike for voice
  pipeline validation, goal accomplished. Contains slightly stale copies of the
  voice lib (`sttClient`, `ttsClient`, etc.) vs the kiosk canonical. Delete when
  it stops being useful as a debugging harness.

---

## 11. Implementation plan — ordered work items  `#plan`

All items below are pre-pilot unless marked otherwise. Grouped by dependency order.

### Track A — Voice path hardening ✅ Done

**A1. H1 fix — `VoiceConversationPanel` bargeIn** ✅
- `VoiceConversationPanel.tsx`: added `ttsHandle?.current?.bargeIn()` at the top
  of the PTT press branch in `handleToggle()`.
- `VoiceOrderButton.tsx`: exposed `TtsClientHandle` via new `onTtsReady` callback prop.
- `apps/kiosk/src/pages/Index.tsx`: wired the ref between the two components via
  `voiceTtsHandleRef`.

**A2. H2+H3 fix — turn ID in tts_queue** ✅
- `session_manager.py`: added `current_turn_id: int = 0` and `maxsize=20` to
  `VoiceSession.tts_queue`.
- `voice.py` STT handler: increments `session.current_turn_id` before STT starts;
  tags each sentence/sentinel as `(payload, turn_id)` before enqueuing.
- `voice.py` TTS loop: unpacks tuples; discards items where
  `item_turn_id < session.current_turn_id`.

**A3. H4 fix — queue maxsize** ✅ (folded into A2 above)

---

### Track B — Menu intelligence, Tier 0 (resolver correctness) ✅ Done

**B1. Plural/singular robustness** ✅
- `normalizer.py`: added step 7 — strips trailing `-s` from the last token when
  the result is ≥ 3 chars. Applied symmetrically to user input AND indexed names,
  so alias keys normalise the same way as queries.
- `resolver.py` `_fuzzy_pass()`: extended candidate pool to
  `entry_names + alias_keys`; alias hits are resolved back to their target
  `IndexEntry` so all five cascade steps can match aliases, not just Step 2.
- Tests: added `TestPluralStripping` (6 cases) to `test_normalizer.py` and
  `TestPluralSingular` (4 DB-backed cases) to `test_resolver.py`; updated two
  stale alias key assertions in `test_loader.py`.

---

### Track C — Menu intelligence, Tier 1 (category navigation) ✅ Done

**C1. `ChooseFromCategory` result type** ✅
- `models.py`: added `ChooseFromCategory(category, options, score, match_method)`;
  added to `ResolveResult` union.

**C2. Category resolution** ✅ *(approach deviated from plan)*
- Plan called for synthetic `IndexEntry` rows with `is_category_entry = True`
  in `loader.py` and resolver logic to detect them.
- **Actual:** implemented `_find_category(raw_name, index)` as a module-level
  helper in `orchestrator.py`. It searches `index.categories` directly (exact
  normalized match → fuzzy token_sort ≥ 75) and returns
  `(display_name, list[ConfidentMatch])`. This keeps category results entirely
  out of the item-resolver cascade, avoiding contamination of `add_item` /
  `remove_item` resolution.

**C3. Orchestrator `_handle_browse()` branch** ✅
- `orchestrator.py`: `_handle_browse()` calls `_find_category()`; emits
  `{"status": "choose_from_category"}` outcome (capped at 8 items in the
  outcome dict; Pass-2 lists them and invites the customer to choose).
- `system_prompt.py`: added `browse_category` to Pass-1 action taxonomy (with
  example); added `choose_from_category` branch to `_format_turn_outcomes()`.

**C4. `select_variant` → `_handle_add()` continuity** ✅
- No code change needed — `select_variant` already routes to `_handle_add()`.
  Verified: customer says category → bot lists options → customer picks one →
  next turn `select_variant` resolves and adds correctly.

---

### Track D — Menu intelligence, Tier 2 (attribute awareness) ✅ Done

**D1. `filter` Pass-1 action + `_handle_filter()`** ✅
- `system_prompt.py`: added `filter` action (fields: `attribute`, optional
  `category`) + two examples (veg pasta, non-veg general).
- `orchestrator.py`: `_handle_filter()` maps `attribute` → `is_veg` bool, narrows
  by category via `_find_category()` if given, builds a filtered
  `ChooseFromCategory`. Reuses the same `choose_from_category` outcome + Pass-2
  rendering from Track C.

**D2. Description token indexing** ✅
- `loader.py`: added `_DESC_SKIP` stop-word set and `_add_description_aliases()` —
  generates bigrams from meaningful tokens (≥ 3 chars, not in stop-word list),
  adds them to `index.aliases` before curated DB/JSON aliases (so curated entries
  always override). Called in both `load_menu_from_db()` and `load_menu()`.
- Result: Silver SSC alias count grew from ~77 (curated) to ~143 (curated +
  description-derived). Key examples: `"peanut butter"` → PB & J,
  `"white sauce"` → Alfredo, `"peri peri"` → Peri Peri Fries.
- `test_loader.py`: updated alias range assertion to `130 ≤ n ≤ 160`.

---

### Track E — Menu intelligence, Tier 3 (recommend intent + MenuGraph) ✅ Done

**E1. `recommend` Pass-1 action + `_handle_recommend()`** ✅
- Consent bug fixed: "suggest me a pancake" no longer adds to cart.
- `system_prompt.py`: added `recommend` action with CRITICAL note distinguishing
  it from `add_item` (keyed on "suggest / recommend / what's good" language); two
  examples; `recommend` branch in `_format_turn_outcomes()` with explicit "NOT
  added to cart" instruction.
- `orchestrator.py`: `_handle_recommend()` — three-tier fallback:
  1. Named item → resolve → suggest without adding (or browse category if category match)
  2. Cart has items → look up `MenuGraph.pairs_for()` for cart items → suggest pairings
  3. Empty cart or no pairs → `MenuGraph.top_anchors` (chef picks then bestsellers)
  Degrades gracefully to `menu_question` if `menu_graph` is `None`.

**E2. `MenuGraph` precomputed in-memory graph** ✅
- New file `src/menu_graph.py`: `AnchorEntry`, `MenuGraph` (with
  `anchors_by_type()`, `pairs_for()`, `top_anchors` property),
  `load_menu_graph_from_db()`.
- Loads `anchor_items` (8 rows for Silver) and `item_pairings` (30 source items,
  32 edges), keyed by `json_id`. `meal_completion_rules` is currently empty
  (owner session pending) — not yet wired.
- Wired end-to-end: `backend/main.py` → `_load_menu_graphs()` at startup +
  refresh every 6 h; `SessionManager` stores `_menu_graphs` dict and passes
  `menu_graph=` to each new `Orchestrator` instance.
- NOT injected into LLM prompts.

---

### Track F — Test coverage ✅ Done

**F1. `test_silver_voice_intents.py` — end-to-end with real DB + real MenuGraph** ✅
- `test_browse_hot_coffee` — browse_category → `ChooseFromCategory` with correct items, no order change
- `test_browse_unknown_category` — unknown category → 0 resolver_results, no feedback
- `test_filter_veg_items` / `test_filter_non_veg_items` — attribute filter → `ChooseFromCategory`
- `test_recommend_named_item_not_added` — consent bug guard; avocado toast resolved but NOT added
- `test_recommend_uses_anchors_when_cart_empty` — real graph, chef picks surfaced
- `test_recommend_uses_pairings_when_cart_nonempty` — real graph, cappuccino + cold brew suggested for avocado toast

**F2. `test_orchestrator.py` — unit-style with fake `MenuGraph` fixtures** ✅
- Browse: exact match (6 Hot Coffee items), fuzzy match ("smoothie bowl" → "Smoothie Bowls"), unknown falls back
- Filter: veg-only verified against `menu_index`, non-veg (5 Silver items), category narrowing (Fries), non-veg-in-Fries → no_match
- Recommend: named item not added, cart pairings with synthetic graph, anchor fallback, graceful no-graph degradation

**Counts:** 165 passed, 3 skipped (was 147 passed before Track F). 18 new tests added.

---

## 12. Decisions vs still-open — updated ledger

**[IMPLEMENTED]**
- Menu resolver is generic/menu-agnostic. ✅
- Category navigation → `ChooseFromCategory` (Option B). ✅
- Intelligence must be menu-data-driven, never per-menu hardcoded. ✅
- LLM owns intent type; resolver owns item identity. ✅
- Graph is for relationships (Tier 3 / Track E), not matching speed, not in prompt. ✅
- **Separate Pass-1 actions** for `browse_category`, `recommend`, `filter`. ✅
- All three new actions landed pre-pilot (Tracks C–E). ✅
- Voice hardening H1–H4 fixed (Tracks A–B); H5–H6 documented and deferred. ✅
- Dead code removed (§10). ✅
- Category resolution kept out of main resolver cascade — `_find_category()` helper
  in orchestrator searches `index.categories` directly. ✅ *(implementation note)*
- Description bigrams added to alias index (collision-safe: curated DB aliases
  always win). ✅ *(implementation note)*
- `meal_completion_rules` wiring deferred — table is empty pending owner session.

**[OPEN / PENDING]**
- `meal_completion_rules` integration into `_handle_recommend()` — table is empty
  pending an owner session to populate it. Once rows exist, wire a Tier 4 path in
  `_handle_recommend()` before the anchor fallback.

**[CLOSED]**
- `voice-test-page/` — confirmed orphan (no workspace, CI, or deploy reference).
  Deleted 2026-05-30.
- POS `restaurant_id` audit (2026-05-30): **kiosk path is clean** — `orderSubmission.ts`
  explicitly sets `restaurant_id: RESTAURANT_ID` on both `orders` (line 145) and
  `kot_tickets` (line 168). **POS path has a gap** — `POSLayout.tsx` inserts both
  tables without `restaurant_id`, so POS-created rows land with `NULL`. Column is
  nullable (migration 0007 adds no NOT NULL constraint), so no error fires. For the
  single-restaurant pilot this is benign — all rows belong to Silver regardless.
  Becomes a real multi-tenant bug when a second restaurant is onboarded. Fix then,
  not now.
