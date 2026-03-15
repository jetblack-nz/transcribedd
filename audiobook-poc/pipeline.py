"""
pipeline.py — all-in-one: look up a book, download the AAX, decrypt to MP3.

Usage:
  python pipeline.py \\
    --auth-file ~/.audible/credentials.json \\
    --activation-bytes 1a2b3c4d \\
    --asin B00ICN066A \\
    --output ./output/
"""

from __future__ import annotations

import argparse
import asyncio
import re
import tempfile
from pathlib import Path
from typing import Any

import audible

from audible_client import (
    decrypt_aax,
    download_aax,
    get_book_details,
    get_download_url,
)


_HEX_RE = re.compile(r"^[0-9a-fA-F]{8}$")


def _validate_activation_bytes(value: str) -> str:
    if not _HEX_RE.match(value):
        raise argparse.ArgumentTypeError(
            f"activation-bytes must be exactly 8 hex characters (got {value!r}).\n"
            "Run 'audible activation-bytes' to retrieve yours."
        )
    return value.lower()


def _safe_filename(name: str) -> str:
    """Strip characters that are unsafe in file names."""
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip()


async def _run(args: argparse.Namespace) -> None:
    auth_path = Path(args.auth_file).expanduser()
    if not auth_path.exists():
        raise FileNotFoundError(
            f"Auth file not found: {auth_path}\n"
            "Run 'audible quickstart' to generate one."
        )

    output_dir = Path(args.output).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    auth = audible.FileAuthenticator(str(auth_path))
    async with audible.AsyncClient(auth=auth) as client:

        # Step 1: look up book details
        print(f"[1/4] Looking up ASIN: {args.asin}")
        item: dict[str, Any] = await get_book_details(client, args.asin)
        title: str = item.get("title", args.asin)
        authors_raw = item.get("authors", [])
        if isinstance(authors_raw, list):
            author = ", ".join(
                a.get("name", "") if isinstance(a, dict) else str(a)
                for a in authors_raw
            )
        else:
            author = str(authors_raw)
        runtime = item.get("runtime_length_min")
        h, m = divmod(int(runtime), 60) if runtime else (0, 0)
        print(f"       Title:  {title}")
        print(f"       Author: {author}")
        print(f"       Length: {h}h {m:02d}m" if runtime else "       Length: —")

        # Step 2: get CDN download URL
        print(f"\n[2/4] Requesting download URL...")
        url = await get_download_url(client, args.asin, quality="Extreme", codec="AAX")

        # Step 3: download to a temp file
        with tempfile.NamedTemporaryFile(suffix=".aax", delete=False) as tmp:
            tmp_path = Path(tmp.name)

        print(f"[3/4] Downloading AAX to temp file: {tmp_path}")
        try:
            await download_aax(url, tmp_path)
            size_mb = tmp_path.stat().st_size / 1_048_576
            print(f"       Downloaded: {size_mb:.1f} MB")

            # Step 4: decrypt
            safe_title = _safe_filename(title)
            output_path = output_dir / f"{safe_title}.mp3"
            print(f"\n[4/4] Decrypting to: {output_path}")
            decrypt_aax(tmp_path, args.activation_bytes, output_path, fmt="mp3")

        finally:
            if tmp_path.exists():
                tmp_path.unlink()
                print(f"       Temp file deleted: {tmp_path}")

    if output_path.exists():
        out_mb = output_path.stat().st_size / 1_048_576
        print(f"\nDone!")
        print(f"  Title:  {title}")
        print(f"  Author: {author}")
        print(f"  Output: {output_path}  ({out_mb:.1f} MB)")
    else:
        raise SystemExit("Pipeline completed but output file was not found.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Search, download, and decrypt an Audible audiobook in one step.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--auth-file",
        required=True,
        metavar="PATH",
        help="Path to audible-cli auth JSON (e.g. ~/.audible/credentials.json)",
    )
    parser.add_argument(
        "--activation-bytes",
        required=True,
        type=_validate_activation_bytes,
        metavar="HEX",
        help="8-character hex activation bytes (run 'audible activation-bytes')",
    )
    parser.add_argument(
        "--asin",
        required=True,
        metavar="ASIN",
        help="Audible ASIN of the book to process",
    )
    parser.add_argument(
        "--output",
        default="./output",
        metavar="DIR",
        help="Directory to save the final MP3 (default: ./output)",
    )
    args = parser.parse_args()
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
