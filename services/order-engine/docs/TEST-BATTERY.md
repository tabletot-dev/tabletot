# Test Battery — Initial Test Cases

## Format

Each line in `data/test_battery.txt` follows this format:
```
<input_text> | <expected_outcome>
```

Expected outcome types:
- `match:<item_id>` — should resolve to this exact item
- `variant:<group_id>` — should return NeedsVariantSelection for this group
- `ambiguous` — should return Ambiguous
- `nomatch` — should return NoMatch

Lines starting with `#` are comments. Empty lines are ignored.

---

## Test Cases

```
# =====================================================
# EXACT MATCHES — items that should match by exact normalized name
# =====================================================

dal makhni | match:dal_makhni
butter chicken | match:butter_chicken
dal tadka | match:dal_tadka
espresso | match:espresso
americano | match:americano
flat white | match:flat_white
shakshouka | match:shakshouka
fattoush | match:fattoush
falafel | match:falafel
hummus | match:hummus
vada pav | match:vada_pav
mochaccino | match:mochaccino
aglio olio | match:aglio_olio
taftan | match:taftan
steamed rice | match:steamed_rice
ghee rice | match:ghee_rice
jeera rice | match:jeera_rice
biscoff latte | match:biscoff_latte
margherita | match:margherita_pizza
appam | match:appam

# =====================================================
# ALIAS MATCHES — common speech patterns mapped in alias table
# =====================================================

filter coffee | match:south_indian_filter_coffee
kaapi | match:south_indian_filter_coffee
chai | match:classic_masala_chai
masala chai | match:classic_masala_chai
black dal | match:dal_makhni
daal makhni | match:dal_makhni
dal makhani | match:dal_makhni
cold coffee | match:iced_latte
biryani | match:irani_chicken_biryani
chicken biryani | match:irani_chicken_biryani
chole | match:chole_kulche
garlic naan | match:naan_garlic
butter naan | match:naan_butter
plain naan | match:naan_plain
butter roti | match:roti_butter
chapati | match:roti_plain
nutella waffle | match:belgian_waffle_nutella_banana
acai bowl | match:acai_berry_bowl
veg burger | match:vegetable_burger
chicken burger | match:fried_chicken_burger
lamb burger | match:spiced_lamb_burger
mac and cheese | match:mac_n_cheese
pesto pasta | match:penne_pesto
cheese fries | match:loaded_fries_cheese
hot chocolate | match:classic_hot_chocolate
green tea | match:green_classic_tea
nimbu soda | match:fresh_lime_soda
mojito | match:classic_mojito
affogato | match:traditional_affogato
eggs benedict | match:egg_benedict
nihari | match:nalli_nihari_taftan
sarson ka saag | match:sarson_ka_saag_makai_ki_roti
seekh kebab | match:gilafi_sheekh_kebab
paneer tikka | match:doodhiya_paneer_tikka
shakshuka | match:shakshouka

# =====================================================
# FUZZY MATCHES — misspellings and STT-likely errors
# =====================================================

cappuchino | match:cappuccino
cappachino | variant:cappuccino
spagheti arrabbiata | match:spaghetti_arrabbiata
machiiato | match:macchiato
manchow | match:manchow_soup
shakshooka | match:shakshouka
fatush | match:fattoush
brioche french tost | match:brioche_french_toast
miso eggplant | match:miso_eggplant
tangra chili chicken | match:tangra_chili_chicken
penne parmezan | match:penne_parmesan

# =====================================================
# VARIANT GROUP — should ask which variant
# =====================================================

waffle | variant:belgian_waffle
pancakes | variant:fresh_pancakes
french toast | variant:brioche_french_toast
naan | variant:naan
roti | variant:roti
caesar salad | variant:caesar_salad
hakka noodles | variant:hakka_noodles
loaded fries | variant:loaded_fries
garlic bread | variant:garlic_bread
nachos | variant:nachos
tacos | variant:tacos
manchow soup | variant:manchow_soup
cappuccino | variant:cappuccino
latte | variant:cafe_latte
paratha | variant:paratha
katsu curry | variant:japanese_katsu_curry
thai green curry | variant:thai_green_curry

# =====================================================
# AMBIGUOUS — matches multiple unrelated items
# =====================================================

coffee | ambiguous
chicken | ambiguous
soup | ambiguous
tea | ambiguous
chocolate | ambiguous
salad | ambiguous
ramen | ambiguous
cold brew | ambiguous

# =====================================================
# NO MATCH — not on menu
# =====================================================

pizza hut | nomatch
coca cola | nomatch
pepsi | nomatch
idli | nomatch
masala dosa | nomatch
samosa | nomatch
gulab jamun | nomatch
ice cream | nomatch
```

---

## Notes on Expected Outcomes

Some cases are judgment calls. Here's the reasoning:

**"cappuchino" and "cappachino"**: Both are misspellings of "cappuccino". Since cappuccino is a variant group (Classic/Flavoured), the fuzzy match should resolve to the group and return NeedsVariantSelection. But if the fuzzy match hits one of the compound entries ("classic cappuccino" or "flavoured cappuccino") more strongly, it might return a ConfidentMatch to a specific variant. Either outcome is acceptable — mark as pass if the right item family is identified.

**"tea"**: The alias maps "tea" → "classic_masala_chai". So this might actually be an alias match rather than ambiguous. If the alias match fires first (Step 2 before Step 3), it will return the masala chai. That's acceptable too — update the expected outcome based on actual behavior.

**"manchow"**: This is in the alias table as "manchow" → "manchow_soup". Since manchow_soup is a variant group (Veg/Chicken), this should return NeedsVariantSelection, not a simple ConfidentMatch.

**"cold brew"**: There are 10 items in the cold brews category. Token matching on "cold brew" will hit many of them. This should be ambiguous.

**The test battery is a LIVING DOCUMENT.** After the first run:
1. Review every failure
2. Decide: is the test case wrong, or is the resolver wrong?
3. Fix whichever is wrong
4. Add new test cases as you discover edge cases
5. Re-run until 90%+ pass rate

## Adding New Test Cases

When you encounter a failure in interactive mode that should become a permanent test:
1. Note the raw input and what the correct outcome should be
2. Add it to `data/test_battery.txt`
3. If the fix requires an alias, add the alias to `menu.json` too
4. Re-run batch to verify the fix doesn't break anything
