# Orchestrator — Specification

## What It Does

The orchestrator is the single coordination point. It receives a customer's natural language input, routes it through the LLM for intent extraction, passes each extracted intent to the resolver, updates the order state, and prepares feedback for the next turn.

```
User input → Orchestrator → LLM (extract intents)
                          → Resolver (match each intent)
                          → Order State (apply changes)
                          → Feedback (for next LLM call)
                          → TurnResult (for CLI display + logging)
```

---

## Two Entry Points

The orchestrator exposes two public methods with identical semantics but different delivery:

| Method | When to use | How Pass 2 runs |
|--------|-------------|-----------------|
| `process_turn()` | CLI, unit tests | Blocking — returns full `TurnResult` |
| `process_turn_streaming()` | Voice WebSocket | Async generator — yields sentences then `TurnResult` |

Both call the same private `_resolve()` method for Pass 1 + resolver, so order state mutations happen identically in both paths.

---

## Core Flow: `process_turn()`

```python
def process_turn(self, user_input: str, current_time: datetime | None = None) -> TurnResult:
```

### Step-by-step:

**1. Build context for LLM call:**
- `menu_context` — the simplified menu summary (static, built once)
- `conversation_history` — rolling window of last N turns
- `resolver_feedback` — feedback from the PREVIOUS turn (ambiguous items, unavailable items, etc.)
- `order_state` — current order summary (item names and quantities, no IDs/prices)

**2. Call LLM provider:**
```python
llm_response = self.provider.extract_intents(
    transcript=user_input,
    menu_context=self.menu_context,
    conversation_history=self.conversation_history,
    resolver_feedback=self.pending_feedback,
    order_state=self.order_state.to_summary_dict() if not self.order_state.is_empty() else None,
)
```

**3. Process each intent:**

Iterate through `llm_response.intents`. For each intent, determine the action and handle it:

```python
resolver_results = []
new_feedback = []

for intent in llm_response.intents:
    action = intent.get("action")

    if action == "add_item":
        result = resolve(intent["raw_name"], self.menu_index, current_time)

        if isinstance(result, ConfidentMatch):
            self.order_state.add_item(
                item_id=result.item_id,
                item_name=result.item_name,
                quantity=intent.get("quantity", 1),
                unit_price=result.price,
                special_notes=intent.get("special_notes", ""),
                modifiers=intent.get("modifiers", []),
                category=result.category,
            )
            resolver_results.append(ResolverCall(intent, intent["raw_name"], result, applied_to_order=True, feedback_generated=None))

        elif isinstance(result, NeedsVariantSelection):
            feedback = {
                "type": "needs_variant",
                "input": intent["raw_name"],
                "item": result.group_name,
                "variants": [{"name": v.name, "parent": v.parent_name} for v in result.variants],
            }
            new_feedback.append(feedback)
            resolver_results.append(ResolverCall(intent, intent["raw_name"], result, applied_to_order=False, feedback_generated=feedback))

        elif isinstance(result, Ambiguous):
            feedback = {
                "type": "ambiguous",
                "input": intent["raw_name"],
                "candidates": [{"name": c.item_name if isinstance(c, ConfidentMatch) else c.group_name} for c in result.candidates],
            }
            new_feedback.append(feedback)
            resolver_results.append(ResolverCall(intent, intent["raw_name"], result, applied_to_order=False, feedback_generated=feedback))

        elif isinstance(result, NoMatch):
            feedback = {
                "type": "no_match",
                "input": intent["raw_name"],
                "suggestions": [name for name, score in result.suggestions],
            }
            new_feedback.append(feedback)
            resolver_results.append(ResolverCall(intent, intent["raw_name"], result, applied_to_order=False, feedback_generated=feedback))

        elif isinstance(result, Unavailable):
            feedback = {
                "type": "unavailable",
                "input": intent["raw_name"],
                "item": result.item_name,
                "reason": result.reason,
            }
            new_feedback.append(feedback)
            resolver_results.append(ResolverCall(intent, intent["raw_name"], result, applied_to_order=False, feedback_generated=feedback))

    elif action == "remove_item":
        result = resolve(intent["raw_name"], self.menu_index, current_time)
        if isinstance(result, ConfidentMatch):
            removed = self.order_state.remove_item(result.item_id)
            if not removed:
                new_feedback.append({"type": "not_in_order", "item": result.item_name})
            resolver_results.append(ResolverCall(intent, intent["raw_name"], result, applied_to_order=removed, feedback_generated=None))
        # If resolve fails for remove, treat same as add failures

    elif action == "modify_item":
        result = resolve(intent["raw_name"], self.menu_index, current_time)
        if isinstance(result, ConfidentMatch):
            qty = intent.get("quantity", 1)
            if qty > 0:
                self.order_state.modify_quantity(result.item_id, qty)
            notes = intent.get("special_notes", "")
            if notes:
                self.order_state.update_notes(result.item_id, notes)
            resolver_results.append(ResolverCall(intent, intent["raw_name"], result, applied_to_order=True, feedback_generated=None))

    elif action == "select_variant":
        # Customer is responding to a variant/ambiguity question
        # Treat it the same as add_item — resolve the specific choice
        result = resolve(intent["raw_name"], self.menu_index, current_time)
        if isinstance(result, ConfidentMatch):
            self.order_state.add_item(
                item_id=result.item_id,
                item_name=result.item_name,
                quantity=intent.get("quantity", 1),
                unit_price=result.price,
                special_notes=intent.get("special_notes", ""),
                modifiers=intent.get("modifiers", []),
                category=result.category,
            )
            resolver_results.append(ResolverCall(intent, intent["raw_name"], result, applied_to_order=True, feedback_generated=None))
        # If it's still ambiguous/nomatch, generate feedback again

    elif action == "confirm_order":
        if self.order_state.is_empty():
            new_feedback.append({"type": "empty_order"})
        else:
            self.order_state.confirm()

    elif action in ("ask_menu", "none"):
        # No resolver call needed
        pass
```

