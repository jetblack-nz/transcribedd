import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_role_key: str
    worker_id: str

    whisper_model: str
    whisper_device: str
    whisper_compute_type: str
    whisper_beam_size: int

    timeout_download: int
    timeout_convert: int
    timeout_transcribe: int
    timeout_upload: int

    poll_interval: int
    log_level: str


def load() -> Config:
    def require(name: str) -> str:
        val = os.environ.get(name, "").strip()
        if not val:
            raise RuntimeError(f"Required env var {name} is not set")
        return val

    def optional(name: str, default: str) -> str:
        return os.environ.get(name, default).strip() or default

    return Config(
        supabase_url=require("SUPABASE_URL").rstrip("/"),
        supabase_service_role_key=require("SUPABASE_SERVICE_ROLE_KEY"),
        worker_id=require("WORKER_ID"),

        whisper_model=optional("WHISPER_MODEL", "large-v3"),
        whisper_device=optional("WHISPER_DEVICE", "cuda"),
        whisper_compute_type=optional("WHISPER_COMPUTE_TYPE", "int8"),
        whisper_beam_size=int(optional("WHISPER_BEAM_SIZE", "5")),

        timeout_download=int(optional("TIMEOUT_DOWNLOAD", "300")),
        timeout_convert=int(optional("TIMEOUT_CONVERT", "1800")),
        timeout_transcribe=int(optional("TIMEOUT_TRANSCRIBE", "14400")),
        timeout_upload=int(optional("TIMEOUT_UPLOAD", "120")),

        poll_interval=int(optional("POLL_INTERVAL_SECONDS", "30")),
        log_level=optional("LOG_LEVEL", "info"),
    )
