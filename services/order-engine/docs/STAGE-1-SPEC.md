# Stage 1 Specification — Menu Resolver

## What to Build

A Python package that takes a raw text string (a dish name or partial description) and returns the matching menu item from the restaurant's canonical menu JSON. It runs entirely locally — no APIs, no network, no databases except a local SQLite for logging.

---

## Module Breakdown

### 1. `src/models.py` — Data Models

All structured data uses dataclasses. No raw dicts flowing through the system.

```python
@dataclass
class MenuItem:
    id: str
    name: str
    category: str
    price: int | None          # None for variant groups (price is on children)
    type: str                  # "simple" or "variant_group"
    description: str | None
    tags: list[str]
    modifiers: dict | None     # modifier definitions if any
    available_from: str | None # "07:00"
    available_until: str | None
    available_days: list[str] | None
    serves: int | None

@dataclass
class VariantItem:
    id: str
    name: str
    price: int
    tags: list[str]
    parent_id: str             # the variant group's id
    parent_name: str           # the variant group's name

@dataclass
class IndexEntry:
    """A single matchable entry in the search index."""
    normalized_name: str       # lowercased, cleaned name used for matching
    item_id: str               # the item or variant id this resolves to
    item_name: str             # display name
    price: int | None
    is_variant: bool
    parent_id: str | None      # if this is a variant, the group id
    parent_name: str | None
    requires_variant_selection: bool  # True if this points to a group, not a specific variant
    requires_modifier: dict | None   # modifier defs if selection needed
    category: str

@dataclass
class ConfidentMatch:
    item_id: str
    item_name: str
    price: int
    category: str
    score: float               # 0-100, how confident the match is
    match_method: str          # "exact", "alias", "fuzzy"
    requires_modifier: dict | None

@dataclass
class NeedsVariantSelection:
    group_id: str
    group_name: str
    category: str
    variants: list[VariantItem]
    score: float
    match_method: str

@dataclass
class Ambiguous:
    candidates: list[ConfidentMatch | NeedsVariantSelection]
    raw_input: str

@dataclass
class NoMatch:
    suggestions: list[tuple[str, float]]  # [(item_name, score), ...] top 3 closest
    raw_input: str

@dataclass
class Unavailable:
    item_id: str
    item_name: str
    reason: str                # "Available 07:00-11:00" or "Available Mon-Fri 15:00-19:00"

# Union type for resolver output
ResolveResult = ConfidentMatch | NeedsVariantSelection | Ambiguous | NoMatch | Unavailable
```

### 2. `src/normalizer.py` — Text Normalization

A single function `normalize(text: str) -> str` that:

