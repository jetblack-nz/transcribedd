"""
search.py — search your Audible library from the command line.

Usage:
  python search.py --auth-file ~/.audible/credentials.json --query "Sapiens"
  python search.py --auth-file ~/.audible/credentials.json --asin B00ICN066A
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import Any

import audible

from audible_client import get_book_details, get_library


def _fmt_minutes(runtime: int | None) -> str:
    """Format runtime minutes as 'Xh Ym'."""
    if runtime is None:
        return "—"
    h, m = divmod(int(runtime), 60)
    return f"{h}h {m:02d}m"


def _print_table(items: list[dict[str, Any]]) -> None:
    """Print a formatted table of library items."""
    if not items:
        print("No results found.")
        return

    col_asin = 12
    col_title = 50
    col_author = 30
    col_runtime = 10
    col_format = 10

    header = (
        f"{'ASIN':<{col_asin}}  "
        f"{'Title':<{col_title}}  "
        f"{'Author':<{col_author}}  "
        f"{'Runtime':<{col_runtime}}  "
        f"{'Format':<{col_format}}"
    )
    sep = "-" * len(header)
    print(sep)
    print(header)
    print(sep)

    for item in items:
        asin: str = item.get("asin", "—")
        title: str = item.get("title", "—")
        # Author may be a list of dicts or a plain string
        authors_raw = item.get("authors", [])
        if isinstance(authors_raw, list):
            author = ", ".join(
                a.get("name", "") if isinstance(a, dict) else str(a)
                for a in authors_raw
            )
        else:
            author = str(authors_raw)
        runtime = item.get("runtime_length_min")
        fmt = item.get("format_type", "—")

        # Truncate long strings
        title = title[:col_title] if len(title) > col_title else title
        author = author[:col_author] if len(author) > col_author else author

        print(
            f"{asin:<{col_asin}}  "
            f"{title:<{col_title}}  "
            f"{author:<{col_author}}  "
            f"{_fmt_minutes(runtime):<{col_runtime}}  "
            f"{fmt:<{col_format}}"
        )
    print(sep)
    print(f"{len(items)} result(s).")


async def _run(args: argparse.Namespace) -> None:
    auth_path = Path(args.auth_file).expanduser()
    if not auth_path.exists():
        raise FileNotFoundError(
            f"Auth file not found: {auth_path}\n"
            "Run 'audible quickstart' to generate one."
        )

    auth = audible.FileAuthenticator(str(auth_path))
    async with audible.AsyncClient(auth=auth, locale=args.locale) as client:
        if args.asin:
            print(f"Looking up ASIN: {args.asin}")
            item = await get_book_details(client, args.asin)
            _print_table([item])
        elif args.query:
            print(f"Searching library for: {args.query!r}  (limit={args.limit})")
            items = await get_library(client, args.query, args.locale, args.limit)
            _print_table(items)
        else:
            raise ValueError("Provide either --query or --asin.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Search your Audible library.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--auth-file",
        required=True,
        metavar="PATH",
        help="Path to audible-cli auth JSON (e.g. ~/.audible/credentials.json)",
    )
    parser.add_argument(
        "--query",
        metavar="TEXT",
        help="Title keyword(s) to search for",
    )
    parser.add_argument(
        "--asin",
        metavar="ASIN",
        help="Look up a single book by ASIN",
    )
    parser.add_argument(
        "--locale",
        default="us",
        metavar="LOCALE",
        help="Audible locale (default: us)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        metavar="INT",
        help="Maximum number of results (default: 10)",
    )
    args = parser.parse_args()
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
