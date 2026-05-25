# Menu Creation Guide

This file is a prompt reference for creating a new `menu.json` compatible with the Tabletot voice engine.

**How to use:** Share this file with an LLM, then provide your raw dish list. The LLM will produce a valid JSON file ready to drop into this folder.

---

## 1. Setup — Two Files to Update

Every new restaurant requires changes in exactly two places:

### A. Create the menu file
```
menus/{restaurant-id}.json
```

### B. Register the restaurant in config
Add an entry to `backend/config/restaurants.json`:
```json
"your-restaurant-id": {
  "name": "Full Restaurant Name",
  "language_code": "en-IN",
  "speaker": "rohan",
  "menu_path": "menus/your-restaurant-id.json",
  "fallback_language_code": "hi-IN",
  "fallback_speaker": "ishita"
}
```
Available speakers: `rohan`, `meera`, `ishita`, `arjun`, `maya` (Sarvam `bulbul:v3`).

---

## 2. Restaurant ID Convention

- Format: `kebab-case`
- Pattern: `{brand}-{location-short}` 
- Examples: `silver-ssc-hyd`, `sozo-cakery-banjara`, `the-grid-jubilee`
- Must be unique across all restaurants in `restaurants.json`

---

## 3. Top-Level JSON Structure

```json
{
  "menu_version": "1.0",
  "restaurant": "Human-readable restaurant name",
  "last_updated": "YYYY-MM-DD",

  "categories": [ ... ],
  "items":      [ ... ],
  "aliases":    { ... }
}
```

All three arrays/objects are required. `aliases` may be an empty object `{}` if none are needed.

---

## 4. Categories

Each category has a required `id` and `name`. Time restrictions are optional.

```json
{ "id": "breakfast", "name": "Breakfast" }
```

```json
{
  "id": "high_tea",
  "name": "High Tea",
  "available_from": "15:00",
  "available_until": "19:00",
  "available_days": ["mon", "tue", "wed", "thu", "fri"]
}
```

**Rules:**
- `id`: `snake_case`, unique within the file
- `available_days` values: `"mon"`, `"tue"`, `"wed"`, `"thu"`, `"fri"`, `"sat"`, `"sun"`
- Omit `available_from`/`available_until`/`available_days` entirely if the category is available all day, every day
- Every item's `category` field must reference a valid category `id` in this file

---

## 5. Item Types

There are exactly two item types: `simple` and `variant_group`.

### 5a. Simple Item

Use when the item has **one fixed price** with no size/flavour split.

```json
{
  "id": "tiramisu",
  "name": "Tiramisu",
  "category": "desserts",
  "type": "simple",
  "price": 330,
  "description": "Optional — only include if meaningfully descriptive",
  "tags": ["veg"]
}
```

**Required fields:** `id`, `name`, `category`, `type`, `price`  
**Optional fields:** `description`, `tags`, `available_from`, `available_until`, `available_days`

### 5b. Variant Group

Use when the item comes in **multiple sizes, flavours, or crust types** each with their own price.

```json
{
  "id": "black_forest_cake",
  "name": "Black Forest Cake",
  "category": "speciality_cakes",
  "type": "variant_group",
  "tags": ["veg"],
  "variants": [
    { "id": "black_forest_cake_500g", "name": "500 Gms", "price": 1000 },
    { "id": "black_forest_cake_1kg",  "name": "1 Kg",    "price": 1900 }
  ]
}
```

**Rules:**
- The parent item has **no `price` field** — prices live only on variants
- Each variant must have `id`, `name`, and `price`
- Variant `id` convention: `{parent_id}_{variant_suffix}` (see Section 6)
- Minimum 2 variants; if an item genuinely has only one size/option, use `simple` instead
- `tags` may be on the parent (applies to all variants) or on individual variants if they differ (e.g., veg vs non-veg variants of the same dish)

---

## 6. ID Naming Rules

| Scope | Rule | Example |
|---|---|---|
| All IDs | `snake_case` only | `black_forest_cake` |
| All IDs | Unique within the file | No two items/variants share an ID |
| Item IDs | Descriptive, not abbreviated | `chocolate_hazelnut_cake` not `chc` |
| Variant IDs | `{parent_id}_{variant_suffix}` | `black_forest_cake_500g`, `black_forest_cake_1kg` |
| Disambiguate cross-category | Prefix or suffix the category | `mocha_cake` vs `mocha_coffee` |
| Disambiguate same restaurant | Add brand prefix | `sozo_margherita_pizza` not just `margherita` if ambiguity risk exists |

