# Conversation Tests — Multi-Turn Scenarios

## Purpose

These are scripted conversations for manual testing with the real LLM via `cli/conversation.py`. They test the full pipeline: LLM intent extraction → resolver matching → order state management → feedback loops.

Each scenario describes what the tester types, what should happen at each step, and what the final order should contain.

---

## Scenario 1: Simple Order (English)

**Tests:** Basic add, confirmation

```
Turn 1:
  Input: "I'd like a butter chicken and two garlic naan"
  Expected intents: add_item("butter chicken", 1), add_item("garlic naan", 2)
  Expected resolver: both match confidently
  Expected order: Butter Chicken ×1, Naan Garlic ×2
  Pass if: both items in order with correct quantities

Turn 2:
  Input: "that's all, confirm please"
  Expected intents: confirm_order
  Expected order status: confirmed
  Pass if: order confirmed with 2 items
```

---

## Scenario 2: Multi-Item Hindi Mixed

**Tests:** Hindi quantity parsing, code-switching, multiple items

```
Turn 1:
  Input: "bhaiya ek dal makhni, do butter roti aur ek masala chai"
  Expected intents: add_item("dal makhni", 1), add_item("butter roti", 2), add_item("masala chai", 1)
  Expected resolver: dal_makhni, roti_butter, classic_masala_chai
  Expected order: 3 items
  Pass if: all three resolved correctly, quantities correct

Turn 2:
  Input: "aur ek jeera rice bhi"
  Expected intents: add_item("jeera rice", 1)
  Expected order: 4 items
  Pass if: jeera rice added

Turn 3:
  Input: "bas, order karo"
  Expected intents: confirm_order
  Pass if: order confirmed with 4 items
```

---

## Scenario 3: Variant Selection

**Tests:** Variant group → clarification → selection

```
Turn 1:
  Input: "ek waffle please"
  Expected intents: add_item("waffle", 1)
  Expected resolver: NeedsVariantSelection(Belgian Waffle → Nutella & Banana, Classic)
  Expected feedback: needs_variant sent to LLM
  Expected order: empty (nothing added yet)
  Pass if: LLM asks which variant

Turn 2:
  Input: "nutella wala"
  Expected intents: select_variant("nutella wala", 1) or add_item("nutella wala", 1)
  Expected resolver: should match belgian_waffle_nutella_banana
  Expected order: Belgian Waffle - Nutella & Banana ×1
  Pass if: correct variant added
```

---

## Scenario 4: Ambiguity Resolution

**Tests:** Ambiguous input → clarification → specific selection

```
Turn 1:
  Input: "ek coffee dena"
  Expected intents: add_item("coffee", 1)
  Expected resolver: Ambiguous (multiple coffee items)
  Expected feedback: ambiguous with candidates
  Expected order: empty
  Pass if: LLM asks which coffee and lists options

Turn 2:
  Input: "filter coffee"
  Expected intents: select_variant("filter coffee", 1) or add_item("filter coffee", 1)
  Expected resolver: south_indian_filter_coffee via alias
  Expected order: South Indian Filter Coffee ×1
  Pass if: correct coffee added
```

---

## Scenario 5: Order Modification

**Tests:** Remove item, add replacement

```
Turn 1:
  Input: "ek butter chicken aur ek garlic naan"
  Expected: both added to order

Turn 2:
  Input: "actually butter chicken cancel karo, dal makhni dena instead"
  Expected intents: remove_item("butter chicken"), add_item("dal makhni", 1)
  Expected order: Dal Makhni ×1, Naan Garlic ×1 (butter chicken removed)
  Pass if: butter chicken removed, dal makhni added

Turn 3:
  Input: "naan ek aur add karo"
  Expected intents: add_item("naan", 1) or modify_item("naan", quantity increase)
  Expected: This might trigger variant selection since "naan" is a variant group
  Pass if: either garlic naan quantity incremented (LLM remembers context) or variant selection asked
```

---

## Scenario 6: Special Notes

**Tests:** Extracting special instructions

