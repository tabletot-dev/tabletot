# Matching Cascade — Technical Specification

The resolver runs a 5-step cascade. Each step is tried in order. The first step that produces a confident result wins. If no step produces a result, it's a NoMatch.

---

## Pre-processing

Before the cascade runs:

1. Normalize the raw input using `normalize()` from `normalizer.py`
2. If `current_time` is provided, it will be used for availability checks AFTER a match is found (not before — we want to tell the user "that's a breakfast item" rather than just "no match")

---

## Step 1: Exact Match

Compare normalized input against all `normalized_name` fields in the search index.

```
Input: "dal makhni"
Normalized: "dal makhni"
Index lookup: "dal makhni" exists → Dal Makhni (id: dal_makhni)
Result: ConfidentMatch(score=100, method="exact")
```

If exactly ONE entry matches → return ConfidentMatch.
If MULTIPLE entries match the same normalized name → this shouldn't happen (indicates index bug), but if it does, return all as Ambiguous.

If the match points to a variant group → return NeedsVariantSelection.
If the match points to an item with required modifiers → return ConfidentMatch with `requires_modifier` populated.

**After match: check time availability.** If the item/category is time-restricted and outside the window, return Unavailable instead.

---

## Step 2: Alias Lookup

Look up the normalized input in the alias dictionary.

```
Input: "black dal"
Normalized: "black dal"
Alias lookup: "black dal" → "dal_makhni"
Item lookup: dal_makhni → Dal Makhni
Result: ConfidentMatch(score=100, method="alias")
```

The alias target can be:
- A simple item ID → return ConfidentMatch
- A variant group ID → return NeedsVariantSelection
- A specific variant ID → return ConfidentMatch for that variant

**After match: check time availability.**

---

## Step 3: Fuzzy Match (Primary)

Use `rapidfuzz` to compare the normalized input against ALL normalized names in the index.

```python
from rapidfuzz import process, fuzz

# Use token_sort_ratio: handles word reordering
# "chicken caesar salad" vs "caesar salad chicken" → high score
results = process.extract(
    normalized_input,
    [entry.normalized_name for entry in index.entries],
    scorer=fuzz.token_sort_ratio,
    limit=10
)
```

**Scoring logic:**

1. Get top 10 results from `token_sort_ratio`
2. Also run `fuzz.partial_ratio` on the top results (handles substring matching: "lasagne" vs "chicken lasagne")
3. Combined score = `max(token_sort_score, partial_ratio_score)` for each candidate
4. Sort by combined score descending

**Decision logic:**

```
top_score = results[0].score
second_score = results[1].score if len(results) > 1 else 0

if top_score < FUZZY_CONFIDENT_THRESHOLD (80):
    → proceed to Step 4

if top_score - second_score >= FUZZY_AMBIGUITY_GAP (10):
    → ConfidentMatch (top result is clearly best)

else:
    → collect all results within FUZZY_AMBIGUITY_GAP of top_score
    → if they all point to variants of the SAME group, return NeedsVariantSelection for that group
    → otherwise return Ambiguous with these candidates
```

**Special handling for variant compound names:**

The index contains entries like "nutella and banana belgian waffle" and "belgian waffle nutella and banana". If the input is "nutella waffle", the fuzzy match should catch "nutella and banana belgian waffle" because both "nutella" and "waffle" appear. `token_sort_ratio` handles this well because it sorts tokens before comparing.

**After match: check time availability.**

---

## Step 4: Fuzzy Match (Partial / Substring)

If Step 3 didn't produce a confident result, try a more aggressive partial matching strategy.

This handles the case where someone says just one distinctive word: "faggotini" should match "Chicken, Olive & Sundried Tomato Faggotini", or "shakshouka" should match even with a slight misspelling.

```python
results = process.extract(
    normalized_input,
    [entry.normalized_name for entry in index.entries],
    scorer=fuzz.partial_ratio,
    limit=10
)
```

Apply the same decision logic as Step 3 but with a HIGHER threshold (85 instead of 80) since partial matching is more prone to false positives.

If "coffee" is the input, partial_ratio will match MANY items (Iced Coffee, Irish Coffee, Filter Coffee, etc.) — this should correctly fall through as Ambiguous.

---

## Step 5: No Match

If nothing above threshold from Steps 3 and 4, return NoMatch with the top 3 suggestions from the best fuzzy results (regardless of score). These suggestions help the developer decide whether to add an alias.

```
Input: "pizza hut"
No match above threshold.
Suggestions:
  1. Margherita — score: 35.0
  2. Pesto Pizza — score: 32.0
  3. Fiama — score: 28.0
Result: NoMatch(suggestions=[...])
```

---

## Edge Cases

### Empty input
Return NoMatch immediately. Don't run the cascade.

### Single character input
Return NoMatch. Too short for meaningful matching.

### Input matches multiple aliases
Shouldn't happen — aliases is a dict, so keys are unique. But if the same normalized input could match both an alias AND an exact name, exact match (Step 1) takes priority since it runs first.

### "Naan" — group with no variant specified
"naan" normalizes to "naan". The index has an entry for the group "naan" with `requires_variant_selection=True`. Step 1 returns NeedsVariantSelection with variants [Garlic ₹129, Butter ₹119, Plain ₹109].

### "Garlic naan" — group with variant specified
"garlic naan" should match the compound entry "garlic naan" or "naan garlic" in the index, pointing to `naan_garlic`. Returns ConfidentMatch.

### "Coffee" — matches too many items
Fuzzy match returns many items above threshold but all clustered together (no clear winner). Returns Ambiguous with top candidates. In Stage 2, the LLM will use this to ask "which coffee do you want?"

### "Ek butter chicken" — input with filler words
Normalizer strips "ek" (recognized filler prefix). Remaining: "butter chicken". Exact match → Butter Chicken. ConfidentMatch.

### "Houseblend pour over" — item name + modifier in same input
Step 1 or 3 matches "houseblend" → Manual Brew Houseblend. The resolver returns ConfidentMatch with `requires_modifier` set. The phrase "pour over" is NOT extracted by the resolver — that's the LLM's job in Stage 2. For now, the resolver just flags that a modifier is needed. The raw input is preserved in the log for later analysis.

---

## Threshold Tuning

The initial thresholds are starting points. They WILL need tuning based on the test battery results.

| Constant | Initial Value | What it controls |
|---|---|---|
| `FUZZY_CONFIDENT_THRESHOLD` | 80 | Below this score, no fuzzy match is considered viable |
| `FUZZY_AMBIGUITY_GAP` | 10 | If top two scores are closer than this, it's ambiguous |
| `PARTIAL_MATCH_THRESHOLD` | 85 | Higher threshold for substring/partial matching (Step 4) |
| `MAX_AMBIGUOUS_CANDIDATES` | 5 | Cap on candidates returned in Ambiguous result |
| `MAX_SUGGESTIONS_ON_FAIL` | 3 | Cap on suggestions in NoMatch result |

Tuning process:
1. Run the test battery
2. Check failures
3. If the resolver is too aggressive (matching wrong items) → raise thresholds
4. If the resolver is too conservative (returning NoMatch for close calls) → lower thresholds
5. If specific items keep failing → add aliases instead of lowering global thresholds