**Common variant suffixes:**

| Scenario | Suffixes |
|---|---|
| Size (weight) | `_500g`, `_1kg`, `_2kg` |
| Size (generic) | `_small`, `_regular`, `_large` |
| Temperature | `_hot`, `_iced` |
| Crust | `_thin`, `_puff`, `_thick` |
| Pasta base | `_penne`, `_spaghetti` |
| Portion | `_half`, `_full` |
| Shot count | `_single`, `_double` |
| Pack | `_6pack`, `_12pack` |
| Dietary split | `_veg`, `_nonveg` |
| Flavour | `_classic`, `_nutella_banana`, `_berry_nana` |

---

## 7. Pricing Rules

- Prices are always **integers** (no decimals), in Indian Rupees
- `simple` items: `"price": 330` — required, never null
- `variant_group` items: no `price` on parent; each variant has its own `price`
- If the menu shows a price **range** (e.g., 250–300), assign a specific price per variant or per item — do not store ranges
- If an item is only available in one size despite appearing in a variant context (e.g., "Carrot Cake — 1 Kg only"), use `simple` with that price and note it in `description`

---

## 8. Tags

```json
"tags": ["veg"]
"tags": ["non-veg"]
"tags": ["veg", "contains-nuts"]
```

- Use `"veg"` and `"non-veg"` consistently; the LLM system prompt uses these for filtering
- Tags on a `variant_group` parent apply to all variants
- Put tags on individual variants when they differ (e.g., a kothu parota with veg and non-veg variants)
- Omit `tags` entirely if unknown or not applicable (beverages, baked goods often have no tag)

---

## 9. Aliases

Aliases map a **natural spoken shorthand** to an item or variant `id`. They power Step 2 of the resolver's 5-step matching cascade.

```json
"aliases": {
  "black forest":   "black_forest_cake",
  "brownie":        "brownie_box",
  "brownie box":    "brownie_box",
  "espresso":       "espresso_shot",
  "aglio olio":     "aglio_olio_pasta"
}
```

### When to add an alias

| Situation | Add alias? | Example |
|---|---|---|
| Item name has extra words customers will skip | Yes | `"banoffee"` → `banoffee_jar` |
| Item name has a parenthetical customers ignore | Yes | `"brownie"` → `brownie_box` (full name: "Brownie Box (Sampler)") |
| Item is known by a shorter cultural name | Yes | `"aglio olio"` → `aglio_olio_pasta` |
| Multiple words lead to the same thing | Yes | Both `"espresso"` and `"shot"` if both are expected |
| Alias is the same as the item name | No | Don't alias `"tiramisu"` → `tiramisu`; exact match handles it |
| Alias could mean multiple items | No | Don't alias `"latte"` if vanilla latte, caramel latte, and cafe latte all exist — let the resolver surface ambiguity |
| Alias is just a category word | No | Don't alias `"cake"` → anything |

### Alias key format
- Lowercase, no punctuation (the resolver normalizes input before lookup)
- Must be the natural spoken form: `"black forest"` not `"Black Forest Cake"`

### Alias value
- Must be an exact `id` from the `items` or `variants` arrays in this file
- Can point to a variant `id` directly: `"jasmine tea"` → `"hot_tea_jasmine"`

---

## 10. Common Real-World Patterns

### Hot / Iced drinks
```json
{
  "id": "cafe_latte",
  "name": "Cafe Latte",
  "category": "coffee",
  "type": "variant_group",
  "variants": [
    { "id": "cafe_latte_hot",  "name": "Hot",  "price": 230 },
    { "id": "cafe_latte_iced", "name": "Iced", "price": 250 }
  ]
}
```

### Hot-only or iced-only drinks → use `simple`
```json
{ "id": "vietnamese_latte", "name": "Vietnamese Latte", "category": "coffee", "type": "simple", "price": 260, "description": "Iced" }
```

### Size variants (cakes)
```json
{
  "id": "red_velvet_cake",
  "name": "Red Velvet Cake",
  "category": "speciality_cakes",
  "type": "variant_group",
  "tags": ["veg"],
  "variants": [
    { "id": "red_velvet_cake_500g", "name": "500 Gms", "price": 775 },
    { "id": "red_velvet_cake_1kg",  "name": "1 Kg",    "price": 1400 }
  ]
}
```

