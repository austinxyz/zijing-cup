"""CLI: import a division's roster from the committee CSV.

    uv run python -m app.rosters <season> <division> <roster.csv>
    uv run python -m app.rosters <season> <division> <roster.csv> --check
    uv run python -m app.rosters <season> <division> <roster.csv> --ranking <ranking.csv>

The CSV lives outside the repository — it carries real alumni names, gender
and UTR. See backend/data/rosters/README.md.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Optional, Sequence

from sqlmodel import Session

from app.db import engine
from app.rosters.load import check_rosters, load_rosters


def configure_stdout() -> None:
    """Make stdout able to carry the report's Chinese.

    Windows consoles commonly default to cp1252, which cannot encode the
    footnote rows this report echoes or its section labels — the command would
    do all its work and then die printing the result. `errors="replace"` so a
    stray character degrades to a placeholder instead of losing the report.

    Silently does nothing when the stream has no reconfigure(), which is the
    case under pytest and some pipes.
    """
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8", errors="replace")


def main(argv: Optional[Sequence[str]] = None) -> int:
    configure_stdout()
    parser = argparse.ArgumentParser(
        prog="app.rosters",
        description="Import a division's roster from the committee CSV.",
    )
    parser.add_argument("season", type=int, help="season year, e.g. 2025")
    parser.add_argument("division", help="division code: gold or silver")
    parser.add_argument("csv", type=Path, help="path to the roster CSV")
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "compare only; exit 1 if the database does not match the CSV. "
            "Writes nothing."
        ),
    )
    parser.add_argument(
        "--ranking",
        type=Path,
        default=None,
        help=(
            "optional ranking/seeding CSV, read only to reconcile which teams "
            "the sheet lists. Never stored."
        ),
    )
    args = parser.parse_args(argv)

    text = args.csv.read_text(encoding="utf-8-sig")
    ranking_text = (
        args.ranking.read_text(encoding="utf-8-sig") if args.ranking else None
    )

    with Session(engine) as session:
        if args.check:
            report = check_rosters(
                session, text, args.season, args.division, ranking_text
            )
            print(report.render())
            if report.is_clean:
                return 0
            print(
                "roster CSV and database disagree. Run without --check to import.",
                file=sys.stderr,
            )
            return 1

        report = load_rosters(
            session, text, args.season, args.division, ranking_text
        )
        print(report.render())
        # Concerns do not fail the import — they are for a human to read.
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
