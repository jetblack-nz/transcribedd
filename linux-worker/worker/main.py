from __future__ import annotations

import asyncio
import signal
import time
from pathlib import Path

import structlog
import structlog.processors
import structlog.stdlib

from . import config as config_module
from .config import Config
from .downloader import download_audio, sanitise_url
from .runpod_ops import stop_pod
from .supabase_ops import (
    claim_next_job,
    complete_job,
    fail_job,
    init_client,
    reset_own_stuck_jobs,
    upload_transcript,
)
from .transcriber import Transcriber


def setup_logging(cfg: Config) -> None:
    level = cfg.log_level.upper()
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(__import__("logging"), level, 20)
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


async def process_job(supabase, transcriber: Transcriber, job: dict, cfg: Config) -> None:
    job_id: str = job["id"]
    user_id: str = job["user_id"]
    episode_url: str = job["episode_url"]
    log = structlog.get_logger().bind(job_id=job_id)

    tmp_audio: Path | None = None
    tmp_wav: Path | None = None
    stage = "init"
    t_start = time.monotonic()

    try:
        # Download
        stage = "download"
        log.info("download.started", url_sanitised=sanitise_url(episode_url))
        t = time.monotonic()
        tmp_audio = await asyncio.wait_for(
            download_audio(episode_url, cfg.timeout_download),
            timeout=cfg.timeout_download,
        )
        size = tmp_audio.stat().st_size
        log.info("download.completed", size_bytes=size, duration_ms=int((time.monotonic() - t) * 1000))

        # Convert (skip if already WAV)
        stage = "convert"
        suffix = tmp_audio.suffix.lower()
        if suffix != ".wav":
            log.info("convert.started", input_format=suffix.lstrip("."))
            t = time.monotonic()
            tmp_wav = await asyncio.wait_for(
                transcriber.convert_to_wav(tmp_audio, cfg.timeout_convert),
                timeout=cfg.timeout_convert,
            )
            log.info("convert.completed", duration_ms=int((time.monotonic() - t) * 1000))
        else:
            tmp_wav = tmp_audio

        # Transcribe
        stage = "transcribe"
        log.info("transcribe.started")
        t = time.monotonic()

        async def on_progress(pct: int) -> None:
            log.info("transcribe.progress", pct_complete=pct)

        transcript, audio_duration = await transcriber.transcribe(
            tmp_wav,
            timeout=cfg.timeout_transcribe,
            on_progress=on_progress,
        )
        transcription_ms = int((time.monotonic() - t) * 1000)
        realtime_factor = round(audio_duration / (transcription_ms / 1000), 1) if transcription_ms > 0 else 0
        word_count = len(transcript.split())
        log.info(
            "transcribe.completed",
            audio_duration_s=round(audio_duration, 1),
            transcription_duration_ms=transcription_ms,
            realtime_factor=realtime_factor,
            word_count=word_count,
        )

        # Upload
        stage = "upload"
        log.info("upload.started", path=f"{user_id}/{job_id}.txt")
        t = time.monotonic()
        path = await asyncio.wait_for(
            upload_transcript(supabase, user_id, job_id, transcript),
            timeout=cfg.timeout_upload,
        )
        log.info("upload.completed", path=path, size_bytes=len(transcript.encode()), duration_ms=int((time.monotonic() - t) * 1000))

        # Complete
        await complete_job(supabase, job_id, path, cfg.worker_id)
        log.info("job.completed", total_duration_ms=int((time.monotonic() - t_start) * 1000))

    except asyncio.TimeoutError:
        log.error("job.timeout", stage=stage, timeout_s=getattr(cfg, f"timeout_{stage}", 0))
        await fail_job(supabase, job_id, f"{stage} timed out", cfg.worker_id)

    except Exception as exc:
        log.error("job.failed", stage=stage, error=str(exc), total_duration_ms=int((time.monotonic() - t_start) * 1000))
        await fail_job(supabase, job_id, str(exc)[:1000], cfg.worker_id)

    finally:
        for p in {tmp_audio, tmp_wav} - {None}:
            try:
                p.unlink(missing_ok=True)  # type: ignore[union-attr]
            except Exception:
                pass


async def run_realtime(supabase, job_available: asyncio.Event, log) -> None:
    """Subscribe to Realtime INSERT events on jobs. Sets job_available on each insert."""
    try:
        def _on_insert(_payload: dict) -> None:
            job_available.set()

        channel = supabase.channel("jobs-inserts")
        channel.on_postgres_changes(
            event="INSERT",
            schema="public",
            table="jobs",
            callback=_on_insert,
        )
        await supabase.realtime.connect()
        await channel.subscribe()
        log.info("realtime.connected", channel="public:jobs")
    except Exception as exc:
        log.warning("realtime.failed", error=str(exc), note="polling fallback active")


async def main() -> None:
    cfg = config_module.load()
    setup_logging(cfg)
    log = structlog.get_logger().bind(worker_id=cfg.worker_id)

    # Graceful shutdown
    shutdown = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: (shutdown.set(), log.info("worker.shutdown", reason="signal")))

    # Load Whisper model
    transcriber = Transcriber(cfg)
    t = time.monotonic()
    log.info("worker.loading_model", model=cfg.whisper_model, device=cfg.whisper_device, compute_type=cfg.whisper_compute_type)
    await transcriber.load()
    log.info("worker.startup", model=cfg.whisper_model, device=cfg.whisper_device, compute_type=cfg.whisper_compute_type, load_time_ms=int((time.monotonic() - t) * 1000))

    # Init Supabase
    supabase = await init_client(cfg)

    # Reset own stuck jobs from a previous crash
    reset_count = await reset_own_stuck_jobs(supabase, cfg.worker_id)
    if reset_count:
        log.info("worker.reset_stuck_jobs", count=reset_count)

    # Realtime subscription (best-effort; polling is the fallback)
    job_available = asyncio.Event()
    asyncio.create_task(run_realtime(supabase, job_available, log))

    # Job loop
    while not shutdown.is_set():
        job = await claim_next_job(supabase, cfg.worker_id)

        if job is None:
            log.info("job.none_available", sleep_s=cfg.poll_interval)
            try:
                await asyncio.wait_for(job_available.wait(), timeout=cfg.poll_interval)
                log.info("job.woken_by_realtime")
            except asyncio.TimeoutError:
                # Queue still empty after full poll interval — stop pod if on RunPod
                if cfg.runpod_api_key and cfg.runpod_pod_id:
                    log.info("runpod.stopping", reason="queue empty")
                    await stop_pod(cfg.runpod_api_key, cfg.runpod_pod_id)
                    break
            finally:
                job_available.clear()
            continue

        log.info(
            "job.claimed",
            job_id=job["id"],
            podcast_title=job.get("podcast_title"),
            episode_title=job.get("episode_title"),
        )
        await process_job(supabase, transcriber, job, cfg)


def entrypoint() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    entrypoint()
