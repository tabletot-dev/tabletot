# Stage 2 Specification — LLM Intent Extraction + Resolver

## What to Build

A conversation layer that takes natural language input (simulating what STT would produce), uses an LLM to extract structured ordering intents, passes those intents to the existing menu resolver, manages a running order state, and handles multi-turn conversation including ambiguity resolution, order modification, and confirmation.

---

## Module Breakdown

### 1. `src/llm/base.py` — Provider Interface

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class LLMResponse:
    """Raw response from an LLM provider."""
    intents: list[dict]           # Parsed intent objects
    response_text: str            # Natural language response for the customer
    detected_language: str        # "en", "hi", "te"
    raw_output: str               # Raw string from the API (for debugging/logging)
    model: str                    # Model identifier used (e.g., "claude-sonnet-4-20250514")
    provider: str                 # "claude", "openai", "gemini"
    prompt_tokens: int            # Token usage for cost tracking
    completion_tokens: int

class LLMProvider(ABC):
    """Abstract interface for LLM providers."""

    @abstractmethod
    def extract_intents(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        resolver_feedback: list[dict] | None = None,
        order_state: dict | None = None,
    ) -> LLMResponse:
        """
        Extract ordering intents from a customer transcript.

        Args:
            transcript: The customer's speech (raw text from STT or typed input)
            menu_context: Simplified menu summary (names, categories, no prices/IDs)
            conversation_history: List of previous turns [{role, content}, ...]
            resolver_feedback: Feedback from resolver on previous turn
                               (e.g., ambiguous candidates, unavailable items)
            order_state: Current order summary for context

        Returns:
            LLMResponse with extracted intents and conversational response
        """
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        pass
```

This is the ONLY interface the orchestrator uses. It never imports `anthropic` or `openai` directly.

### 2. `src/llm/claude_provider.py` — Claude Implementation

Full implementation using the Anthropic SDK.

```python
import anthropic
from .base import LLMProvider, LLMResponse
from .prompts.system_prompt import build_system_prompt
from .intent_parser import parse_intents

class ClaudeProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def extract_intents(self, transcript, menu_context, conversation_history,
                        resolver_feedback=None, order_state=None) -> LLMResponse:
        system_prompt = build_system_prompt(menu_context, resolver_feedback, order_state)

        messages = [*conversation_history, {"role": "user", "content": transcript}]

        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )

        raw_output = response.content[0].text
        intents, response_text, detected_language = parse_intents(raw_output)

        return LLMResponse(
            intents=intents,
            response_text=response_text,
            detected_language=detected_language,
            raw_output=raw_output,
            model=self.model,
            provider="claude",
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
        )

    def get_provider_name(self) -> str:
        return "claude"
```

### 3. `src/llm/openai_provider.py` — OpenAI Stub

```python
from .base import LLMProvider, LLMResponse

class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.api_key = api_key
        self.model = model

    def extract_intents(self, transcript, menu_context, conversation_history,
                        resolver_feedback=None, order_state=None) -> LLMResponse:
        raise NotImplementedError(
            "OpenAI provider not yet implemented. "
            "Implement using the same system prompt contract as ClaudeProvider."
        )

    def get_provider_name(self) -> str:
        return "openai"
```

### 4. `src/llm/gemini_provider.py` — Gemini Stub

Same pattern as OpenAI stub. `raise NotImplementedError(...)`.

### 5. `src/llm/prompts/menu_summary.py` — Menu Summary Generator

Generates the simplified menu text that goes into the LLM prompt. This is derived from `menu.json` but contains **NO prices and NO IDs**.

```python
def generate_menu_summary(menu_data: dict) -> str:
    """
    Generate a simplified menu summary for LLM context injection.

    Output format:
    ## Category Name (Available HH:MM-HH:MM)
    - Item Name [V/NV] — description
    - Item Name — choose: Variant1, Variant2
    - Item Name (Choose: Modifier Label: Option1/Option2)

    Returns a string of ~2,400 tokens.
    """
```

The summary is generated ONCE at startup and reused for every LLM call. It includes:
- Category names with time windows if applicable
- Item names with [V] or [NV] tags
- Descriptions where available
- Variant options listed as "choose: X, Y, Z"
- Modifier options listed as "(Choose: Label: Option1/Option2)"
- Add-on groups mentioned at the category level

### 6. `src/llm/prompts/system_prompt.py` — System Prompt Builder

Builds the full system prompt by combining:
1. The role instruction (you are a restaurant ordering assistant)
2. The menu summary
3. The intent output format specification
4. Resolver feedback from previous turn (if any)
5. Current order state (if any)

See `docs/SYSTEM-PROMPT.md` for the full prompt text.

```python
def build_system_prompt(
    menu_context: str,
    resolver_feedback: list[dict] | None = None,
    order_state: dict | None = None,
) -> str:
    """Build the complete system prompt for intent extraction."""
