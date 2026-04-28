"""Interactive CLI test harness for the resolver.

Usage:
    python -m cli.interactive
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

from cli._format import format_result
from review.logger import ReviewLogger
from review.reporter import format_failures, format_recent, format_stats
from src.loader import MenuIndex, load_menu
from src.normalizer import normalize
from src.resolver import resolve

MENU_PATH = Path(__file__).parent.parent / "menus" / "roast-ccx-hyd.json"


HELP_TEXT = """
Commands:
  !help                show this help
  !quit / !q           exit
  !batch <file>        run a batch test file
  !failures            show logged failures
  !stats               show pass/fail statistics
  !recent [n]          show last n interactions (default 10)
  !search <term>       debug: search the index
  !aliases <term>      debug: search aliases
  !time <HH:MM>        simulate a specific time-of-day (today's date)
  !time reset          go back to real time
  !time off            disable availability checks
  !verdict <id> p|f|s  re-mark an existing interaction
"""


class InteractiveSession:
    def __init__(self, index: MenuIndex, logger: ReviewLogger):
        self.index = index
        self.logger = logger
        # None = real time. "off" = no checks. datetime = simulated.
        self._time_mode: str | datetime | None = "off"

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
                line = input("order> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return
            if not line:
                continue
            if line.startswith("!"):
                if not self._handle_command(line):
                    return
                continue
            self._handle_query(line)

    # ---- queries ----

    def _handle_query(self, raw: str) -> None:
        result = resolve(raw, self.index, self.current_time)
        normalized = normalize(raw)
        print(format_result(result))
        verdict, notes = self._prompt_verdict()
        sim_time = self.current_time if isinstance(self._time_mode, datetime) else None
        self.logger.log_interaction(
            raw_input=raw,
            normalized_input=normalized,
            result=result,
            verdict=verdict,
            notes=notes,
            simulated_time=sim_time,
        )

    def _prompt_verdict(self) -> tuple[str | None, str | None]:
        try:
            ans = input("[p]ass / [f]ail / [s]kip? ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return (None, None)
        if ans in ("p", "pass"):
            return ("pass", None)
        if ans in ("s", "skip"):
            return ("skip", None)
        if ans in ("f", "fail"):
            try:
                note = input("note (optional): ").strip()
            except (EOFError, KeyboardInterrupt):
                note = ""
            return ("fail", note or None)
        return (None, None)

    # ---- commands ----

    def _handle_command(self, line: str) -> bool:
        parts = line.split(maxsplit=1)
        cmd = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else ""

        if cmd in ("!q", "!quit", "!exit"):
            return False
        if cmd == "!help":
            print(HELP_TEXT)
        elif cmd == "!stats":
            print(format_stats(self.logger))
        elif cmd == "!failures":
            print(format_failures(self.logger))
        elif cmd == "!recent":
            n = int(arg) if arg.isdigit() else 10
            print(format_recent(self.logger, n))
        elif cmd == "!search":
            self._cmd_search(arg)
        elif cmd == "!aliases":
            self._cmd_aliases(arg)
        elif cmd == "!time":
            self._cmd_time(arg)
        elif cmd == "!batch":
            self._cmd_batch(arg)
        elif cmd == "!verdict":
            self._cmd_verdict(arg)
        else:
            print(f"Unknown command: {cmd} (try !help)")
        return True

    def _cmd_search(self, term: str) -> None:
        if not term:
            print("Usage: !search <term>")
            return
        needle = normalize(term)
        hits = [
            e
            for e in self.index.entries
            if needle in e.normalized_name
        ]
        if not hits:
            print("No matches.")
            return
        for e in hits[:30]:
            print(f"  {e.normalized_name!r:50} → {e.item_id} ({e.item_name})")
        if len(hits) > 30:
            print(f"  ... ({len(hits) - 30} more)")

    def _cmd_aliases(self, term: str) -> None:
        if not term:
            print("Usage: !aliases <term>")
            return
        needle = normalize(term)
        hits = [(k, v) for k, v in self.index.aliases.items() if needle in k]
        if not hits:
            print("No matches.")
            return
        for k, v in hits[:30]:
            print(f"  {k!r:30} → {v}")
        if len(hits) > 30:
            print(f"  ... ({len(hits) - 30} more)")

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

    def _cmd_batch(self, arg: str) -> None:
        from cli.batch import run_batch  # local import to avoid circular at startup

        if not arg:
            print("Usage: !batch <file>")
            return
        run_batch(arg, self.index, self.logger, current_time=self.current_time)

    def _cmd_verdict(self, arg: str) -> None:
        parts = arg.split()
        if len(parts) < 2 or not parts[0].isdigit():
            print("Usage: !verdict <row_id> p|f|s [note]")
            return
        row_id = int(parts[0])
        verdict_map = {"p": "pass", "f": "fail", "s": "skip"}
        verdict = verdict_map.get(parts[1].lower())
        if not verdict:
            print("Verdict must be one of p|f|s")
            return
        notes = " ".join(parts[2:]) if len(parts) > 2 else None
        self.logger.update_verdict(row_id, verdict, notes)
        print(f"Updated #{row_id} → {verdict}")

    # ---- intro ----

    def _print_welcome(self) -> None:
        n_items = len(self.index.items_by_id)
        n_variants = len(self.index.variants_by_id)
        n_entries = len(self.index.entries)
        n_aliases = len(self.index.aliases)
        print("Menu Resolver — Interactive Mode")
        print(
            f"Loaded {n_items} items, {n_variants} variants, "
            f"{n_entries} index entries, {n_aliases} aliases"
        )
        print("Type !help for commands, !quit to exit.")
        print("Time mode: availability checks disabled (use !time HH:MM to enable)")
        print()


def main(argv: list[str] | None = None) -> int:
    index = load_menu(MENU_PATH)
    logger = ReviewLogger()
    try:
        InteractiveSession(index, logger).run()
    finally:
        logger.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