```
Turn 1:
  Input: "ek hakka noodles chicken, less spicy, no MSG please"
  Expected intents: add_item("hakka noodles chicken", 1, special_notes="less spicy, no MSG")
  Expected resolver: hakka_noodles_chicken
  Expected order: Hakka Noodles Chicken ×1 with notes "less spicy, no MSG"
  Pass if: item added with correct notes

Turn 2:
  Input: "aur ek butter chicken extra spicy"
  Expected intents: add_item("butter chicken", 1, special_notes="extra spicy")
  Expected order: 2 items, butter chicken has notes
  Pass if: both items have their respective notes
```

---

## Scenario 7: Menu Question (No Order Change)

**Tests:** ask_menu action, no resolver call

```
Turn 1:
  Input: "shakshouka kya hota hai? is it spicy?"
  Expected intents: ask_menu("shakshouka")
  Expected order: empty (no change)
  Pass if: LLM describes shakshouka from menu context, order unchanged

Turn 2:
  Input: "ok sounds good, ek shakshouka dena"
  Expected intents: add_item("shakshouka", 1)
  Expected order: Shakshouka ×1
  Pass if: item added after question
```

---

## Scenario 8: Item Not on Menu

**Tests:** NoMatch handling

```
Turn 1:
  Input: "ek masala dosa please"
  Expected intents: add_item("masala dosa", 1)
  Expected resolver: NoMatch
  Expected feedback: no_match
  Expected order: empty
  Pass if: LLM tells customer it's not available, perhaps suggests alternatives

Turn 2:
  Input: "ok then ek vada pav"
  Expected intents: add_item("vada pav", 1)
  Expected order: Vada Pav ×1
  Pass if: vada pav added successfully after menu miss
```

---

## Scenario 9: Time-Restricted Item

**Tests:** Unavailable item due to time window

```
Setup: !time 14:00 (simulate 2 PM)

Turn 1:
  Input: "ek english breakfast please"
  Expected intents: add_item("english breakfast", 1)
  Expected resolver: Unavailable("Available 07:00-11:00")
  Expected feedback: unavailable
  Expected order: empty
  Pass if: LLM tells customer breakfast is only available in the morning

Cleanup: !time reset
```

---

## Scenario 10: Large Order with Mixed Languages

**Tests:** Stress test — many items, Hindi-English mixing, Telugu words

```
Turn 1:
  Input: "bhaiya suno, ek butter chicken, do garlic naan, ek dal makhni, ek jeera rice, do masala chai, aur ek margherita pizza"
  Expected intents: 6 add_item intents
  Expected order: 6 distinct items
  Pass if: all 6 resolved correctly, no hallucinated items

Turn 2:
  Input: "actually pizza cancel, ek penne pesto dena with extra cheese"
  Expected: pizza removed, penne pesto added with notes
  Pass if: 6 items → 6 items (pizza out, penne pesto in), penne pesto has "extra cheese" note

Turn 3:
  Input: "rendu filter coffee kuda ivvu" (Telugu: "give two filter coffees also")
  Expected: add_item("filter coffee", 2)
  Expected order: 7 items including 2 filter coffees
  Pass if: Telugu quantity parsed correctly
```

---

## Evaluation Criteria

For each turn, evaluate:

1. **Intent extraction accuracy:** Did the LLM extract the right action, item name, quantity, and notes?
2. **Resolver accuracy:** Did the resolver match the extracted name to the correct menu item?
3. **Order state correctness:** Does the order reflect all changes accurately?
4. **Conversation quality:** Is the LLM's response natural and appropriate?
5. **Feedback handling:** When the resolver sends feedback, does the LLM ask the right clarification question?

Mark each turn as:
- **Pass** — all 5 criteria met
- **Fail (LLM)** — LLM extracted wrong intents
- **Fail (Resolver)** — LLM was right but resolver matched wrong
- **Fail (Orchestrator)** — both layers were right but the orchestrator mishandled the flow
- **Fail (Conversation)** — technically correct but the LLM's response was unnatural or unhelpful
