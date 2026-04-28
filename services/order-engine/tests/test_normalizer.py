"""Tests for src/normalizer.py."""

from src.normalizer import normalize, normalize_for_index


class TestBasic:
    def test_lowercases(self):
        assert normalize("Dal Makhni") == "dal makhni"

    def test_strips_whitespace(self):
        assert normalize("  butter chicken  ") == "butter chicken"

    def test_collapses_inner_whitespace(self):
        assert normalize("dal     makhni") == "dal makhni"

    def test_empty_string(self):
        assert normalize("") == ""

    def test_none(self):
        assert normalize(None) == ""

    def test_only_whitespace(self):
        assert normalize("    ") == ""


class TestPunctuation:
    def test_drops_trailing_punctuation(self):
        assert normalize("dal makhni!") == "dal makhni"
        assert normalize("dal makhni.") == "dal makhni"
        assert normalize("dal, makhni") == "dal makhni"

    def test_hyphens_become_spaces(self):
        assert normalize("mac-n-cheese") == "mac and cheese"
        assert normalize("acai-berry bowl") == "acai berry bowl"

    def test_strips_quotes(self):
        assert normalize('"dal makhni"') == "dal makhni"
        assert normalize("'dal makhni'") == "dal makhni"


class TestSubstitutions:
    def test_ampersand_to_and(self):
        assert normalize("Salt & Pepper") == "salt and pepper"

    def test_n_apostrophe_to_and(self):
        assert normalize("mac n' cheese") == "mac and cheese"
        assert normalize("mac n cheese") == "mac and cheese"
        assert normalize("rock n roll") == "rock and roll"


class TestAccents:
    def test_strips_accents(self):
        assert normalize("café") == "cafe"
        assert normalize("crème brûlée") == "creme brulee"
        assert normalize("jalapeño") == "jalapeno"


class TestFillers:
    def test_strips_leading_filler_word(self):
        assert normalize("ek butter chicken") == "butter chicken"

    def test_strips_trailing_filler_word(self):
        assert normalize("butter chicken please") == "butter chicken"

    def test_strips_multiple_leading_fillers(self):
        assert normalize("can i get butter chicken") == "butter chicken"

    def test_does_not_strip_mid_string_filler(self):
        # 'do' is a filler but must survive in the middle
        assert normalize("bhindi do pyaaza") == "bhindi do pyaaza"

    def test_filler_phrase_prefix(self):
        assert normalize("give me dal makhni") == "dal makhni"

    def test_filler_phrase_suffix(self):
        assert normalize("dal makhni give me") == "dal makhni"

    def test_combined_fillers_both_ends(self):
        assert normalize("bhaiya ek butter chicken please") == "butter chicken"


class TestNormalizeForIndex:
    def test_single_word(self):
        assert normalize_for_index("Espresso") == ["espresso"]

    def test_multi_word_returns_full_form(self):
        forms = normalize_for_index("Chicken, Olive & Sundried Tomato Faggotini")
        assert forms == ["chicken olive and sundried tomato faggotini"]

    def test_short_name(self):
        forms = normalize_for_index("Dal Makhni")
        assert forms == ["dal makhni"]

    def test_empty(self):
        assert normalize_for_index("") == []
