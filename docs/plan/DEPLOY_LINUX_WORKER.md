# Linux Worker — Deployment Plan (node3.gyr.lan)

Target machine: `stef@node3.gyr.lan` (Debian, NVIDIA T600 GPU)

---

## Prerequisites — verify before starting

```bash
# Docker is installed and running
docker version

# NVIDIA driver is loaded
nvidia-smi

# NVIDIA Container Toolkit is installed (needed for GPU passthrough)
nvidia-ctk --version

# Docker can see the GPU
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

If the last command fails, the NVIDIA Container Toolkit runtime is not configured.
Fix: `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`

---

## 1. Clone the repo

```bash
git clone git@github.com:jetblack-nz/transcribedd.git ~/transcribedd
cd ~/transcribedd/linux-worker
```

If already cloned:

```bash
cd ~/transcribedd
git pull
cd linux-worker
```

---

## 2. Create the .env file

```bash
cp .env.example .env
nano .env   # or vi .env
```

Fill in these values (get from the operator):

```env
SUPABASE_URL=https://dsxfwfeuvkccepfangqd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>

WORKER_ID=node3-gpu-worker-01

WHISPER_MODEL=large-v3
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=int8
WHISPER_BEAM_SIZE=5

TIMEOUT_DOWNLOAD=300
TIMEOUT_CONVERT=1800
TIMEOUT_TRANSCRIBE=14400
TIMEOUT_UPLOAD=120

POLL_INTERVAL_SECONDS=30
LOG_LEVEL=info
```

Verify the file is not world-readable:

```bash
chmod 600 .env
```

---

## 3. Build the Docker image

```bash
docker build -t transcribedd-worker:latest .
```

Expected duration: 3–5 minutes (downloads CUDA base image layers on first build).

---

## 4. First run — downloads Whisper model

The `large-v3` model (~1.5 GB) is downloaded on first startup into a named Docker volume.
It is **not** baked into the image.

```bash
docker compose up
```

Watch for these log lines (structured JSON):

```
{"event": "worker.startup", "model": "large-v3", "device": "cuda", ...}
{"event": "realtime.connected", "channel": "public:jobs"}
```

The first run will take a few extra minutes while the model downloads. Subsequent starts
use the cached volume and load in ~5 seconds.

Once you see `realtime.connected` the worker is live and polling for jobs.

Press `Ctrl+C` to stop, then start detached:

```bash
docker compose up -d
```

---

## 5. Verify GPU is in use

```bash
# Check container is running
docker compose ps

# Tail logs
docker compose logs -f

# Confirm GPU memory is allocated (should show ~1.5 GB used)
nvidia-smi
```

---

## 6. Submit a test job

From the web app (transcribedd.com):
1. Search for any podcast episode
2. Submit a transcription job
3. Watch `docker compose logs -f` — you should see:

```
{"event": "job.claimed", "job_id": "...", "podcast_title": "...", ...}
{"event": "download.completed", ...}
{"event": "convert.completed", ...}
{"event": "transcribe.started", "audio_duration_s": ..., ...}
{"event": "transcribe.progress", "pct_complete": 25, ...}
{"event": "job.completed", "total_duration_ms": ..., ...}
```

4. The dashboard should update to "Completed" and the download button should work.

---

## 7. Keep it running across reboots

The `docker-compose.yml` already has `restart: unless-stopped`. Ensure Docker itself
starts on boot:

```bash
sudo systemctl enable docker
```

The container will then restart automatically after a reboot or crash.

---

## Updating the worker

```bash
cd ~/transcribedd/linux-worker
git pull
docker build -t transcribedd-worker:latest .
docker compose up -d
```

The Whisper model volume is preserved across rebuilds — no re-download needed.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `CUDA out of memory` in logs | Another process is using VRAM | Check `nvidia-smi`, reduce `WHISPER_MODEL` to `medium` or `WHISPER_COMPUTE_TYPE` to `int8_float16` |
| `realtime.disconnected` repeatedly | Supabase Realtime WebSocket issue | Worker falls back to 30s polling automatically — jobs still process |
| Job stuck in `processing` after restart | Worker crashed mid-job | Worker resets its own stuck jobs on startup automatically |
| `HTTP 403` on download | Podcast CDN blocked the request | Known limitation — `fail_job` is called, worker continues |
| Container exits immediately | Bad `.env` value | Run `docker compose logs` to see which env var failed validation |
