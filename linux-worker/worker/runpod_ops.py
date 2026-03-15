from __future__ import annotations

import httpx
import structlog

log = structlog.get_logger()

RUNPOD_API_BASE = "https://rest.runpod.io/v1"


async def stop_pod(api_key: str, pod_id: str) -> None:
    """Signal RunPod to stop this pod. Called after the job queue drains."""
    url = f"{RUNPOD_API_BASE}/pods/{pod_id}/stop"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
            resp.raise_for_status()
        log.info("runpod.pod_stopped", pod_id=pod_id)
    except Exception as exc:
        log.error("runpod.stop_failed", pod_id=pod_id, error=str(exc))
