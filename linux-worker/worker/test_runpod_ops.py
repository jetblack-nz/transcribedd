import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock

from worker.runpod_ops import stop_pod


def _mock_http(mocker, *, status: int = 200):
    mock_resp = MagicMock()
    mock_resp.status_code = status
    if status >= 400:
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            f"HTTP {status}", request=MagicMock(), response=mock_resp
        )
    else:
        mock_resp.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    mocker.patch("worker.runpod_ops.httpx.AsyncClient", return_value=mock_client)
    return mock_client


async def test_stop_pod_calls_correct_url(mocker):
    mock_client = _mock_http(mocker)
    await stop_pod("test-api-key", "pod-abc123")
    _, kwargs = mock_client.post.call_args
    assert "pod-abc123" in mock_client.post.call_args[0][0]


async def test_stop_pod_sends_bearer_token(mocker):
    mock_client = _mock_http(mocker)
    await stop_pod("my-api-key", "pod-abc123")
    _, kwargs = mock_client.post.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer my-api-key"


async def test_stop_pod_succeeds_on_200(mocker):
    _mock_http(mocker, status=200)
    # Should not raise
    await stop_pod("key", "pod-xyz")


async def test_stop_pod_swallows_http_error(mocker):
    _mock_http(mocker, status=400)
    # Should not raise — errors are logged, not propagated
    await stop_pod("key", "pod-xyz")


async def test_stop_pod_swallows_network_error(mocker):
    mock_client = MagicMock()
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mocker.patch("worker.runpod_ops.httpx.AsyncClient", return_value=mock_client)
    # Should not raise
    await stop_pod("key", "pod-xyz")