```

### 7. `src/llm/intent_parser.py` — Intent Parser

Parses the LLM's raw text output into structured intents. The LLM is instructed to output JSON inside `<intents>` tags and a response text inside `<response>` tags.

```python
def parse_intents(raw_output: str) -> tuple[list[dict], str, str]:
    """
    Parse LLM output into (intents_list, response_text, detected_language).

    Expected LLM output format:
    <intents>
    [
      {"action": "add_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""},
      {"action": "add_item", "raw_name": "garlic naan", "quantity": 2, "modifiers": [], "special_notes": "extra butter"}
    ]
    </intents>
    <response>Butter chicken aur do garlic naan, extra butter ke saath. Kuch aur chahiye?</response>
    <language>hi</language>

    If parsing fails (malformed JSON, missing tags), return a safe fallback:
    - intents = [] (no action taken)
    - response_text = raw_output (show whatever the LLM said)
    - detected_language = "en" (default)

    Log a warning when parsing fails — this indicates a prompt issue.
    """
```

**Validation rules for each intent:**
- `action` must be one of: `add_item`, `remove_item`, `modify_item`, `select_variant`, `confirm_order`, `ask_menu`, `accept_upsell`, `reject_upsell`, `none`
- `raw_name` must be a non-empty string (for `add_item`, `remove_item`, `modify_item`, `select_variant`)
- `quantity` must be a positive integer, default 1
- `modifiers` must be a list of strings (can be empty)
- `special_notes` must be a string (can be empty)
- Invalid intents are dropped with a warning, not crashes

### 8. `src/orchestrator.py` — The Orchestrator

This is the central coordinator. It wires LLM → Resolver → Order State.

```python
class Orchestrator:
    def __init__(self, provider: LLMProvider, menu_index: MenuIndex, menu_data: dict):
        self.provider = provider
        self.menu_index = menu_index
        self.menu_context = generate_menu_summary(menu_data)
        self.order_state = OrderState()
        self.conversation_history: list[dict] = []
        self.pending_feedback: list[dict] | None = None

    def process_turn(self, user_input: str, current_time: datetime | None = None) -> TurnResult:
        """
        Process one conversation turn.

        1. Call LLM with transcript + menu context + history + feedback + order state
        2. Parse intents from LLM response
        3. For each intent:
           a. If action is add_item/remove_item/modify_item/select_variant:
              - Call resolver with raw_name
              - Handle result (match → add to order, ambiguous → queue feedback, etc.)
           b. If action is confirm_order: finalize order
           c. If action is ask_menu/none: no resolver call needed
        4. Collect resolver feedback for ambiguous/no-match/unavailable results
        5. Update conversation history
        6. Return TurnResult with everything that happened

        Returns:
            TurnResult containing LLM response, resolver results, order state, feedback
        """
```

```python
@dataclass
class TurnResult:
    """Complete result of one conversation turn."""
    user_input: str
    llm_response: LLMResponse           # What the LLM said and extracted
    resolver_results: list[ResolverCall] # One per intent that needed resolution
    order_state_snapshot: dict           # Current order after this turn
    pending_feedback: list[dict] | None  # Feedback to send to LLM next turn
    turn_number: int

@dataclass
class ResolverCall:
    """Record of one resolver call within a turn."""
    intent: dict                         # The intent that triggered this call
    raw_name: str                        # What was sent to resolver
    result: ResolveResult                # What resolver returned
    applied_to_order: bool               # Whether this actually changed the order
    feedback_generated: dict | None      # If ambiguous/nomatch, the feedback dict
```

**Orchestrator flow for each intent action:**

`add_item`:
1. Call `resolve(intent.raw_name, menu_index, current_time)`
2. If `ConfidentMatch` → add to order state, no feedback
3. If `NeedsVariantSelection` → don't add to order, generate feedback: `{"type": "needs_variant", "item": group_name, "variants": [...]}`
4. If `Ambiguous` → don't add to order, generate feedback: `{"type": "ambiguous", "input": raw_name, "candidates": [...]}`
5. If `NoMatch` → don't add to order, generate feedback: `{"type": "no_match", "input": raw_name, "suggestions": [...]}`
6. If `Unavailable` → don't add to order, generate feedback: `{"type": "unavailable", "item": item_name, "reason": reason}`

`remove_item`:
1. Call `resolve(intent.raw_name, ...)` to identify which item
2. If match found AND item is in current order → remove from order
3. If match found but item NOT in order → generate feedback: `{"type": "not_in_order", "item": item_name}`

`modify_item`:
1. Resolve the item
2. If match found AND in order → update quantity/notes
3. Else → feedback

`select_variant`:
1. This comes after an ambiguity/variant feedback. The LLM should send `raw_name` as the specific variant chosen.
2. Resolve it — should get a ConfidentMatch now
3. Add to order

`confirm_order`:
1. If order has items → mark order as confirmed
2. If order is empty → feedback: `{"type": "empty_order"}`

`ask_menu`:
1. No resolver call. The LLM's response_text already contains the answer.
2. Just record it in history.

`none`:
1. No action. Customer said something conversational.

**Conversation history management:**
- Append each turn to history: `{"role": "user", "content": transcript}` and `{"role": "assistant", "content": llm_response_text}`
- Keep a rolling window of last 10 turns (configurable) to avoid token overflow
- The LLM also receives the current order state as context, so it doesn't need full history to know what's been ordered

### 9. `src/order_state.py` — Order State Manager

Simple in-memory accumulator.

```python
@dataclass
class OrderItem:
    item_id: str
    item_name: str
    quantity: int
    unit_price: int
    special_notes: str
    modifiers: list[str]
    category: str