**4. Store feedback for next turn:**
```python
self.pending_feedback = new_feedback if new_feedback else None
```

**5. Update conversation history:**
```python
self.conversation_history.append({"role": "user", "content": user_input})
self.conversation_history.append({"role": "assistant", "content": llm_response.response_text})

# Trim to rolling window
if len(self.conversation_history) > MAX_CONVERSATION_HISTORY * 2:
    self.conversation_history = self.conversation_history[-(MAX_CONVERSATION_HISTORY * 2):]
```

**6. Build and return TurnResult:**
```python
return TurnResult(
    user_input=user_input,
    llm_response=llm_response,
    resolver_results=resolver_results,
    order_state_snapshot=self.order_state.to_display_dict(),
    pending_feedback=self.pending_feedback,
    turn_number=self.turn_count,
)
```

---

## Feedback Format

Feedback is built by the orchestrator and formatted into the system prompt by `system_prompt.py`. The orchestrator produces structured dicts:

```python
# Variant needed
{"type": "needs_variant", "input": "waffle", "item": "Belgian Waffle", "variants": [{"name": "Nutella & Banana"}, {"name": "Classic"}]}

# Ambiguous
{"type": "ambiguous", "input": "coffee", "candidates": [{"name": "South Indian Filter Coffee"}, {"name": "Iced Americano"}, ...]}

# No match
{"type": "no_match", "input": "masala dosa", "suggestions": ["Vada Pav", "Dal Pakvan", "Sabudana Vada"]}

# Unavailable
{"type": "unavailable", "input": "english breakfast", "item": "English Breakfast", "reason": "Available 07:00-11:00"}

# Not in order (for remove)
{"type": "not_in_order", "item": "Butter Chicken"}

# Empty order (for confirm)
{"type": "empty_order"}
```

The `system_prompt.py` module converts these dicts into natural language for the LLM's system prompt.

---

## Streaming Flow: `process_turn_streaming()`

Used by the voice WebSocket path to pipeline Pass 2 tokens directly into TTS, cutting ~1–2s off perceived latency.

```python
async def process_turn_streaming(
    self, user_input: str, current_time: datetime | None = None
) -> AsyncIterator[str | TurnResult]:
```

**Yields:**
- `str` — a sentence chunk from Pass 2 as it streams (pipe to TTS queue immediately)
- `TurnResult` — the final result, yielded last once streaming completes

**Usage in voice.py:**
```python
async for item in session.orchestrator.process_turn_streaming(transcript):
    if isinstance(item, str):
        await session.tts_queue.put(item)   # sentence → TTS starts playing
    else:
        result = item                        # TurnResult, yielded last
await session.tts_queue.put(TURN_END)       # signals speech_complete to client
```

**How it works internally:**
1. `_resolve()` runs in a thread (`asyncio.to_thread`) — it calls the sync LLM for Pass 1 and runs the resolver. Order state is mutated here.
2. `provider.generate_response_stream()` runs in the event loop directly — uses the async LLM client (e.g. `AsyncAnthropic`).
3. Each sentence chunk is yielded as it arrives.
4. After the stream ends, `_build_turn_result()` assembles the `TurnResult` from the joined sentences and yields it.

**TTS queue protocol:** the queue carries `str | TURN_END | None`.
- `str` — speak this sentence, no `speech_complete` yet
- `TURN_END` sentinel — all sentences spoken, send `speech_complete` to client
- `None` — session shutdown

---

## Internal: `_resolve()`

```python
def _resolve(self, user_input: str, current_time: datetime | None) -> _ResolveContext:
```

Extracted from `process_turn()` so both the blocking and streaming paths share exactly the same Pass 1 + resolver logic. Returns a `_ResolveContext` dataclass with `pass1`, `resolver_results`, `turn_outcomes`, and `new_feedback`. Does not call Pass 2.

---

## Reset

```python
def reset(self):
    """Reset conversation state. Called when starting a new order."""
    self.order_state.clear()
    self.conversation_history = []
    self.pending_feedback = None
    self.turn_count = 0
```

---

## Testing with Mock Provider

```python
# In test_orchestrator.py

def test_single_item_add():
    mock_response = LLMResponse(
        intents=[{"action": "add_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""}],
        response_text="Butter chicken, done!",
        detected_language="en",
        raw_output="...",
        model="mock",
        provider="mock",
        prompt_tokens=0,
        completion_tokens=0,
    )
    provider = MockProvider([mock_response])
    index = load_menu("menu.json")
    orchestrator = Orchestrator(provider, index.menu_index, index.menu_data)

    result = orchestrator.process_turn("one butter chicken please")

    assert len(result.resolver_results) == 1
    assert result.resolver_results[0].applied_to_order is True
    assert result.order_state_snapshot["items"][0]["item_name"] == "Butter Chicken"
    assert result.order_state_snapshot["items"][0]["quantity"] == 1
```
