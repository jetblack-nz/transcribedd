import asyncio
import threading
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from worker.config import Config
from worker.transcriber import Transcriber


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
        timeout_convert=30,
        timeout_transcribe=60,
        timeout_upload=120,
        poll_interval=30,
        log_level="info",
    )
    return Config(**{**defaults, **overrides})


# ---------------------------------------------------------------------------
# convert_to_wav
# ---------------------------------------------------------------------------

async def test_convert_to_wav_returns_wav_path(tmp_path, mocker):
    proc = MagicMock()
    proc.returncode = 0
    proc.communicate = AsyncMock(return_value=(b"", b""))

    mocker.patch("worker.transcriber.asyncio.create_subprocess_exec", return_value=proc)

    t = Transcriber(_make_config())
    input_path = tmp_path / "episode.mp3"
    input_path.write_bytes(b"audio")

    result = await t.convert_to_wav(input_path, timeout=30)

    assert result.suffix == ".wav"


async def test_convert_to_wav_calls_ffmpeg_with_correct_args(tmp_path, mocker):
    proc = MagicMock()
    proc.returncode = 0
    proc.communicate = AsyncMock(return_value=(b"", b""))
    create_proc = mocker.patch("worker.transcriber.asyncio.create_subprocess_exec", return_value=proc)

    t = Transcriber(_make_config())
    input_path = tmp_path / "ep.mp3"
    input_path.write_bytes(b"audio")

    await t.convert_to_wav(input_path, timeout=30)

    args = create_proc.call_args[0]
    assert args[0] == "ffmpeg"
    assert "-ar" in args and "16000" in args
    assert "-ac" in args and "1" in args
    assert "-c:a" in args and "pcm_s16le" in args


async def test_convert_to_wav_raises_on_nonzero_exit(tmp_path, mocker):
    proc = MagicMock()
    proc.returncode = 1
    proc.communicate = AsyncMock(return_value=(b"", b"ffmpeg: invalid input"))
    mocker.patch("worker.transcriber.asyncio.create_subprocess_exec", return_value=proc)

    t = Transcriber(_make_config())
    input_path = tmp_path / "bad.mp3"
    input_path.write_bytes(b"garbage")

    with pytest.raises(RuntimeError, match="ffmpeg exit code 1"):
        await t.convert_to_wav(input_path, timeout=30)


async def test_convert_to_wav_kills_process_on_timeout(tmp_path, mocker):
    proc = MagicMock()
    proc.returncode = -9
    proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError)
    proc.kill = MagicMock()
    # Second communicate call (after kill) must succeed
    kill_communicate = AsyncMock(return_value=(b"", b""))

    communicate_calls = [asyncio.TimeoutError(), (b"", b"")]

    async def communicate_side_effect():
        val = communicate_calls.pop(0)
        if isinstance(val, Exception):
            raise val
        return val

    proc.communicate = communicate_side_effect
    mocker.patch("worker.transcriber.asyncio.create_subprocess_exec", return_value=proc)

    t = Transcriber(_make_config())
    input_path = tmp_path / "ep.mp3"
    input_path.write_bytes(b"audio")

    with pytest.raises(asyncio.TimeoutError):
        await t.convert_to_wav(input_path, timeout=1)

    proc.kill.assert_called_once()


# ---------------------------------------------------------------------------
# transcribe
# ---------------------------------------------------------------------------

def _make_segment(text: str, end: float) -> MagicMock:
    seg = MagicMock()
    seg.text = text
    seg.end = end
    return seg


def _make_info(duration: float, language: str = "en") -> MagicMock:
    info = MagicMock()
    info.duration = duration
    info.language = language
    return info


async def test_transcribe_returns_joined_segment_text(mocker):
    segments = [_make_segment(" Hello", 10.0), _make_segment(" world", 20.0)]
    info = _make_info(duration=20.0)

    mock_model = MagicMock()
    mock_model.transcribe = MagicMock(return_value=(iter(segments), info))
    mocker.patch("worker.transcriber.WhisperModel", return_value=mock_model)

    t = Transcriber(_make_config())
    await t.load()

    transcript, duration = await t.transcribe(Path("/tmp/fake.wav"), timeout=60)

    assert transcript == "Hello world"
    assert duration == 20.0


async def test_transcribe_calls_model_with_beam_size(mocker):
    mock_model = MagicMock()
    mock_model.transcribe = MagicMock(return_value=(iter([]), _make_info(10.0)))
    mocker.patch("worker.transcriber.WhisperModel", return_value=mock_model)

    t = Transcriber(_make_config(whisper_beam_size=3))
    await t.load()

    await t.transcribe(Path("/tmp/fake.wav"), timeout=60)

    mock_model.transcribe.assert_called_once_with(
        "/tmp/fake.wav", beam_size=3
    )


async def test_transcribe_reports_progress_at_10_percent_milestones(mocker):
    # 10 segments each at 10% of a 100s audio file
    segments = [_make_segment(f" word{i}", float((i + 1) * 10)) for i in range(10)]
    info = _make_info(duration=100.0)

    mock_model = MagicMock()
    mock_model.transcribe = MagicMock(return_value=(iter(segments), info))
    mocker.patch("worker.transcriber.WhisperModel", return_value=mock_model)

    t = Transcriber(_make_config())
    await t.load()

    reported = []

    async def on_progress(pct: int) -> None:
        reported.append(pct)

    await t.transcribe(Path("/tmp/fake.wav"), timeout=60, on_progress=on_progress)

    # Should report at 10, 20, 30 ... 100
    assert len(reported) == 10
    assert reported[0] == 10
    assert reported[-1] == 100


async def test_transcribe_does_not_report_same_milestone_twice(mocker):
    # Many segments all within the 0–10% window
    segments = [_make_segment(f" w{i}", float(i + 1)) for i in range(5)]
    info = _make_info(duration=100.0)

    mock_model = MagicMock()
    mock_model.transcribe = MagicMock(return_value=(iter(segments), info))
    mocker.patch("worker.transcriber.WhisperModel", return_value=mock_model)

    t = Transcriber(_make_config())
    await t.load()

    reported = []
    await t.transcribe(Path("/tmp/fake.wav"), timeout=60, on_progress=lambda p: reported.append(p))

    # All segments are under 10%, so only one progress event at most
    assert reported.count(10) <= 1


async def test_transcribe_raises_timeout_error_when_exceeded(mocker):
    ready = threading.Event()

    def slow_transcribe(*_args, **_kwargs):
        ready.wait(timeout=10)  # blocks until test unblocks it
        return iter([]), _make_info(1.0)

    mock_model = MagicMock()
    mock_model.transcribe = slow_transcribe
    mocker.patch("worker.transcriber.WhisperModel", return_value=mock_model)

    t = Transcriber(_make_config())
    await t.load()

    with pytest.raises(asyncio.TimeoutError):
        await t.transcribe(Path("/tmp/fake.wav"), timeout=1)

    ready.set()  # unblock thread so it can exit cleanly
