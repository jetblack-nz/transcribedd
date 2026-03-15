from __future__ import annotations

import structlog
from supabase import AsyncClient, create_async_client

from .config import Config

log = structlog.get_logger()


async def init_client(config: Config) -> AsyncClient:
    return await create_async_client(
        config.supabase_url,
        config.supabase_service_role_key,
    )


async def reset_own_stuck_jobs(client: AsyncClient, worker_id: str) -> int:
    """On startup, reset any jobs this worker left in 'processing' back to 'pending'."""
    result = await (
        client.table("jobs")
        .update({"status": "pending", "worker_id": None, "started_at": None})
        .eq("status", "processing")
        .eq("worker_id", worker_id)
        .execute()
    )
    return len(result.data) if result.data else 0


async def claim_next_job(client: AsyncClient, worker_id: str) -> dict | None:
    result = await client.rpc(
        "claim_next_job", {"p_worker_id": worker_id}
    ).execute()
    jobs = result.data
    return jobs[0] if jobs else None


async def complete_job(
    client: AsyncClient, job_id: str, transcript_path: str, worker_id: str
) -> None:
    await client.rpc(
        "complete_job",
        {
            "p_job_id": job_id,
            "p_transcript_path": transcript_path,
            "p_worker_id": worker_id,
        },
    ).execute()


async def fail_job(
    client: AsyncClient, job_id: str, error_message: str, worker_id: str
) -> None:
    try:
        await client.rpc(
            "fail_job",
            {
                "p_job_id": job_id,
                "p_error_message": error_message[:1000],
                "p_worker_id": worker_id,
            },
        ).execute()
    except Exception as e:
        log.error("fail_job.rpc_error", job_id=job_id, error=str(e))


async def upload_transcript(
    client: AsyncClient, user_id: str, job_id: str, content: str
) -> str:
    path = f"{user_id.lower()}/{job_id.lower()}.txt"
    data = content.encode("utf-8")
    await client.storage.from_("transcripts").upload(
        path, data, {"content-type": "text/plain"}
    )
    return path