1. Lowercases the input
2. Strips leading/trailing whitespace
3. Collapses multiple spaces to single space
4. Removes punctuation except hyphens within words (keep "Mac-N-Cheese" hyphen but remove trailing periods, commas, etc.)
5. Replaces "&" with "and"
6. Replaces "n'" with "and" (for "mac n cheese" → "mac and cheese")
7. Strips accents/diacritics (é → e, ü → u) using `unicodedata`
8. Removes common filler words that STT might capture: "ek", "please", "one", "give me", "I want", "can I get", "mujhe", "dena", "do", "chahiye" — BUT only from the beginning/end of the string as prefix/suffix, not from the middle (don't strip "do" from "bhindi do pyaaza")

**Important:** Normalization is applied to BOTH the input AND the menu item names during index building. The comparison always happens between two normalized strings.

Also export `normalize_for_index(text: str) -> list[str]` which returns multiple normalized forms for an item name. Example: "Chicken, Olive & Sundried Tomato Faggotini" produces:
- `"chicken olive and sundried tomato faggotini"` (full normalized)
- `"faggotini"` (last word, for single-word matching)

This allows both full-name and short-name matching against the same item.

### 3. `src/loader.py` — Menu Loader & Index Builder

`load_menu(path: str) -> MenuIndex`

Reads `menu.json` and builds two data structures:

**MenuIndex** contains:
- `entries: list[IndexEntry]` — flat list of every matchable name/item pair
- `aliases: dict[str, str]` — normalized alias → item_id mapping (from menu.json aliases)
- `items_by_id: dict[str, MenuItem]` — quick lookup by item ID
- `variants_by_id: dict[str, VariantItem]` — quick lookup for variant items
- `categories: dict[str, Category]` — category metadata (for time windows)

**Index building rules:**

For each item in `menu.json`:
- If `type == "simple"`: create one IndexEntry with the normalized item name → item_id
- If `type == "variant_group"`: create MULTIPLE entries:
  - One entry for the group name (e.g., "belgian waffle") → group_id, with `requires_variant_selection=True`
  - One entry per variant with the variant's own name (e.g., "nutella and banana") → variant_id
  - One entry per variant with COMPOUND name: "{variant_name} {group_name}" and "{group_name} {variant_name}" (e.g., "nutella and banana belgian waffle" AND "belgian waffle nutella and banana") → variant_id
  - This handles both "nutella waffle" and "waffle nutella"

For aliases:
- Normalize each alias key
- Map to the target item_id
- Alias targets can be: simple item id, variant group id, or specific variant id

### 4. `src/resolver.py` — The Matching Cascade

This is the core module. A single public function:

```python
def resolve(raw_input: str, index: MenuIndex, current_time: datetime | None = None) -> ResolveResult:
```

The function runs 5 steps in order, stopping at the first confident result. See `docs/MATCHING-CASCADE.md` for the detailed algorithm.

**Configuration constants** (define at module level with docstrings):

```python
FUZZY_CONFIDENT_THRESHOLD = 80    # Minimum score to consider a fuzzy match viable
FUZZY_AMBIGUITY_GAP = 10          # If top two scores are within this gap, it's ambiguous
MAX_AMBIGUOUS_CANDIDATES = 5      # Max candidates to return in an Ambiguous result
MAX_SUGGESTIONS_ON_FAIL = 3       # Max suggestions to return in a NoMatch result
```

### 5. `src/time_check.py` — Availability Checking

```python
def check_availability(item: MenuItem | VariantItem, index: MenuIndex, current_time: datetime) -> str | None:
```

Returns `None` if available, or a human-readable reason string if not.

Checks:
1. Category-level time windows (from the category's `available_from`, `available_until`, `available_days`)
2. Item-level time windows (from the item's own fields, if present)
3. Day-of-week check uses the `available_days` list: `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`

If `current_time` is None, skip availability checks entirely (useful for testing without time constraints).

### 6. `cli/interactive.py` — Interactive CLI

A REPL loop. On startup:
1. Load menu.json, build index
2. Initialize SQLite review logger
3. Print welcome message with item count stats
4. Enter loop

Each iteration:
1. Prompt: `order> `
2. Check for commands (prefixed with `!`):
   - `!quit` or `!q` — exit
   - `!batch <filepath>` — run batch test file
   - `!failures` — show all logged failures
   - `!stats` — show pass/fail/skip counts and percentages
   - `!recent [n]` — show last n interactions (default 10)
   - `!search <term>` — search menu index for debugging (show all entries matching the term)
   - `!aliases <term>` — show aliases matching a term
   - `!time <HH:MM>` — set simulated time for testing time-restricted items. `!time reset` to use real time.
   - `!help` — list all commands
3. If not a command, pass input to `resolve()`
4. Format and display the result clearly:

**For ConfidentMatch:**
```
✅ MATCH: Belgian Waffle - Nutella & Banana
   ID: belgian_waffle_nutella_banana | Price: ₹379 | Category: Sweets & Toasts
   Score: 95.0 | Method: alias
   [p]ass / [f]ail / [s]kip?
```

**For NeedsVariantSelection:**
```
🔀 VARIANT NEEDED: Belgian Waffle
   Which one?
   1. Nutella & Banana — ₹379
   2. Classic — ₹319
   Score: 100.0 | Method: exact
   [p]ass / [f]ail / [s]kip?
```

**For Ambiguous:**
```
❓ AMBIGUOUS: "coffee" matched multiple items
   1. South Indian Filter Coffee — ₹229 (score: 72.0)
   2. Irish Coffee — ₹269 (score: 70.5)
   3. Vietnamese Iced Coffee — ₹269 (score: 68.0)
   [p]ass / [f]ail / [s]kip?
```

**For NoMatch:**
```
❌ NO MATCH: "pizza hut"
   Closest suggestions:
   1. Margherita — score: 35.0
   2. Pesto Pizza — score: 32.0
   3. Fiama — score: 28.0
   [p]ass / [f]ail / [s]kip?
```

**For Unavailable:**
```
🕐 UNAVAILABLE: English Breakfast
   Reason: Available 07:00-11:00
   [p]ass / [f]ail / [s]kip?
```

5. Record verdict in SQLite

### 7. `cli/batch.py` — Batch Test Runner

Reads a text file where each line is a test case in the format:
```
<input_text> | <expected_outcome>
```

Expected outcomes:
- `match:<item_id>` — should resolve to this specific item
- `variant:<group_id>` — should return NeedsVariantSelection for this group
- `ambiguous` — should return Ambiguous (we don't specify which candidates)
- `nomatch` — should return NoMatch
- `unavailable:<item_id>` — should return Unavailable for this item

Example:
```
dal makhni | match:dal_makhni
black dal | match:dal_makhni
waffle | variant:belgian_waffle
coffee | ambiguous
pizza hut | nomatch
```

The batch runner:
1. Loads the test file
2. Runs each input through the resolver
3. Compares result against expected outcome
4. Prints a summary: total, passed, failed, with details on each failure
5. Logs all results to SQLite with auto-verdict (pass if matched expectation, fail otherwise)

### 8. `review/logger.py` — SQLite Review Logger

Database schema:

```sql
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,            -- ISO format
    raw_input TEXT NOT NULL,            -- what the user typed
    normalized_input TEXT NOT NULL,     -- after normalization
    result_type TEXT NOT NULL,          -- "confident_match", "needs_variant", "ambiguous", "no_match", "unavailable"
    match_method TEXT,                  -- "exact", "alias", "fuzzy", or null
    match_score REAL,                   -- confidence score or null
    matched_item_id TEXT,              -- resolved item id or null
    matched_item_name TEXT,            -- resolved item name or null
    candidates_json TEXT,              -- JSON array of candidates (for ambiguous) or null
    verdict TEXT,                       -- "pass", "fail", "skip", or null (unreviewed)
    notes TEXT,                         -- optional developer notes
    simulated_time TEXT                 -- if time was overridden, what time was used
);
```

Functions:
- `log_interaction(...)` — insert a row
- `update_verdict(id, verdict, notes)` — update verdict on existing row
- `get_failures(limit)` — return all rows with verdict="fail"
- `get_stats()` — return counts by result_type and verdict
- `get_recent(n)` — return last n interactions
- `get_unreviewed(limit)` — return rows with verdict=null

### 9. `review/reporter.py` — Stats and Reporting

`print_stats(db)` — formatted output:
```
=== Resolver Stats ===
Total interactions: 127
  ✅ Pass: 108 (85.0%)
  ❌ Fail: 14 (11.0%)
  ⏭️  Skip: 5 (3.9%)
  ❔ Unreviewed: 0

By result type:
  confident_match: 89 (70.1%)
  needs_variant: 15 (11.8%)
  ambiguous: 12 (9.4%)
  no_match: 8 (6.3%)
  unavailable: 3 (2.4%)

By match method:
  exact: 52 (40.9%)
  alias: 31 (24.4%)
  fuzzy: 21 (16.5%)
```

`print_failures(db, limit)` — formatted list of failures with raw input and what the resolver returned. This is the alias growth backlog.

---

## Build Order

Build in this sequence. Each step should be fully working and tested before moving to the next.

1. **`src/models.py`** — Define all dataclasses. No logic, just structure.
2. **`src/normalizer.py`** + **`tests/test_normalizer.py`** — Normalization function with tests. Test edge cases: accents, "&" replacement, punctuation, whitespace.
3. **`src/loader.py`** + **`tests/test_loader.py`** — Menu loading and index building. Test that the correct number of entries are created, aliases are loaded, variant groups produce multiple entries.
4. **`src/time_check.py`** + **`tests/test_time_check.py`** — Availability checking. Test with mocked datetimes for breakfast items, high tea, etc.
5. **`src/resolver.py`** + **`tests/test_resolver.py`** — The matching cascade. This is the biggest module. Test each step independently and the full cascade.
6. **`review/logger.py`** — SQLite logging.
7. **`review/reporter.py`** — Stats output.
8. **`cli/interactive.py`** — Interactive REPL.
9. **`cli/batch.py`** — Batch runner.
10. **`data/test_battery.txt`** — Write the initial test cases, run the batch, iterate.

---

## Testing Requirements

Unit tests use pytest. Minimum coverage:

**normalizer:**
- Basic lowercasing and whitespace
- Punctuation removal (keeps hyphens in words)
- "&" and "n'" replacement
- Accent stripping
- Filler word removal (prefix/suffix only, not mid-word)

**loader:**
- Total entry count matches expected (285 items → correct number of index entries including variant expansions)
- Aliases load correctly (175 aliases)
- Variant groups produce group entry + individual variant entries + compound name entries
- Items with modifiers have `requires_modifier` set

**time_check:**
- Breakfast item at 8 AM → available
- Breakfast item at 2 PM → unavailable with reason
- High tea on Monday at 4 PM → available
- High tea on Saturday at 4 PM → unavailable
- Item with no time restriction → always available
- `current_time=None` → skip check, always available

**resolver:**
- Exact match: "dal makhni" → Dal Makhni
- Alias match: "black dal" → Dal Makhni
- Fuzzy match: "dal makhani" → Dal Makhni
- Variant group: "waffle" → NeedsVariantSelection(Belgian Waffle)
- Specific variant: "nutella waffle" → ConfidentMatch(belgian_waffle_nutella_banana)
- Ambiguous: "coffee" → Ambiguous with multiple candidates
- No match: "pizza hut" → NoMatch
- Unavailable: "english breakfast" at 2 PM → Unavailable
- Modifier required: "houseblend" → ConfidentMatch with requires_modifier set
