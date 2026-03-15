import pytest
from unittest.mock import AsyncMock, MagicMock, call

from worker.supabase_ops import (
    claim_next_job,
    complete_job,
    fail_job,
    reset_own_stuck_jobs,
    upload_transcript,
)


def _mock_rpc(data):
    """Build a client mock where .rpc(...).execute() returns data."""
    execute = AsyncMock(return_value=MagicMock(data=data))
    rpc_chain = MagicMock()
    rpc_chain.execute = execute
    client = MagicMock()
    client.rpc = MagicMock(return_value=rpc_chain)
    return client


def _mock_table(data):
    """Build a client mock where .table(...).update(...).eq(...).execute() returns data."""
    execute = AsyncMock(return_value=MagicMock(data=data))
    chain = MagicMock()
    chain.execute = execute
    chain.eq = MagicMock(return_value=chain)
    chain.update = MagicMock(return_value=chain)
    client = MagicMock()
    client.table = MagicMock(return_value=chain)
    return client


# ---------------------------------------------------------------------------
# claim_next_job
# ---------------------------------------------------------------------------

async def test_claim_next_job_returns_none_when_no_pending_jobs():
    client = _mock_rpc(data=[])
    result = await claim_next_job(client, "worker-01")
    assert result is None


async def test_claim_next_job_returns_job_when_available():
    job = {"id": "job-1", "user_id": "user-1", "episode_url": "https://example.com/ep.mp3"}
    client = _mock_rpc(data=[job])
    result = await claim_next_job(client, "worker-01")
    assert result == job


async def test_claim_next_job_passes_worker_id_to_rpc():
    client = _mock_rpc(data=[])
    await claim_next_job(client, "worker-01")
    client.rpc.assert_called_once_with("claim_next_job", {"p_worker_id": "worker-01"})


# ---------------------------------------------------------------------------
# complete_job
# ---------------------------------------------------------------------------

async def test_complete_job_calls_rpc_with_correct_params():
    client = _mock_rpc(data=[{"id": "job-1"}])
    await complete_job(client, "job-1", "user-1/job-1.txt", "worker-01")
    client.rpc.assert_called_once_with(
        "complete_job",
        {"p_job_id": "job-1", "p_transcript_path": "user-1/job-1.txt", "p_worker_id": "worker-01"},
    )


# ---------------------------------------------------------------------------
# fail_job
# ---------------------------------------------------------------------------

async def test_fail_job_calls_rpc_with_correct_params():
    client = _mock_rpc(data=[{"id": "job-1"}])
    await fail_job(client, "job-1", "download failed", "worker-01")
    client.rpc.assert_called_once_with(
        "fail_job",
        {"p_job_id": "job-1", "p_error_message": "download failed", "p_worker_id": "worker-01"},
    )


async def test_fail_job_truncates_error_message_to_1000_chars():
    client = _mock_rpc(data=[{"id": "job-1"}])
    long_error = "x" * 2000

    await fail_job(client, "job-1", long_error, "worker-01")

    sent_params = client.rpc.call_args[0][1]
    assert len(sent_params["p_error_message"]) == 1000


async def test_fail_job_does_not_raise_when_rpc_fails():
    """fail_job must never propagate — it's called in error-handling paths."""
    client = MagicMock()
    client.rpc = MagicMock(side_effect=Exception("network error"))

    # Should not raise
    await fail_job(client, "job-1", "some error", "worker-01")


# ---------------------------------------------------------------------------
# reset_own_stuck_jobs
# ---------------------------------------------------------------------------

async def test_reset_own_stuck_jobs_returns_count_of_reset_jobs():
    stuck_jobs = [{"id": "job-1"}, {"id": "job-2"}]
    client = _mock_table(data=stuck_jobs)

    count = await reset_own_stuck_jobs(client, "worker-01")

    assert count == 2


async def test_reset_own_stuck_jobs_returns_zero_when_none_stuck():
    client = _mock_table(data=[])
    count = await reset_own_stuck_jobs(client, "worker-01")
    assert count == 0


async def test_reset_own_stuck_jobs_filters_by_worker_id():
    client = _mock_table(data=[])
    await reset_own_stuck_jobs(client, "worker-01")

    chain = client.table.return_value
    eq_calls = [c.args for c in chain.eq.call_args_list]
    assert ("status", "processing") in eq_calls
    assert ("worker_id", "worker-01") in eq_calls


# ---------------------------------------------------------------------------
# upload_transcript
# ---------------------------------------------------------------------------

async def test_upload_transcript_returns_correct_path():
    upload_mock = AsyncMock(return_value=MagicMock())
    client = MagicMock()
    client.storage.from_.return_value.upload = upload_mock

    path = await upload_transcript(client, "USER-ID", "JOB-ID", "hello world")

    assert path == "user-id/job-id.txt"


async def test_upload_transcript_lowercases_ids():
    upload_mock = AsyncMock(return_value=MagicMock())
    client = MagicMock()
    client.storage.from_.return_value.upload = upload_mock

    path = await upload_transcript(client, "UPPER-USER", "UPPER-JOB", "text")

    assert path == "upper-user/upper-job.txt"


async def test_upload_transcript_uploads_utf8_encoded_content():
    upload_mock = AsyncMock(return_value=MagicMock())
    client = MagicMock()
    client.storage.from_.return_value.upload = upload_mock

    await upload_transcript(client, "user-1", "job-1", "hello world")

    _, data, _ = upload_mock.call_args[0]
    assert data == b"hello world"


async def test_upload_transcript_targets_transcripts_bucket():
    upload_mock = AsyncMock(return_value=MagicMock())
    client = MagicMock()
    client.storage.from_.return_value.upload = upload_mock

    await upload_transcript(client, "user-1", "job-1", "text")

    client.storage.from_.assert_called_once_with("transcripts")
