from __future__ import annotations

import asyncio
import queue
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, Awaitable

import structlog
from faster_whisper import WhisperModel

from .config import Config

_TMP = Path("/tmp")
_FFMPEG = "ffmpeg"


class Transcriber:
    def __init__(self, config: Config) -> None:
        self._config = config
        self._executor = ThreadPoolExecutor(max_workers=1)
        self._model: WhisperModel | None = None

    async def load(self) -> None:
        loop = asyncio.get_running_loop()
        self._model = await loop.run_in_executor(
            self._executor,
            lambda: WhisperModel(
                self._config.whisper_model,
                device=self._config.whisper_device,
                compute_type=self._config.whisper_compute_type,
            ),
        )

    async def convert_to_wav(self, input_path: Path, timeout: int) -> Path:
        """Convert audio to 16 kHz mono WAV. Returns path to new temp file."""
        output_path = _TMP / f"{uuid.uuid4()}.wav"
        proc = await asyncio.create_subprocess_exec(
            _FFMPEG, "-y",
            "-i", str(input_path),
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            str(output_path),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise

        if proc.returncode != 0:
            stderr_snippet = (stderr or b"").decode(errors="replace")[:500]
            raise RuntimeError(f"ffmpeg exit code {proc.returncode}: {stderr_snippet}")

        return output_path

    async def transcribe(
        self,
        wav_path: Path,
        timeout: int,
        on_progress: Callable[[int], Awaitable[None]] | None = None,
    ) -> tuple[str, float]:
        """
        Transcribe a WAV file. Returns (transcript_text, audio_duration_seconds).
        Calls on_progress(pct) every ~10% if provided.
        """
        assert self._model is not None, "call load() first"

        progress_q: queue.SimpleQueue[int | None] = queue.SimpleQueue()
        model = self._model
        beam_size = self._config.whisper_beam_size

        def _run() -> tuple[str, float]:
            segments, info = model.transcribe(
                str(wav_path),
                beam_size=beam_size,
            )
            texts: list[str] = []
            for seg in segments:
                texts.append(seg.text)
                if info.duration > 0:
                    pct = min(100, int(seg.end / info.duration * 100))
                    progress_q.put(pct)
            progress_q.put(None)  # sentinel
            return "".join(texts).strip(), info.duration

        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(self._executor, _run)

        last_reported = -1
        deadline = time.monotonic() + timeout

        while not future.done():
            if time.monotonic() > deadline:
                # Can't kill the thread, but we can abandon the future and fail the job.
                future.cancel()
                raise asyncio.TimeoutError()

            await asyncio.sleep(2)

            # Drain progress queue and report milestones
            while True:
                try:
                    pct = progress_q.get_nowait()
                except queue.Empty:
                    break
                if pct is None:
                    break
                if on_progress and pct >= last_reported + 10:
                    await on_progress(pct)
                    last_reported = pct

        return await future
