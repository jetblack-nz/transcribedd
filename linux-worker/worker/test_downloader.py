import pytest
import httpx
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from worker.downloader import sanitise_url, download_audio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_client(mocker, *, status: int = 200, content: bytes = b"data", url: str = "https://cdn.example.com/ep.mp3", captured_headers: dict | None = None):
    """Patch httpx.AsyncClient to return a fake streaming response."""

    async def aiter_bytes(chunk_size=65536):
        yield content

    mock_response = MagicMock()
    mock_response.status_code = status
    mock_response.url = httpx.URL(url)
    mock_response.aiter_bytes = aiter_bytes

    if status >= 400:
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            f"HTTP {status}", request=MagicMock(), response=mock_response
        )
    else:
        mock_response.raise_for_status = MagicMock()

    if captured_headers is not None:
        original_stream = MagicMock()

        async def capturing_aenter(s):
            captured_headers.update(dict(s._request.headers))
            return mock_response

        stream_cm = MagicMock()
        stream_cm.__aenter__ = AsyncMock(return_value=mock_response)
        stream_cm.__aexit__ = AsyncMock(return_value=False)
    else:
        stream_cm = MagicMock()
        stream_cm.__aenter__ = AsyncMock(return_value=mock_response)
        stream_cm.__aexit__ = AsyncMock(return_value=False)

    mock_client = MagicMock()
    mock_client.stream = MagicMock(return_value=stream_cm)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    mocker.patch("worker.downloader.httpx.AsyncClient", return_value=mock_client)
    return mock_client, mock_response


# ---------------------------------------------------------------------------
# sanitise_url
# ---------------------------------------------------------------------------

def test_sanitise_url_strips_query_params():
    url = "https://cdn.example.com/ep.mp3?token=secret&expires=9999"
    assert sanitise_url(url) == "https://cdn.example.com/ep.mp3"


def test_sanitise_url_strips_fragment():
    url = "https://cdn.example.com/ep.mp3#section"
    assert sanitise_url(url) == "https://cdn.example.com/ep.mp3"


def test_sanitise_url_strips_both_query_and_fragment():
    url = "https://cdn.example.com/ep.mp3?token=secret#section"
    assert sanitise_url(url) == "https://cdn.example.com/ep.mp3"


def test_sanitise_url_preserves_path_without_query():
    url = "https://cdn.example.com/shows/ep123.mp3"
    assert sanitise_url(url) == "https://cdn.example.com/shows/ep123.mp3"


def test_sanitise_url_preserves_https_scheme():
    url = "https://cdn.example.com/ep.mp3?x=1"
    assert sanitise_url(url).startswith("https://")


# ---------------------------------------------------------------------------
# download_audio
# ---------------------------------------------------------------------------

async def test_download_audio_saves_content_to_file(mocker):
    _mock_client(mocker, content=b"audio-data")

    path = await download_audio("https://cdn.example.com/ep.mp3", timeout=30)

    try:
        assert path.exists()
        assert path.read_bytes() == b"audio-data"
    finally:
        path.unlink(missing_ok=True)


async def test_download_audio_uses_mp3_extension_from_url(mocker):
    _mock_client(mocker, url="https://cdn.example.com/episode.mp3")

    path = await download_audio("https://cdn.example.com/episode.mp3", timeout=30)
    path.unlink(missing_ok=True)

    assert path.suffix == ".mp3"


async def test_download_audio_uses_m4a_extension_from_url(mocker):
    _mock_client(mocker, url="https://cdn.example.com/episode.m4a")

    path = await download_audio("https://cdn.example.com/episode.m4a", timeout=30)
    path.unlink(missing_ok=True)

    assert path.suffix == ".m4a"


async def test_download_audio_raises_on_404(mocker):
    _mock_client(mocker, status=404)

    with pytest.raises(httpx.HTTPStatusError):
        await download_audio("https://cdn.example.com/missing.mp3", timeout=30)


async def test_download_audio_raises_on_403(mocker):
    _mock_client(mocker, status=403)

    with pytest.raises(httpx.HTTPStatusError):
        await download_audio("https://cdn.example.com/forbidden.mp3", timeout=30)


async def test_download_audio_sends_browser_user_agent(mocker):
    _, mock_response = _mock_client(mocker)

    # Capture what headers were passed to the client constructor
    captured = {}

    original_init = httpx.AsyncClient.__init__

    def patching_init(self, *args, **kwargs):
        captured.update(kwargs.get("headers", {}))

    client_cls = mocker.patch("worker.downloader.httpx.AsyncClient")
    client_instance = MagicMock()

    async def aiter_bytes(chunk_size=65536):
        yield b"data"

    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.url = httpx.URL("https://cdn.example.com/ep.mp3")
    resp.aiter_bytes = aiter_bytes

    stream_cm = MagicMock()
    stream_cm.__aenter__ = AsyncMock(return_value=resp)
    stream_cm.__aexit__ = AsyncMock(return_value=False)
    client_instance.stream = MagicMock(return_value=stream_cm)
    client_instance.__aenter__ = AsyncMock(return_value=client_instance)
    client_instance.__aexit__ = AsyncMock(return_value=False)

    client_cls.return_value = client_instance

    await download_audio("https://cdn.example.com/ep.mp3", timeout=30)

    _, kwargs = client_cls.call_args
    headers = kwargs.get("headers", {})
    assert "Mozilla" in headers.get("User-Agent", "")