class OrderState:
    def __init__(self):
        self.items: list[OrderItem] = []
        self.status: str = "building"    # building | confirmed
        self.language: str = "en"

    def add_item(self, item_id, item_name, quantity, unit_price, special_notes="",
                 modifiers=None, category="") -> None:
        """Add item or increment quantity if already exists (same id + same notes)."""

    def remove_item(self, item_id: str) -> bool:
        """Remove item by id. Returns True if found and removed."""

    def modify_quantity(self, item_id: str, new_quantity: int) -> bool:
        """Update quantity. If new_quantity <= 0, remove the item."""

    def update_notes(self, item_id: str, notes: str) -> bool:
        """Update special notes for an item."""

    def confirm(self) -> bool:
        """Mark order as confirmed. Returns False if empty."""

    def clear(self) -> None:
        """Clear all items and reset to building."""

    def get_total(self) -> int:
        """Calculate total price."""

    def to_summary_dict(self) -> dict:
        """Return order state as dict for LLM context injection.
        Includes item names, quantities, notes. NO ids (LLM doesn't need them)."""

    def to_display_dict(self) -> dict:
        """Return full order state for CLI display.
        Includes ids, prices, everything."""

    def is_empty(self) -> bool:
        return len(self.items) == 0
```

### 10. `cli/conversation.py` — Conversation CLI

Multi-turn interactive conversation mode.

```bash
python -m cli.conversation [--provider claude|openai|gemini] [--time HH:MM]
```

**Startup:**
1. Load `.env` for API keys
2. Load `menu.json`, build index
3. Generate menu summary
4. Initialize chosen LLM provider
5. Initialize orchestrator
6. Print welcome banner with provider name, model, menu stats

**Each turn:**
1. Prompt: `customer> `
2. Check for commands:
   - `!order` — show current order state
   - `!clear` — clear order and reset conversation
   - `!provider <name>` — switch provider mid-session
   - `!raw` — show raw LLM output for last turn (debugging)
   - `!history` — show conversation history
   - `!stats` — show Stage 2 review stats
   - `!failures` — show Stage 2 failures
   - `!time <HH:MM>` / `!time reset` — simulate time
   - `!quit` — exit
3. If not a command, pass to `orchestrator.process_turn()`
4. Display results:

```
customer> bhaiya ek butter chicken aur do garlic naan dena

🤖 AI Response: Butter chicken aur do garlic naan, done! Kuch aur chahiye?
   Language: hi | Tokens: 342 in / 89 out

   Intent 1: add_item "butter chicken" ×1
   └── ✅ Butter Chicken — ₹539 [exact]

   Intent 2: add_item "garlic naan" ×2
   └── ✅ Naan - Garlic — ₹129 [alias]

📋 Current Order:
   1. Butter Chicken ×1 — ₹539
   2. Naan - Garlic ×2 — ₹258
   Total: ₹797

   [p]ass / [f]ail / [s]kip?
```

**For ambiguity:**
```
customer> ek coffee dena

🤖 AI Response: Kaun si coffee chahiye? Humara paas Americano, Cappuccino, Latte, Filter Coffee aur bahut options hain.
   Language: hi | Tokens: 380 in / 95 out

   Intent 1: add_item "coffee" ×1
   └── ❓ Ambiguous — 8 candidates: South Indian Filter Coffee, Iced Americano, Americano, ...

📋 Current Order: (unchanged)
   1. Butter Chicken ×1 — ₹539
   2. Naan - Garlic ×2 — ₹258
   Total: ₹797

   [p]ass / [f]ail / [s]kip?
```

Then the customer's next turn:
```
customer> filter coffee

🤖 AI Response: Filter coffee, added! Kuch aur?
   Language: hi | Tokens: 412 in / 52 out

   Intent 1: select_variant "filter coffee" ×1
   └── ✅ South Indian Filter Coffee — ₹229 [alias]

