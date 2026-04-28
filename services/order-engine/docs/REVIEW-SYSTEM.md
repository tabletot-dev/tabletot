# Review System — Specification

## Purpose

Every resolver interaction is logged to a local SQLite database. After each result, the developer marks it pass/fail/skip. Over time, this builds a regression test suite and an alias growth backlog.

---

## Database

**File:** `./review.db` (project root, gitignored)
**Engine:** SQLite3 (Python stdlib, no extra dependency)

### Schema

```sql
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    raw_input TEXT NOT NULL,
    normalized_input TEXT NOT NULL,
    result_type TEXT NOT NULL,
    match_method TEXT,
    match_score REAL,
    matched_item_id TEXT,
    matched_item_name TEXT,
    candidates_json TEXT,
    verdict TEXT,
    notes TEXT,
    simulated_time TEXT
);

CREATE INDEX IF NOT EXISTS idx_verdict ON interactions(verdict);
CREATE INDEX IF NOT EXISTS idx_result_type ON interactions(result_type);
CREATE INDEX IF NOT EXISTS idx_timestamp ON interactions(timestamp);
```

### Column Details

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER | Auto-incrementing primary key |
| `timestamp` | TEXT | ISO 8601 format, e.g., "2026-04-12T14:30:00" |
| `raw_input` | TEXT | Exactly what the user typed |
| `normalized_input` | TEXT | After normalization (for debugging) |
| `result_type` | TEXT | One of: "confident_match", "needs_variant", "ambiguous", "no_match", "unavailable" |
| `match_method` | TEXT | "exact", "alias", "fuzzy", or null (for non-matches) |
| `match_score` | REAL | 0-100 confidence score, or null |
| `matched_item_id` | TEXT | Resolved item ID, or null if no match |
| `matched_item_name` | TEXT | Display name of resolved item, or null |
| `candidates_json` | TEXT | JSON array of `{id, name, score}` for ambiguous results, or null |
| `verdict` | TEXT | "pass", "fail", "skip", or null (unreviewed) |
| `notes` | TEXT | Optional developer notes (e.g., "should add alias: xyz") |
| `simulated_time` | TEXT | If `!time` was set, the simulated time used. Null if real time. |

---

## Logging Flow

### Interactive Mode

1. User types input
2. Resolver runs
3. Result displayed
4. Prompt: `[p]ass / [f]ail / [s]kip? `
5. On `p`: log with verdict="pass"
6. On `f`: prompt for optional note → log with verdict="fail" and note
7. On `s`: log with verdict="skip"
8. On Enter (empty): log with verdict=null (unreviewed)

### Batch Mode

- If the batch test line has an expected outcome and the result matches → auto-verdict "pass"
- If it doesn't match → auto-verdict "fail"
- All results logged with the batch filename as a note

---

## Reporting

### `!stats` Output

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

By match method (confident matches only):
  exact: 52 (58.4%)
  alias: 21 (23.6%)
  fuzzy: 16 (18.0%)
```

### `!failures` Output

```
=== Failed Interactions ===
#23  "cappachino" → confident_match: Cappuccino (Classic) [score: 82.0, fuzzy]
     Note: matched variant instead of group - should ask which cappuccino

#31  "chicken" → ambiguous: 12 candidates
     Note: too many matches, maybe "chicken" alone shouldn't resolve

#45  "idli" → no_match
     Note: not on menu, correct behavior actually - changing to pass

#67  "masala dosa" → no_match
     Note: not on menu, correct NoMatch

Total failures: 4
```

### `!recent [n]` Output

Shows last n interactions in compact format:

```
=== Recent Interactions (last 5) ===
#125 "dal makhni" → ✅ Dal Makhni [exact, 100.0] PASS
#126 "black dal" → ✅ Dal Makhni [alias, 100.0] PASS
#127 "nutella waffle" → ✅ Belgian Waffle - Nutella & Banana [alias, 100.0] PASS
#128 "coffee" → ❓ Ambiguous (8 candidates) PASS
#129 "dal makhanii" → ✅ Dal Makhni [fuzzy, 91.0] PASS
```

---

## Failure → Alias Pipeline

The key workflow this enables:

1. Run batch tests or interactive testing
2. Review failures with `!failures`
3. For each failure, decide:
   - **Wrong match?** → Threshold needs adjusting, or item names are too similar
   - **No match but should have matched?** → Add an alias to `menu.json`
   - **Correct no match (item not on menu)?** → Change verdict to pass
   - **Ambiguous but should have been confident?** → Add a more specific alias
4. After adding aliases to `menu.json`, restart the CLI (index rebuilds)
5. Re-run batch tests to verify fixes don't break existing passes

This is the development feedback loop for Stage 1.
