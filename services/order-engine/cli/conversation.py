"""Multi-turn conversation CLI — Stage 2.

Usage:
    python -m cli.conversation [--provider claude|openai|gemini] [--time HH:MM]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from cli._format import format_result
from review.logger import ReviewLogger
from src.llm import create_provider
from src.llm.base import LLMResponse
from src.loader import load_menu
from src.models import (
    Ambiguous,
    ConfidentMatch,
    NeedsVariantSelection,
    NoMatch,
    Unavailable,
)
from src.orchestrator import Orchestrator, ResolverCall, TurnResult

MENU_PATH = Path(__file__).parent.parent / "menus" / "roast-ccx-hyd.json"

HELP_TEXT = """
Commands:
  !help                show this help
  !quit / !q           exit
  !order               show current order
  !clear               clear order and reset conversation
  !provider <name>     switch provider mid-session
  !raw                 show raw LLM output for last turn
  !history             show conversation history
  !stats               show Stage 2 review stats
  !failures            show Stage 2 failures
  !time <HH:MM>        simulate a specific time
  !time reset          go back to real time
  !verdict <id> p|f|s [layer] [note]  re-mark a turn
"""

_ENV_KEYS = {
    "claude": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GOOGLE_API_KEY",
}


class ConversationSession:
    def __init__(
        self,
        provider_name: str,
        logger: ReviewLogger,
    ) -> None:
        self.provider_name = provider_name
        self.logger = logger
        self.session_id = uuid.uuid4().hex[:12]
        self._time_mode: str | datetime | None = None
        self._last_raw: str | None = None
        self._last_turn_id: int | None = None

        # Load menu
        menu_data = json.loads(Path(MENU_PATH).read_text(encoding="utf-8"))
        self.menu_index = load_menu(MENU_PATH)

        # Init provider + orchestrator
        api_key = self._get_api_key(provider_name)
        provider = create_provider(provider_name, api_key)
        self.orchestrator = Orchestrator(provider, self.menu_index, menu_data)
        self._menu_data = menu_data

    @property
    def current_time(self) -> datetime | None:
        if self._time_mode == "off":
            return None
        if self._time_mode is None:
            return datetime.now()
        return self._time_mode  # type: ignore[return-value]

    # ---- main loop ----

    def run(self) -> None:
        self._print_welcome()
        while True:
            try:
                line = input("customer> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return
            if not line:
                continue
            if line.startswith("!"):
                if not self._handle_command(line):
                    return
                continue
            self._handle_turn(line)

    # ---- turn processing ----

    def _handle_turn(self, user_input: str) -> None:
        try:
            result = self.orchestrator.process_turn(user_input, self.current_time)
        except Exception as e:
            print(f"\nError: {e}")
            return

        self._last_raw = result.llm_response.raw_output
        self._display_turn(result)

        # Prompt for review verdict
        verdict, failure_layer, notes = self._prompt_verdict()

        # Log to review DB
        self._last_turn_id = self.logger.log_turn(
            session_id=self.session_id,
            turn_number=result.turn_number,
            user_input=user_input,
            provider=result.llm_response.provider,
            model=result.llm_response.model,
            prompt_tokens=result.llm_response.prompt_tokens,
            completion_tokens=result.llm_response.completion_tokens,
            raw_llm_output=result.llm_response.raw_output,
            response_text=result.llm_response.response_text,
            detected_language=result.llm_response.detected_language,
            intents_json=json.dumps(result.llm_response.intents),
            resolver_results_json=json.dumps(
                [_resolver_call_to_dict(r) for r in result.resolver_results]
            ),
            order_state_json=json.dumps(result.order_state_snapshot),
            verdict=verdict,
            failure_layer=failure_layer,
            notes=notes,
        )

    def _display_turn(self, result: TurnResult) -> None:
        llm = result.llm_response
        print()
        print(f"AI Response: {llm.response_text}")
        print(f"   Language: {llm.detected_language} | Tokens: {llm.prompt_tokens} in / {llm.completion_tokens} out")
        print()

        for i, rc in enumerate(result.resolver_results, 1):
            action = rc.intent.get("action", "?")
            raw = rc.raw_name
            qty = rc.intent.get("quantity", 1)
            print(f"   Intent {i}: {action} \"{raw}\" x{qty}")

            r = rc.result
            if isinstance(r, ConfidentMatch):
                symbol = "+"
                print(f"   -> {symbol} {r.item_name} — Rs.{r.price} [{r.match_method}]")
            elif isinstance(r, NeedsVariantSelection):
                variant_names = [v.name for v in r.variants]
                print(f"   -> ? Variant needed: {r.group_name} — {', '.join(variant_names)}")
            elif isinstance(r, Ambiguous):
                names = []
                for c in r.candidates:
                    if isinstance(c, ConfidentMatch):
                        names.append(c.item_name)
                    elif isinstance(c, NeedsVariantSelection):
                        names.append(c.group_name)
                print(f"   -> ? Ambiguous — {len(r.candidates)} candidates: {', '.join(names[:5])}")
            elif isinstance(r, NoMatch):
                suggestions = [n for n, s in r.suggestions]
                print(f"   -> x No match. Suggestions: {', '.join(suggestions) or 'none'}")
            elif isinstance(r, Unavailable):
                print(f"   -> x Unavailable: {r.item_name} — {r.reason}")

        # Show order state
        snap = result.order_state_snapshot
        items = snap.get("items", [])
        if items:
            print()
            print("   Current Order:")
            for j, item in enumerate(items, 1):
                notes_str = f" ({item['special_notes']})" if item.get("special_notes") else ""
                print(f"   {j}. {item['item_name']} x{item['quantity']} — Rs.{item['line_total']}{notes_str}")
            print(f"   Total: Rs.{snap['total']}")
            if snap.get("status") == "confirmed":
                print("   Status: CONFIRMED")
        elif not result.resolver_results:
            pass  # no order change, don't show empty
        else:
            print()
            print("   Current Order: (empty)")
        print()

    def _prompt_verdict(self) -> tuple[str | None, str | None, str | None]:
        try:
            ans = input("[p]ass / [f]ail / [s]kip? ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return (None, None, None)
        if ans in ("p", "pass"):
            return ("pass", None, None)
        if ans in ("s", "skip", ""):
            return ("skip", None, None)
        if ans in ("f", "fail"):
            try:
                layer = input("failure layer (llm/resolver/orchestrator): ").strip().lower()
                if layer not in ("llm", "resolver", "orchestrator"):
                    layer = None
            except (EOFError, KeyboardInterrupt):
                layer = None
            try:
                note = input("note (optional): ").strip()
            except (EOFError, KeyboardInterrupt):
                note = ""
            return ("fail", layer, note or None)
        return (None, None, None)

    # ---- commands ----

    def _handle_command(self, line: str) -> bool:
        parts = line.split(maxsplit=1)
        cmd = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else ""

        if cmd in ("!q", "!quit", "!exit"):
            return False
        elif cmd == "!help":
            print(HELP_TEXT)
        elif cmd == "!order":
            self._cmd_order()
        elif cmd == "!clear":
            self._cmd_clear()
        elif cmd == "!provider":
            self._cmd_provider(arg)
        elif cmd == "!raw":
            self._cmd_raw()
        elif cmd == "!history":
            self._cmd_history()
        elif cmd == "!stats":
            self._cmd_stats()
        elif cmd == "!failures":
            self._cmd_failures()
        elif cmd == "!time":
            self._cmd_time(arg)
        elif cmd == "!verdict":
            self._cmd_verdict(arg)
        else:
            print(f"Unknown command: {cmd} (try !help)")
        return True

    def _cmd_order(self) -> None:
        d = self.orchestrator.order_state.to_display_dict()
        items = d.get("items", [])
        if not items:
            print("Order is empty.")
            return
        for i, item in enumerate(items, 1):
            notes_str = f" ({item['special_notes']})" if item.get("special_notes") else ""
            mods_str = f" [{', '.join(item['modifiers'])}]" if item.get("modifiers") else ""
            print(f"  {i}. {item['item_name']} x{item['quantity']} — Rs.{item['line_total']}{notes_str}{mods_str}")
        print(f"  Total: Rs.{d['total']} | Items: {d['item_count']} | Status: {d['status']}")

    def _cmd_clear(self) -> None:
        self.orchestrator.reset()
        self.session_id = uuid.uuid4().hex[:12]
        self._last_raw = None
        print("Order cleared, conversation reset.")

    def _cmd_provider(self, name: str) -> None:
        name = name.strip().lower()
        if not name:
            print(f"Current provider: {self.provider_name}")
            return
        try:
            api_key = self._get_api_key(name)
            provider = create_provider(name, api_key)
            self.orchestrator.provider = provider
            self.provider_name = name
            print(f"Switched to provider: {name}")
        except (ValueError, RuntimeError) as e:
            print(f"Error: {e}")

    def _cmd_raw(self) -> None:
        if self._last_raw:
            print("--- Raw LLM Output ---")
            print(self._last_raw)
            print("--- End ---")
        else:
            print("No previous turn.")

    def _cmd_history(self) -> None:
        history = self.orchestrator.conversation_history
        if not history:
            print("No conversation history.")
            return
        for entry in history:
            role = entry["role"].upper()
            content = entry["content"]
            print(f"  [{role}] {content}")

    def _cmd_stats(self) -> None:
        stats = self.logger.get_turn_stats()
        total = stats["total"] or 1
        real_total = stats["total"]
        by_v = stats["by_verdict"]
        by_l = stats["by_failure_layer"]
        by_p = stats["by_provider"]

        print("=== Stage 2 Conversation Stats ===")
        print(f"Total turns: {real_total}")
        print(f"  Pass: {by_v.get('pass', 0)} ({by_v.get('pass', 0) * 100 / total:.1f}%)")
        print(f"  Fail: {by_v.get('fail', 0)} ({by_v.get('fail', 0) * 100 / total:.1f}%)")
        print(f"  Skip: {by_v.get('skip', 0)}")
        print(f"  Unreviewed: {by_v.get('unreviewed', 0)}")
        if by_l:
            print("Failures by layer:")
            for layer, count in by_l.items():
                print(f"  {layer}: {count}")
        if by_p:
            print("By provider:")
            for prov, count in by_p.items():
                print(f"  {prov}: {count}")

    def _cmd_failures(self) -> None:
        rows = self.logger.get_turn_failures()
        if not rows:
            print("No failures logged.")
            return
        print("=== Stage 2 Failures ===")
        for row in rows:
            rid = row["id"]
            inp = row["user_input"]
            layer = row["failure_layer"] or "?"
            resp = row["response_text"][:60]
            notes = row["notes"] or ""
            print(f"  #{rid} [{layer}] \"{inp}\" → \"{resp}...\"")
            if notes:
                print(f"       Note: {notes}")

    def _cmd_time(self, arg: str) -> None:
        if arg == "reset":
            self._time_mode = None
            print("Time mode: real time")
            return
        if arg == "off":
            self._time_mode = "off"
            print("Time mode: availability checks disabled")
            return
        try:
            hh, mm = arg.split(":")
            now = datetime.now()
            self._time_mode = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
            print(f"Time mode: simulated {self._time_mode.isoformat(timespec='minutes')}")
        except (ValueError, AttributeError):
            print("Usage: !time HH:MM | !time reset | !time off")

    def _cmd_verdict(self, arg: str) -> None:
        parts = arg.split()
        if len(parts) < 2 or not parts[0].isdigit():
            print("Usage: !verdict <id> p|f|s [layer] [note]")
            return
        row_id = int(parts[0])
        verdict_map = {"p": "pass", "f": "fail", "s": "skip"}
        verdict = verdict_map.get(parts[1].lower())
        if not verdict:
            print("Verdict must be one of p|f|s")
            return
        layer = parts[2] if len(parts) > 2 and parts[2] in ("llm", "resolver", "orchestrator") else None
        notes_parts = parts[3:] if layer else parts[2:]
        notes = " ".join(notes_parts) if notes_parts else None
        self.logger.update_turn_verdict(row_id, verdict, layer, notes)
        print(f"Updated #{row_id} → {verdict}" + (f" [{layer}]" if layer else ""))

    # ---- helpers ----

    def _get_api_key(self, provider_name: str) -> str:
        env_key = _ENV_KEYS.get(provider_name)
        if not env_key:
            raise ValueError(f"Unknown provider: {provider_name}")
        api_key = os.environ.get(env_key, "")
        if not api_key:
            raise RuntimeError(
                f"Missing API key: set {env_key} in .env or environment"
            )
        return api_key

    def _print_welcome(self) -> None:
        n_items = len(self.menu_index.items_by_id)
        n_variants = len(self.menu_index.variants_by_id)
        provider = self.provider_name
        model = self.orchestrator.provider.get_provider_name()
        print("Menu Resolver — Conversation Mode (Stage 2)")
        print(f"Provider: {provider} | Menu: {n_items} items, {n_variants} variants")
        print(f"Session: {self.session_id}")
        print("Type !help for commands, !quit to exit.")
        print()


def _resolver_call_to_dict(rc: ResolverCall) -> dict:
    r = rc.result
    result_type = type(r).__name__
    d: dict = {
        "intent": rc.intent,
        "raw_name": rc.raw_name,
        "result_type": result_type,
        "applied_to_order": rc.applied_to_order,
    }
    if isinstance(r, ConfidentMatch):
        d["item_id"] = r.item_id
        d["item_name"] = r.item_name
        d["score"] = r.score
        d["match_method"] = r.match_method
    elif isinstance(r, NeedsVariantSelection):
        d["group_name"] = r.group_name
        d["variants"] = [v.name for v in r.variants]
    elif isinstance(r, Ambiguous):
        d["candidates"] = len(r.candidates)
    elif isinstance(r, NoMatch):
        d["suggestions"] = [n for n, s in r.suggestions]
    elif isinstance(r, Unavailable):
        d["item_name"] = r.item_name
        d["reason"] = r.reason
    return d


def main(argv: list[str] | None = None) -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Conversation mode — Stage 2")
    parser.add_argument(
        "--provider",
        choices=["claude", "openai", "gemini"],
        default="claude",
        help="LLM provider (default: claude)",
    )
    parser.add_argument(
        "--time",
        help="Simulated time HH:MM",
    )
    args = parser.parse_args(argv)

    logger = ReviewLogger()
    try:
        session = ConversationSession(args.provider, logger)
        if args.time:
            try:
                hh, mm = args.time.split(":")
                now = datetime.now()
                session._time_mode = now.replace(
                    hour=int(hh), minute=int(mm), second=0, microsecond=0
                )
                print(f"Time mode: simulated {session._time_mode.isoformat(timespec='minutes')}")
            except ValueError:
                print(f"Invalid time format: {args.time} (expected HH:MM)")
        session.run()
    finally:
        logger.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