📋 Current Order:
   1. Butter Chicken ×1 — ₹539
   2. Naan - Garlic ×2 — ₹258
   3. South Indian Filter Coffee ×1 — ₹229
   Total: ₹1,026

   [p]ass / [f]ail / [s]kip?
```

5. Log to review DB with Stage 2 fields

### 11. Review System Extension

Add new columns to the `interactions` table (or create a new `stage2_interactions` table — your choice, but a new table is cleaner):

```sql
CREATE TABLE IF NOT EXISTS conversation_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,           -- groups turns in one conversation
    turn_number INTEGER NOT NULL,
    user_input TEXT NOT NULL,
    provider TEXT NOT NULL,             -- "claude", "openai", "gemini"
    model TEXT NOT NULL,                -- "claude-sonnet-4-20250514", etc.
    prompt_tokens INTEGER,
    completion_tokens INTEGER,

    -- LLM output
    raw_llm_output TEXT NOT NULL,
    response_text TEXT NOT NULL,
    detected_language TEXT,
    intents_json TEXT NOT NULL,         -- JSON array of extracted intents

    -- Resolver results (one per intent that went to resolver)
    resolver_results_json TEXT,         -- JSON array of {intent, result_type, item_id, score, ...}

    -- Order state after this turn
    order_state_json TEXT,

    -- Review
    verdict TEXT,                       -- "pass", "fail", "skip", null
    failure_layer TEXT,                 -- "llm", "resolver", "orchestrator", null
    notes TEXT
);
```

The `failure_layer` field is critical. When you mark a turn as "fail", you also indicate WHERE it failed:
- `llm` — the LLM extracted wrong intents (wrong item name, wrong quantity, missed an item)
- `resolver` — the LLM extracted correctly but the resolver matched wrong
- `orchestrator` — both layers worked but the orchestrator logic (feedback loop, order state update) was wrong

---

## Build Order

1. **`src/order_state.py`** + **`tests/test_order_state.py`** — Order state manager. Pure data structure, no dependencies. Test add/remove/modify/confirm/clear/total.

2. **`src/llm/prompts/menu_summary.py`** + **`tests/test_menu_summary.py`** — Menu summary generator. Takes `menu.json` data, outputs simplified text. Test that output contains no prices, no IDs, correct category count.

3. **`src/llm/intent_parser.py`** + **`tests/test_intent_parser.py`** — Parse LLM output tags. Test with valid output, malformed JSON, missing tags, invalid actions. This has NO API dependency — it's just string parsing.

4. **`src/llm/base.py`** — Abstract provider interface. No tests needed (abstract class).

5. **`src/llm/prompts/system_prompt.py`** — System prompt builder. Combines role + menu + feedback + order state into one prompt string. See `docs/SYSTEM-PROMPT.md` for the full prompt text.

6. **`src/llm/claude_provider.py`** — Claude implementation. Requires API key. Don't write unit tests that call the real API — those are integration tests run manually.

7. **`src/llm/openai_provider.py`** + **`src/llm/gemini_provider.py`** — Stubs with `NotImplementedError`.

8. **`src/orchestrator.py`** + **`tests/test_orchestrator.py`** — The main wiring. Test with a **mock provider** (a fake LLMProvider that returns predetermined intents). This lets you test orchestrator logic without API calls. Test scenarios: single item add, multi-item add, ambiguity → resolution, remove item, confirm empty order, unavailable item.

9. **Review system extension** — Add `conversation_turns` table to `review/logger.py`. Add reporting for Stage 2 data.

10. **`cli/conversation.py`** — Conversation CLI. This is the integration point — tests happen interactively.

11. **`data/conversation_tests/`** — Write multi-turn test scenarios (see `docs/CONVERSATION-TESTS.md`).

---

## Testing Strategy

**Unit tests (run without API keys):**
- `test_order_state.py` — pure data structure tests
- `test_menu_summary.py` — summary generation from menu.json
- `test_intent_parser.py` — parsing with canned LLM outputs
- `test_orchestrator.py` — orchestrator with mock LLM provider

**Integration tests (need API key, run manually):**
- `cli/conversation.py` — interactive testing with real LLM
- The review system captures results for analysis

**Existing tests must continue passing:**
- All 63 Stage 1 unit tests
- All 98 Stage 1 batch tests

---

## Configuration

```python
# src/llm/config.py (or constants at top of modules)

MAX_CONVERSATION_HISTORY = 10    # Rolling window of turns sent to LLM
MAX_TOKENS = 1024                # LLM max response tokens
DEFAULT_PROVIDER = "claude"
DEFAULT_MODEL = "claude-sonnet-4-20250514"
```

## .env.example

```
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# GOOGLE_API_KEY=...
```
