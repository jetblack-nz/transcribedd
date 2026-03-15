"""
audible_client.py — shared async helpers for Audible search, download, and decryption.

All network operations use the `audible` library (mkb79/audible).
Decryption is delegated to ffmpeg as a subprocess.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import audible
import httpx


# ---------------------------------------------------------------------------
# Library / catalogue helpers
# ---------------------------------------------------------------------------


async def get_library(
    client: audible.AsyncClient,
    query: str,
    locale: str = "us",
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Search the authenticated user's Audible library by title keyword.

    Returns a list of product dicts from the API response.
    """
    params: dict[str, Any] = {
        "response_groups": "product_desc,media,product_attrs",
        "title": query,
        "num_results": limit,
    }
    response = await client.get("/1.0/library", params=params)
    items: list[dict[str, Any]] = response.get("items", [])
    return items


async def get_book_details(
    client: audible.AsyncClient,
    asin: str,
) -> dict[str, Any]:
    """Fetch details for a single audiobook by ASIN.

    Returns the product dict, or raises ValueError if not found.
    """
    params: dict[str, Any] = {
        "response_groups": "product_desc,media,product_attrs",
    }
    response = await client.get(f"/1.0/library/{asin}", params=params)
    item: dict[str, Any] | None = response.get("item")
    if item is None:
        raise ValueError(f"No book found for ASIN {asin!r}")
    return item


# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------


async def get_download_url(
    client: audible.AsyncClient,
    asin: str,
    quality: str = "Extreme",
    codec: str = "AAX",
) -> str:
    """Request a download URL for an AAX/AAXC file.

    Posts to the Audible download endpoint and returns the CDN content URL.
    Raises ValueError if the API does not return a content_url.
    """
    params: dict[str, str] = {
        "quality": quality,
        "codec": codec,
    }
    response = await client.post(f"/1.0/library/{asin}/download", params=params)
    content_url: str | None = response.get("content_url")
    if not content_url:
        raise ValueError(
            f"Audible API did not return a download URL for ASIN {asin!r}. "
            "Check that the book is in your library and the codec/quality are valid."
        )
    return content_url


async def download_aax(url: str, dest_path: Path) -> None:
    """Stream-download an AAX file from a CDN URL to dest_path.

    Prints progress to stdout as the download proceeds.
    Raises httpx.HTTPStatusError on non-2xx responses.
    """
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(follow_redirects=True, timeout=None) as http:
        async with http.stream("GET", url) as response:
            response.raise_for_status()
            total: int | None = (
                int(response.headers["content-length"])
                if "content-length" in response.headers
                else None
            )
            downloaded = 0
            with dest_path.open("wb") as fh:
                async for chunk in response.aiter_bytes(chunk_size=65_536):
                    fh.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded / total * 100
                        print(
                            f"\r  Downloading... {downloaded / 1_048_576:.1f} MB"
                            f" / {total / 1_048_576:.1f} MB ({pct:.0f}%)",
                            end="",
                            flush=True,
                        )
                    else:
                        print(
                            f"\r  Downloading... {downloaded / 1_048_576:.1f} MB",
                            end="",
                            flush=True,
                        )
            print()  # newline after progress line


# ---------------------------------------------------------------------------
# Decryption helper
# ---------------------------------------------------------------------------

_CODEC_MAP: dict[str, str] = {
    "mp3": "libmp3lame",
    "wav": "pcm_s16le",
}


def decrypt_aax(
    input_path: Path,
    activation_bytes: str,
    output_path: Path,
    fmt: str = "mp3",
) -> None:
    """Decrypt an AAX file to MP3 or WAV using ffmpeg.

    activation_bytes must be an 8-character hex string (e.g. "1a2b3c4d").
    Raises FileNotFoundError if ffmpeg is not on PATH.
    Raises subprocess.CalledProcessError if ffmpeg exits non-zero.
    """
    if shutil.which("ffmpeg") is None:
        raise FileNotFoundError(
            "ffmpeg not found — install with:\n"
            "  macOS:  brew install ffmpeg\n"
            "  Ubuntu: sudo apt install ffmpeg\n"
            "  Windows: https://ffmpeg.org/download.html"
        )

    codec = _CODEC_MAP.get(fmt.lower())
    if codec is None:
        raise ValueError(
            f"Unsupported output format {fmt!r}. Choose 'mp3' or 'wav'."
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",  # overwrite output without prompting
        "-activation_bytes", activation_bytes,
        "-i", str(input_path),
        "-c:a", codec,
        "-q:a", "4",
        str(output_path),
    ]

    print(f"  Running: {' '.join(cmd)}")

    # Stream stderr so the user sees ffmpeg progress
    process = subprocess.Popen(
        cmd,
        stderr=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        text=True,
    )
    assert process.stderr is not None
    for line in process.stderr:
        print(f"  [ffmpeg] {line}", end="", file=sys.stderr)
    process.wait()

    if process.returncode != 0:
        raise subprocess.CalledProcessError(process.returncode, cmd)
