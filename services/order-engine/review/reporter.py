"""Stats and failure reporting for the review log."""

from __future__ import annotations

import json

from review.logger import ReviewLogger


def format_stats(logger: ReviewLogger) -> str:
    stats = logger.get_stats()
    total = stats["total"] or 1  # avoid div-by-zero in formatter
    real_total = stats["total"]
    by_verdict = stats["by_verdict"]
    by_result = stats["by_result"]
    by_method = stats["by_method"]

    lines: list[str] = []
    lines.append("=== Resolver Stats ===")
    lines.append(f"Total interactions: {real_total}")
    lines.append(
        f"  Pass: {by_verdict.get('pass', 0)} ({by_verdict.get('pass', 0) * 100 / total:.1f}%)"
    )
    lines.append(
        f"  Fail: {by_verdict.get('fail', 0)} ({by_verdict.get('fail', 0) * 100 / total:.1f}%)"
    )
    lines.append(
        f"  Skip: {by_verdict.get('skip', 0)} ({by_verdict.get('skip', 0) * 100 / total:.1f}%)"
    )
    lines.append(f"  Unreviewed: {by_verdict.get('unreviewed', 0)}")
    lines.append("")
    lines.append("By result type:")
    for rtype, count in sorted(by_result.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {rtype}: {count} ({count * 100 / total:.1f}%)")
    if by_method:
        lines.append("")
        lines.append("By match method:")
        for method, count in sorted(by_method.items(), key=lambda kv: -kv[1]):
            lines.append(f"  {method}: {count} ({count * 100 / total:.1f}%)")
    return "\n".join(lines)


def format_failures(logger: ReviewLogger, limit: int = 50) -> str:
    rows = logger.get_failures(limit)
    if not rows:
        return "No failures logged."
    lines: list[str] = ["=== Failed Interactions ==="]
    for row in rows:
        rid = row["id"]
        raw = row["raw_input"]
        rtype = row["result_type"]
        item_name = row["matched_item_name"] or "-"
        score = row["match_score"]
        method = row["match_method"]
        meta = []
        if score is not None:
            meta.append(f"score: {score:.1f}")
        if method:
            meta.append(method)
        meta_str = f" [{', '.join(meta)}]" if meta else ""
        lines.append(f"#{rid}  \"{raw}\" → {rtype}: {item_name}{meta_str}")
        if row["notes"]:
            lines.append(f"     Note: {row['notes']}")
    lines.append("")
    lines.append(f"Total failures: {len(rows)}")
    return "\n".join(lines)


def format_recent(logger: ReviewLogger, n: int = 10) -> str:
    rows = logger.get_recent(n)
    if not rows:
        return "No interactions yet."
    lines: list[str] = [f"=== Recent Interactions (last {len(rows)}) ==="]
    icons = {
        "confident_match": "MATCH",
        "needs_variant": "VARIANT",
        "ambiguous": "AMBIG",
        "no_match": "NOMATCH",
        "unavailable": "UNAVAIL",
    }
    for row in reversed(rows):
        rid = row["id"]
        raw = row["raw_input"]
        rtype = icons.get(row["result_type"], row["result_type"])
        name = row["matched_item_name"] or _summary_from_candidates(row["candidates_json"])
        method = row["match_method"] or ""
        score = row["match_score"]
        verdict = (row["verdict"] or "?").upper()
        meta = ""
        if method or score is not None:
            score_str = f"{score:.1f}" if score is not None else ""
            parts = [p for p in (method, score_str) if p]
            meta = f" [{', '.join(parts)}]"
        lines.append(f"#{rid} \"{raw}\" → {rtype} {name}{meta}  {verdict}")
    return "\n".join(lines)


def _summary_from_candidates(candidates_json: str | None) -> str:
    if not candidates_json:
        return ""
    try:
        data = json.loads(candidates_json)
    except json.JSONDecodeError:
        return ""
    if isinstance(data, list):
        return f"({len(data)} candidates)"
    return ""
