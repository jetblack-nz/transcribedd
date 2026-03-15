"""
Tests for process_job — the core job processing function in main.py.

External dependencies (Supabase, downloader, transcriber) are all mocked
so these tests run without network access or GPU.
"""
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from worker.config import Config
from worker.main import process_job


def _make_config(**overrides) -> Config:
    defaults = dict(
        supabase_url="https://x.supabase.co",
        supabase_service_role_key="key",
        worker_id="worker-01",
        whisper_model="large-v3",
        whisper_device="cuda",
        whisper_compute_type="int8",
        whisper_beam_size=5,
        timeout_download=300,
        timeout_convert=1800,
        timeout_transcribe=14400,
        timeout_upload=120,
        poll_interval=30,
        log_level="info",
    )
    return Config(**{**defaults, **overrides})


def _make_job(**overrides) -> dict:
    defaults = dict(
        id="job-abc",
        user_id="user-xyz",
        podcast_title="Test Podcast",
        episode_title="Episode 1",
        episode_url="https://cdn.example.com/ep.mp3",
        status="processing",
    )
    return {**defaults, **overrides}


def _make_transcriber(transcript="Hello world", audio_duration=120.0):
    t = MagicMock()
    t.convert_to_wav = AsyncMock(return_value=Path("/tmp/fake.wav"))
    t.transcribe = AsyncMock(return_value=(transcript, audio_duration))
    return t


def _audio_file(tmp_path: Path, name="ep.mp3") -> Path:
    """Create a real temp audio file so stat() succeeds."""
    p = tmp_path / name
    p.write_bytes(b"fake-audio-data")
    return p


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

async def test_process_job_calls_complete_job_on_success(mocker, tmp_path):
    audio = _audio_file(tmp_path)
    job = _make_job()
    cfg = _make_config()
    transcriber = _make_transcriber()

    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, return_value=audio)
    mocker.patch("worker.main.upload_transcript", new_callable=AsyncMock, return_value="user-xyz/job-abc.txt")
    mock_complete = mocker.patch("worker.main.complete_job", new_callable=AsyncMock)
    mock_fail = mocker.patch("worker.main.fail_job", new_callable=AsyncMock)

    await process_job(MagicMock(), transcriber, job, cfg)

    mock_complete.assert_awaited_once()
    assert mock_complete.call_args[0][1:] == ("job-abc", "user-xyz/job-abc.txt", "worker-01")
    mock_fail.assert_not_awaited()


async def test_process_job_converts_non_wav_audio(mocker, tmp_path):
    audio = _audio_file(tmp_path, "ep.mp3")
    wav = _audio_file(tmp_path, "ep.wav")
    transcriber = _make_transcriber()
    transcriber.convert_to_wav = AsyncMock(return_value=wav)

    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, return_value=audio)
    mocker.patch("worker.main.upload_transcript", new_callable=AsyncMock, return_value="u/j.txt")
    mocker.patch("worker.main.complete_job", new_callable=AsyncMock)
    mocker.patch("worker.main.fail_job", new_callable=AsyncMock)

    await process_job(MagicMock(), transcriber, _make_job(), _make_config())

    transcriber.convert_to_wav.assert_awaited_once()


async def test_process_job_skips_conversion_for_wav_audio(mocker, tmp_path):
    audio = _audio_file(tmp_path, "ep.wav")
    transcriber = _make_transcriber()

    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, return_value=audio)
    mocker.patch("worker.main.upload_transcript", new_callable=AsyncMock, return_value="u/j.txt")
    mocker.patch("worker.main.complete_job", new_callable=AsyncMock)
    mocker.patch("worker.main.fail_job", new_callable=AsyncMock)

    await process_job(MagicMock(), transcriber, _make_job(), _make_config())

    transcriber.convert_to_wav.assert_not_awaited()


async def test_process_job_uploads_transcript_to_correct_user_path(mocker, tmp_path):
    audio = _audio_file(tmp_path)
    transcriber = _make_transcriber(transcript="transcribed text")

    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, return_value=audio)
    mock_upload = mocker.patch("worker.main.upload_transcript", new_callable=AsyncMock, return_value="user-xyz/job-abc.txt")
    mocker.patch("worker.main.complete_job", new_callable=AsyncMock)
    mocker.patch("worker.main.fail_job", new_callable=AsyncMock)

    supabase = MagicMock()
    await process_job(supabase, transcriber, _make_job(user_id="user-xyz", id="job-abc"), _make_config())

    mock_upload.assert_awaited_once_with(supabase, "user-xyz", "job-abc", "transcribed text")


# ---------------------------------------------------------------------------
# Failure paths — fail_job called, complete_job not called
# ---------------------------------------------------------------------------