### Crust variants (pizza)
```json
{
  "id": "sozo_margherita_pizza",
  "name": "Margherita Pizza",
  "category": "pizza",
  "type": "variant_group",
  "tags": ["veg"],
  "variants": [
    { "id": "sozo_margherita_pizza_thin", "name": "Thin Crust", "price": 400 },
    { "id": "sozo_margherita_pizza_puff", "name": "Puff Crust", "price": 450 }
  ]
}
```

### Pasta base variants (all same price)
```json
{
  "id": "alfredo_pasta",
  "name": "Alfredo Pasta",
  "category": "pasta",
  "type": "variant_group",
  "tags": ["veg"],
  "variants": [
    { "id": "alfredo_pasta_penne",     "name": "Penne",     "price": 380 },
    { "id": "alfredo_pasta_spaghetti", "name": "Spaghetti", "price": 380 }
  ]
}
```

### Dietary split variants (veg/non-veg)
```json
{
  "id": "kothu_parota",
  "name": "Kothu Parota",
  "category": "indian_breakfast",
  "type": "variant_group",
  "variants": [
    { "id": "kothu_parota_veg",    "name": "Veg",     "price": 299, "tags": ["veg"] },
    { "id": "kothu_parota_nonveg", "name": "Non-Veg", "price": 399, "tags": ["non-veg"] }
  ]
}
```

### Multi-flavour group at same price
```json
{
  "id": "sozo_cupcakes",
  "name": "Cupcakes",
  "category": "desserts",
  "type": "variant_group",
  "tags": ["veg"],
  "variants": [
    { "id": "cupcake_funfetti",          "name": "Funfetti",          "price": 50 },
    { "id": "cupcake_lemon",             "name": "Lemon",             "price": 50 },
    { "id": "cupcake_biscoff",           "name": "Biscoff",           "price": 60 },
    { "id": "cupcake_belgium_chocolate", "name": "Belgium Chocolate", "price": 60 }
  ]
}
```

### Time-restricted category
```json
{
  "id": "breakfast_platters",
  "name": "Breakfast Platters",
  "available_from": "07:00",
  "available_until": "11:00",
  "available_days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
}
```

---

## 11. Output Format

- One item per line in the `items` array (compact JSON style)
- Variant arrays may be expanded to multiple lines for readability when a group has 3+ variants
- Category objects are one per line
- Alias entries are one per line
- Use 2-space indentation throughout

Reference files: [`silver-ssc-hyd.json`](silver-ssc-hyd.json) and [`sozo-cakery-banjara.json`](sozo-cakery-banjara.json)

---

## 12. Pre-Flight Checklist

Before saving the file, verify:

- [ ] Every item `category` value exists as a category `id` in the `categories` array
- [ ] Every `id` (items + variants) is unique within this file
- [ ] All `simple` items have a `price`; no `variant_group` parent has a `price`
- [ ] Every variant group has ≥ 2 variants (if only 1 option, use `simple` instead)
- [ ] All alias values point to real `id`s that exist in `items` or `variants`
- [ ] No alias key is identical to its target item's normalized name (redundant)
- [ ] No alias key maps to multiple possible items (ambiguous alias — omit it)
- [ ] Item IDs that could collide across categories are disambiguated (`mocha_cake` vs `mocha_coffee`)
- [ ] Variant IDs follow the `{parent_id}_{suffix}` pattern
- [ ] The file is valid JSON (no trailing commas, no comments)
- [ ] `restaurants.json` has been updated with the new restaurant entry and correct `menu_path`

---

## 13. What the LLM Prompt Should Look Like

When using this guide with an LLM, structure your request as:

```
Read MENU-CREATION-GUIDE.md carefully.

Restaurant: <name>
Location: <city, area>
Restaurant ID: <kebab-case-id>
Language/TTS: <same as existing / new config>

Here is the menu:
<paste raw menu here>

Please generate:
1. menus/<restaurant-id>.json following the schema in the guide
2. The restaurants.json entry to add
```

The LLM should produce both outputs in one response. You then:
1. Drop the JSON file into `menus/`
2. Add the entry to `backend/config/restaurants.json`
3. Restart the server — done
