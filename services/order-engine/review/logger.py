"""SQLite review logger for resolver interactions.

The DB lives at ./review.db (gitignored). Every interactive query and every
batch test result is appended as a row. Developers later mark verdicts
(pass/fail/skip) which feed the alias growth backlog.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path

from src.models import (
    Ambiguous,
    ConfidentMatch,
    NeedsVariantSelection,
    NoMatch,
    ResolveResult,
    Unavailable,
)

DEFAULT_DB_PATH = "./review.db"


_SCHEMA = """
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

CREATE TABLE IF NOT EXISTS conversation_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    user_input TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    raw_llm_output TEXT NOT NULL,
    response_text TEXT NOT NULL,
    detected_language TEXT,
    intents_json TEXT NOT NULL,
    resolver_results_json TEXT,
    order_state_json TEXT,
    verdict TEXT,
    failure_layer TEXT,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_ct_session ON conversation_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_ct_verdict ON conversation_turns(verdict);
CREATE INDEX IF NOT EXISTS idx_ct_timestamp ON conversation_turns(timestamp);
"""


class ReviewLogger:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    # ---- writes ----

    def log_interaction(
        self,
        raw_input: str,
        normalized_input: str,
        result: ResolveResult,
        verdict: str | None = None,
        notes: str | None = None,
        simulated_time: datetime | None = None,
    ) -> int:
        result_type, method, score, item_id, item_name, candidates_json = _result_columns(
            result
        )
        cur = self._conn.execute(
            """
            INSERT INTO interactions (
                timestamp, raw_input, normalized_input,
                result_type, match_method, match_score,
                matched_item_id, matched_item_name, candidates_json,
                verdict, notes, simulated_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.now().isoformat(timespec="seconds"),
                raw_input,
                normalized_input,
                result_type,
                method,
                score,
                item_id,
                item_name,
                candidates_json,
                verdict,
                notes,
                simulated_time.isoformat(timespec="minutes") if simulated_time else None,
            ),
        )
        self._conn.commit()
        return cur.lastrowid or 0

    def update_verdict(self, row_id: int, verdict: str, notes: str | None = None) -> None:
        self._conn.execute(
            "UPDATE interactions SET verdict = ?, notes = COALESCE(?, notes) WHERE id = ?",
            (verdict, notes, row_id),
        )
        self._conn.commit()

    # ---- Stage 2: conversation turns ----

    def log_turn(
        self,
        session_id: str,
        turn_number: int,
        user_input: str,
        provider: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        raw_llm_output: str,
        response_text: str,
        detected_language: str,
        intents_json: str,
        resolver_results_json: str | None = None,
        order_state_json: str | None = None,
        verdict: str | None = None,
        failure_layer: str | None = None,
        notes: str | None = None,
    ) -> int:
        cur = self._conn.execute(
            """
            INSERT INTO conversation_turns (
                timestamp, session_id, turn_number, user_input,
                provider, model, prompt_tokens, completion_tokens,
                raw_llm_output, response_text, detected_language,
                intents_json, resolver_results_json, order_state_json,
                verdict, failure_layer, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.now().isoformat(timespec="seconds"),
                session_id,
                turn_number,
                user_input,
                provider,
                model,
                prompt_tokens,
                completion_tokens,
                raw_llm_output,
                response_text,
                detected_language,
                intents_json,
                resolver_results_json,
                order_state_json,
                verdict,
                failure_layer,
                notes,
            ),
        )
        self._conn.commit()
        return cur.lastrowid or 0

    def update_turn_verdict(
        self, row_id: int, verdict: str, failure_layer: str | None = None, notes: str | None = None
    ) -> None:
        self._conn.execute(
            "UPDATE conversation_turns SET verdict = ?, failure_layer = COALESCE(?, failure_layer), "
            "notes = COALESCE(?, notes) WHERE id = ?",
            (verdict, failure_layer, notes, row_id),
        )
        self._conn.commit()

    def get_turn_failures(self, limit: int = 100) -> list[sqlite3.Row]:
        return list(
            self._conn.execute(
                "SELECT * FROM conversation_turns WHERE verdict = 'fail' "
                "ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        )

    def get_turn_stats(self) -> dict:
        total = self._conn.execute("SELECT COUNT(*) FROM conversation_turns").fetchone()[0]
        by_verdict = {
            row["verdict"] or "unreviewed": row["c"]
            for row in self._conn.execute(
                "SELECT verdict, COUNT(*) AS c FROM conversation_turns GROUP BY verdict"
            )
        }
        by_layer = {
            row["failure_layer"]: row["c"]
            for row in self._conn.execute(
                "SELECT failure_layer, COUNT(*) AS c FROM conversation_turns "
                "WHERE failure_layer IS NOT NULL GROUP BY failure_layer"
            )
        }
        by_provider = {
            row["provider"]: row["c"]
            for row in self._conn.execute(
                "SELECT provider, COUNT(*) AS c FROM conversation_turns GROUP BY provider"
            )
        }
        return {
            "total": total,
            "by_verdict": by_verdict,
            "by_failure_layer": by_layer,
            "by_provider": by_provider,
        }

    # ---- reads (Stage 1) ----

    def get_failures(self, limit: int = 100) -> list[sqlite3.Row]:
        return list(
            self._conn.execute(
                "SELECT * FROM interactions WHERE verdict = 'fail' "
                "ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        )

    def get_recent(self, n: int = 10) -> list[sqlite3.Row]:
        return list(
            self._conn.execute(
                "SELECT * FROM interactions ORDER BY id DESC LIMIT ?", (n,)
            )
        )

    def get_unreviewed(self, limit: int = 100) -> list[sqlite3.Row]:
        return list(
            self._conn.execute(
                "SELECT * FROM interactions WHERE verdict IS NULL "
                "ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        )

    def get_stats(self) -> dict:
        total = self._conn.execute("SELECT COUNT(*) FROM interactions").fetchone()[0]
        by_verdict = {
            row["verdict"] or "unreviewed": row["c"]
            for row in self._conn.execute(
                "SELECT verdict, COUNT(*) AS c FROM interactions GROUP BY verdict"
            )
        }
        by_result = {
            row["result_type"]: row["c"]
            for row in self._conn.execute(
                "SELECT result_type, COUNT(*) AS c FROM interactions GROUP BY result_type"
            )
        }
        by_method = {
            row["match_method"]: row["c"]
            for row in self._conn.execute(
                "SELECT match_method, COUNT(*) AS c FROM interactions "
                "WHERE match_method IS NOT NULL GROUP BY match_method"
            )
        }
        return {
            "total": total,
            "by_verdict": by_verdict,
            "by_result": by_result,
            "by_method": by_method,
        }


# ---- result → row column helpers --------------------------------------------


def _result_columns(
    result: ResolveResult,
) -> tuple[str, str | None, float | None, str | None, str | None, str | None]:
    if isinstance(result, ConfidentMatch):
        return (
            "confident_match",
            result.match_method,
            result.score,
            result.item_id,
            result.item_name,
            None,
        )
    if isinstance(result, NeedsVariantSelection):
        candidates = [
            {"id": v.id, "name": v.name, "price": v.price} for v in result.variants
        ]
        return (
            "needs_variant",
            result.match_method,
            result.score,
            result.group_id,
            result.group_name,
            json.dumps(candidates),
        )
    if isinstance(result, Ambiguous):
        candidates = [_candidate_to_dict(c) for c in result.candidates]
        return ("ambiguous", None, None, None, None, json.dumps(candidates))
    if isinstance(result, NoMatch):
        suggestions = [{"name": n, "score": s} for n, s in result.suggestions]
        return ("no_match", None, None, None, None, json.dumps(suggestions))
    if isinstance(result, Unavailable):
        return ("unavailable", None, None, result.item_id, result.item_name, None)
    raise TypeError(f"Unknown result type: {type(result)!r}")


def _candidate_to_dict(c) -> dict:
    if isinstance(c, ConfidentMatch):
        return {
            "kind": "match",
            "id": c.item_id,
            "name": c.item_name,
            "price": c.price,
            "score": c.score,
        }
    if isinstance(c, NeedsVariantSelection):
        return {
            "kind": "variant_group",
            "id": c.group_id,
            "name": c.group_name,
            "score": c.score,
        }
    if is_dataclass(c):
        return asdict(c)
    return {"repr": repr(c)}
