"""
download.py — download an AAX/AAXC file from your Audible library.

Usage:
  python download.py --auth-file ~/.audible/credentials.json --asin B00ICN066A --output ./downloads/
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import audible

from audible_client import download_aax, get_download_url


async def _run(args: argparse.Namespace) -> None:
    auth_path = Path(args.auth_file).expanduser()
    if not auth_path.exists():
        raise FileNotFoundError(
            f"Auth file not found: {auth_path}\n"
            "Run 'audible quickstart' to generate one."
        )

    output_dir = Path(args.output).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)
    dest = output_dir / f"{args.asin}.aax"

    auth = audible.FileAuthenticator(str(auth_path))
    async with audible.AsyncClient(auth=auth) as client:
        print(f"Requesting download URL for ASIN: {args.asin}")
        url = await get_download_url(client, args.asin, args.quality, args.codec)
        print(f"Got CDN URL. Downloading to: {dest}")
        await download_aax(url, dest)

    size_mb = dest.stat().st_size / 1_048_576
    print(f"Saved: {dest}  ({size_mb:.1f} MB)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download an Audible AAX file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--auth-file",
        required=True,
        metavar="PATH",
        help="Path to audible-cli auth JSON (e.g. ~/.audible/credentials.json)",
    )
    parser.add_argument(
        "--asin",
        required=True,
        metavar="ASIN",
        help="Audible ASIN of the book to download",
    )
    parser.add_argument(
        "--output",
        default=".",
        metavar="DIR",
        help="Directory to save the AAX file (default: current directory)",
    )
    parser.add_argument(
        "--quality",
        default="Extreme",
        metavar="QUALITY",
        help="Download quality: Extreme, High, Normal (default: Extreme)",
    )
    parser.add_argument(
        "--codec",
        default="AAX",
        metavar="CODEC",
        help="Codec: AAX or AAXC (default: AAX)",
    )
    args = parser.parse_args()
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
