"""Batch test runner.

Reads a test file where each non-comment, non-empty line is:
    <input_text> | <expected_outcome>

Expected outcomes:
    match:<item_id>       — should resolve to this item id
    variant:<group_id>    — should return NeedsVariantSelection for this group
    ambiguous             — should return Ambiguous
    nomatch               — should return NoMatch
    unavailable:<item_id> — should return Unavailable for this item

Lines starting with # and empty lines are skipped.
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

from review.logger import ReviewLogger
from src.loader import MenuIndex, load_menu
from src.models import (
    Ambiguous,
    ConfidentMatch,
    NeedsVariantSelection,
    NoMatch,
    ResolveResult,
    Unavailable,
)
from src.normalizer import normalize
from src.resolver import resolve

MENU_PATH = Path(__file__).parent.parent / "menus" / "silver-ssc-hyd.json"


class TestCase:
    def __init__(self, raw: str, expected: str, lineno: int):
        self.raw = raw
        self.expected = expected
        self.lineno = lineno

    def __repr__(self) -> str:
        return f"TestCase({self.raw!r} | {self.expected!r})"


def parse_test_file(path: str | Path) -> list[TestCase]:
    cases: list[TestCase] = []
    for lineno, raw_line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "|" not in line:
            continue
        raw, expected = (s.strip() for s in line.split("|", 1))
        cases.append(TestCase(raw, expected, lineno))
    return cases


def evaluate(result: ResolveResult, expected: str) -> bool:
    """Return True if `result` matches the expected outcome string."""
    if expected == "ambiguous":
        return isinstance(result, Ambiguous)
    if expected == "nomatch":
        return isinstance(result, NoMatch)
    if expected.startswith("match:"):
        target = expected.split(":", 1)[1]
        return isinstance(result, ConfidentMatch) and result.item_id == target
    if expected.startswith("variant:"):
        target = expected.split(":", 1)[1]
        return isinstance(result, NeedsVariantSelection) and result.group_id == target
    if expected.startswith("unavailable:"):
        target = expected.split(":", 1)[1]
        return isinstance(result, Unavailable) and result.item_id == target
    return False


def _result_summary(result: ResolveResult) -> str:
    if isinstance(result, ConfidentMatch):
        return f"match:{result.item_id} ({result.match_method}, {result.score:.0f})"
    if isinstance(result, NeedsVariantSelection):
        return f"variant:{result.group_id} ({result.match_method}, {result.score:.0f})"
    if isinstance(result, Ambiguous):
        ids = ",".join(_candidate_id(c) for c in result.candidates[:3])
        return f"ambiguous [{ids}]"
    if isinstance(result, NoMatch):
        names = ", ".join(n for n, _ in result.suggestions[:3])
        return f"nomatch (suggested: {names})"
    if isinstance(result, Unavailable):
        return f"unavailable:{result.item_id} ({result.reason})"
    return repr(result)


def _candidate_id(c) -> str:
    if isinstance(c, ConfidentMatch):
        return c.item_id
    if isinstance(c, NeedsVariantSelection):
        return c.group_id
    return "?"


def run_batch(
    path: str | Path,
    index: MenuIndex,
    logger: ReviewLogger | None = None,
    current_time: datetime | None = None,
) -> tuple[int, int, list[TestCase]]:
    """Run a batch file and return (total, passed, failed_cases)."""
    cases = parse_test_file(path)
    if not cases:
        print(f"No test cases parsed from {path}")
        return (0, 0, [])

    passed = 0
    failures: list[tuple[TestCase, ResolveResult]] = []
    note_tag = f"batch:{Path(path).name}"

    for case in cases:
        result = resolve(case.raw, index, current_time)
        ok = evaluate(result, case.expected)
        if ok:
            passed += 1
        else:
            failures.append((case, result))
        if logger is not None:
            logger.log_interaction(
                raw_input=case.raw,
                normalized_input=normalize(case.raw),
                result=result,
                verdict="pass" if ok else "fail",
                notes=note_tag,
                simulated_time=current_time,
            )

    total = len(cases)
    print(f"\n=== Batch results: {path} ===")
    print(f"Total: {total}  Passed: {passed}  Failed: {len(failures)}")
    if total:
        print(f"Pass rate: {passed * 100 / total:.1f}%")
    if failures:
        print("\nFailures:")
        for case, result in failures:
            print(f"  L{case.lineno}: {case.raw!r}")
            print(f"     expected: {case.expected}")
            print(f"     got:      {_result_summary(result)}")

    return (total, passed, [c for c, _ in failures])


def main(argv: list[str]) -> int:
    if not argv:
        print("Usage: python -m cli.batch <test_file> [--no-log]")
        return 2
    path = argv[0]
    use_log = "--no-log" not in argv

    index = load_menu(MENU_PATH)
    logger = ReviewLogger() if use_log else None
    try:
        total, passed, failures = run_batch(path, index, logger)
    finally:
        if logger is not None:
            logger.close()
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
