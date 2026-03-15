from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import httpx

_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_TMP = Path("/tmp")


def sanitise_url(url: str) -> str:
    """Strip query params and fragment — safe to log."""
    parsed = urlparse(url)
    return urlunparse(parsed._replace(query="", fragment=""))


async def download_audio(url: str, timeout: int) -> Path:
    """Download audio to a temp file. Caller must delete when done."""
    async with httpx.AsyncClient(
        follow_redirects=True,
        headers={"User-Agent": _USER_AGENT},
        timeout=httpx.Timeout(timeout),
    ) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()

            # Derive extension from final URL after redirects
            final_url = str(response.url)
            path_part = urlparse(final_url).path
            suffix = Path(path_part).suffix.split("?")[0] or ".mp3"
            tmp_path = _TMP / f"{uuid.uuid4()}{suffix}"

            with open(tmp_path, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    f.write(chunk)

    return tmp_path
