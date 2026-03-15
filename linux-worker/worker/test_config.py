import pytest
from worker.config import load

_REQUIRED = {
    "SUPABASE_URL": "https://project.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-key",
    "WORKER_ID": "worker-01",
}


def _set_required(monkeypatch, overrides=None):
    for k, v in {**_REQUIRED, **(overrides or {})}.items():
        monkeypatch.setenv(k, v)


def test_load_succeeds_with_required_vars(monkeypatch):
    _set_required(monkeypatch)
    cfg = load()
    assert cfg.supabase_url == "https://project.supabase.co"
    assert cfg.supabase_service_role_key == "service-key"
    assert cfg.worker_id == "worker-01"


def test_load_strips_trailing_slash_from_url(monkeypatch):
    _set_required(monkeypatch, {"SUPABASE_URL": "https://project.supabase.co/"})
    cfg = load()
    assert cfg.supabase_url == "https://project.supabase.co"


@pytest.mark.parametrize("missing_var", _REQUIRED.keys())
def test_load_raises_when_required_var_missing(monkeypatch, missing_var):
    for k, v in _REQUIRED.items():
        if k != missing_var:
            monkeypatch.setenv(k, v)
    monkeypatch.delenv(missing_var, raising=False)

    with pytest.raises(RuntimeError, match=missing_var):
        load()


def test_load_uses_default_whisper_settings(monkeypatch):
    _set_required(monkeypatch)
    cfg = load()
    assert cfg.whisper_model == "large-v3"
    assert cfg.whisper_device == "cuda"
    assert cfg.whisper_compute_type == "int8"
    assert cfg.whisper_beam_size == 5


def test_load_overrides_whisper_settings(monkeypatch):
    _set_required(monkeypatch)
    monkeypatch.setenv("WHISPER_MODEL", "medium")
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    monkeypatch.setenv("WHISPER_COMPUTE_TYPE", "float16")
    monkeypatch.setenv("WHISPER_BEAM_SIZE", "3")

    cfg = load()
    assert cfg.whisper_model == "medium"
    assert cfg.whisper_device == "cpu"
    assert cfg.whisper_compute_type == "float16"
    assert cfg.whisper_beam_size == 3


def test_load_uses_default_timeouts(monkeypatch):
    _set_required(monkeypatch)
    cfg = load()
    assert cfg.timeout_download == 300
    assert cfg.timeout_convert == 1800
    assert cfg.timeout_transcribe == 14400
    assert cfg.timeout_upload == 120


def test_load_overrides_timeouts(monkeypatch):
    _set_required(monkeypatch)
    monkeypatch.setenv("TIMEOUT_DOWNLOAD", "60")
    monkeypatch.setenv("TIMEOUT_TRANSCRIBE", "3600")

    cfg = load()
    assert cfg.timeout_download == 60
    assert cfg.timeout_transcribe == 3600
