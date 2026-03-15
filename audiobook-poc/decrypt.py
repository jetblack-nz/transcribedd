"""
decrypt.py — decrypt an Audible AAX file to MP3 or WAV using ffmpeg.

Usage:
  python decrypt.py --input book.aax --activation-bytes 1a2b3c4d --output book.mp3
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from audible_client import decrypt_aax


_HEX_RE = re.compile(r"^[0-9a-fA-F]{8}$")


def _validate_activation_bytes(value: str) -> str:
    if not _HEX_RE.match(value):
        raise argparse.ArgumentTypeError(
            f"activation-bytes must be exactly 8 hex characters (got {value!r}).\n"
            "Run 'audible activation-bytes' to retrieve yours."
        )
    return value.lower()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Decrypt an Audible AAX file to MP3 or WAV.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--input",
        required=True,
        metavar="PATH",
        help="Path to the .aax input file",
    )
    parser.add_argument(
        "--activation-bytes",
        required=True,
        type=_validate_activation_bytes,
        metavar="HEX",
        help="8-character hex activation bytes (run 'audible activation-bytes')",
    )
    parser.add_argument(
        "--output",
        metavar="PATH",
        help="Output file path (default: input file with .mp3 extension)",
    )
    parser.add_argument(
        "--format",
        default="mp3",
        choices=["mp3", "wav"],
        metavar="FORMAT",
        help="Output format: mp3 (default) or wav",
    )
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
    else:
        output_path = input_path.with_suffix(f".{args.format}")

    fmt: str = args.format

    print(f"Input:            {input_path}")
    print(f"Output:           {output_path}")
    print(f"Format:           {fmt}")
    print(f"Activation bytes: {'*' * 8}  (hidden)")
    print()

    try:
        decrypt_aax(input_path, args.activation_bytes, output_path, fmt)
    except Exception as exc:
        raise SystemExit(f"Decryption failed: {exc}") from exc

    if output_path.exists():
        size_mb = output_path.stat().st_size / 1_048_576
        print(f"\nSuccess! Output: {output_path}  ({size_mb:.1f} MB)")
    else:
        raise SystemExit("ffmpeg exited without error but output file was not created.")


if __name__ == "__main__":
    main()