async def test_process_job_calls_fail_job_when_download_raises(mocker):
    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, side_effect=Exception("HTTP 403"))
    mock_complete = mocker.patch("worker.main.complete_job", new_callable=AsyncMock)
    mock_fail = mocker.patch("worker.main.fail_job", new_callable=AsyncMock)

    await process_job(MagicMock(), _make_transcriber(), _make_job(), _make_config())

    mock_fail.assert_awaited_once()
    mock_complete.assert_not_awaited()
    assert "HTTP 403" in mock_fail.call_args[0][2]


async def test_process_job_calls_fail_job_when_transcription_raises(mocker, tmp_path):
    audio = _audio_file(tmp_path)
    transcriber = _make_transcriber()
    transcriber.transcribe = AsyncMock(side_effect=RuntimeError("CUDA OOM"))

    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, return_value=audio)
    mock_complete = mocker.patch("worker.main.complete_job", new_callable=AsyncMock)
    mock_fail = mocker.patch("worker.main.fail_job", new_callable=AsyncMock)

    await process_job(MagicMock(), transcriber, _make_job(), _make_config())

    mock_fail.assert_awaited_once()
    mock_complete.assert_not_awaited()
    assert "CUDA OOM" in mock_fail.call_args[0][2]


async def test_process_job_calls_fail_job_when_upload_raises(mocker, tmp_path):
    audio = _audio_file(tmp_path)

    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, return_value=audio)
    mocker.patch("worker.main.upload_transcript", new_callable=AsyncMock, side_effect=Exception("storage error"))
    mock_complete = mocker.patch("worker.main.complete_job", new_callable=AsyncMock)
    mock_fail = mocker.patch("worker.main.fail_job", new_callable=AsyncMock)

    await process_job(MagicMock(), _make_transcriber(), _make_job(), _make_config())

    mock_fail.assert_awaited_once()
    mock_complete.assert_not_awaited()


async def test_process_job_passes_worker_id_to_fail_job(mocker):
    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, side_effect=Exception("err"))
    mock_fail = mocker.patch("worker.main.fail_job", new_callable=AsyncMock)

    await process_job(MagicMock(), _make_transcriber(), _make_job(), _make_config(worker_id="my-worker"))

    assert mock_fail.call_args[0][3] == "my-worker"


# ---------------------------------------------------------------------------
# Timeout paths
# ---------------------------------------------------------------------------

async def test_process_job_calls_fail_job_on_download_timeout(mocker):
    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, side_effect=asyncio.TimeoutError)
    mock_fail = mocker.patch("worker.main.fail_job", new_callable=AsyncMock)
    mocker.patch("worker.main.complete_job", new_callable=AsyncMock)

    await process_job(MagicMock(), _make_transcriber(), _make_job(), _make_config())

    mock_fail.assert_awaited_once()
    assert "timed out" in mock_fail.call_args[0][2]


async def test_process_job_calls_fail_job_on_transcribe_timeout(mocker, tmp_path):
    audio = _audio_file(tmp_path)
    transcriber = _make_transcriber()
    transcriber.transcribe = AsyncMock(side_effect=asyncio.TimeoutError)

    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, return_value=audio)
    mock_fail = mocker.patch("worker.main.fail_job", new_callable=AsyncMock)
    mocker.patch("worker.main.complete_job", new_callable=AsyncMock)

    await process_job(MagicMock(), transcriber, _make_job(), _make_config())

    mock_fail.assert_awaited_once()
    assert "timed out" in mock_fail.call_args[0][2]


# ---------------------------------------------------------------------------
# Temp file cleanup
# ---------------------------------------------------------------------------

async def test_process_job_cleans_up_temp_files_on_success(mocker, tmp_path):
    audio = _audio_file(tmp_path, "ep.mp3")
    wav = _audio_file(tmp_path, "ep.wav")
    transcriber = _make_transcriber()
    transcriber.convert_to_wav = AsyncMock(return_value=wav)

    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, return_value=audio)
    mocker.patch("worker.main.upload_transcript", new_callable=AsyncMock, return_value="u/j.txt")
    mocker.patch("worker.main.complete_job", new_callable=AsyncMock)
    mocker.patch("worker.main.fail_job", new_callable=AsyncMock)

    await process_job(MagicMock(), transcriber, _make_job(), _make_config())

    assert not audio.exists()
    assert not wav.exists()


async def test_process_job_cleans_up_temp_files_on_failure(mocker, tmp_path):
    audio = _audio_file(tmp_path, "ep.mp3")
    transcriber = _make_transcriber()
    transcriber.transcribe = AsyncMock(side_effect=RuntimeError("boom"))

    mocker.patch("worker.main.download_audio", new_callable=AsyncMock, return_value=audio)
    mocker.patch("worker.main.fail_job", new_callable=AsyncMock)
    mocker.patch("worker.main.complete_job", new_callable=AsyncMock)

    await process_job(MagicMock(), transcriber, _make_job(), _make_config())

    assert not audio.exists()
