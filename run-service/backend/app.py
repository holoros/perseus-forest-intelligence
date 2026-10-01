"""
PERSEUS run service — backend API skeleton.

Endpoints:
  POST /run            free-tier request against the precompute store (no compute)
  POST /internal/dispatch   subscriber run handed over by the submit-run edge function,
                       authenticated with the PERSEUS_DISPATCH_SECRET shared secret
  GET  /run/{id}       run status
  GET  /run/{id}/result   results when complete

This is a reviewable skeleton. The free tier reads the precompute store (handled
client-side / static). The subscriber tier enqueues an on-demand Cardinal job via
cardinal_dispatch. Entitlement is decided in the database (RLS on public.runs) by the
submit-run edge function; this service trusts only callers that present the dedicated
dispatch secret and fails closed when the secret is unset or entitlement is unknown.

Run locally:  uvicorn app:app --reload
"""
from __future__ import annotations
import hmac, json, os, uuid, time
from pathlib import Path
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Any, Optional

import cardinal_dispatch as dispatch

app = FastAPI(title="PERSEUS run service", version="0.1.0")

# In-memory job registry for the skeleton; replace with a real queue + results store.
JOBS: dict[str, dict[str, Any]] = {}
SCHEMA = json.loads((Path(__file__).parent.parent / "run_spec.schema.json").read_text())


class RunRequest(BaseModel):
    aoi: dict
    models: list[str]
    assumptions: dict
    outputs: list[str] | None = None
    tier: str = "free"
    user: Optional[str] = None


class DispatchRequest(BaseModel):
    run_id: str
    spec: dict


MIN_SECRET_LEN = 32


def _dispatch_secret() -> str:
    return os.environ.get("PERSEUS_DISPATCH_SECRET", "")


def verify_internal_key(presented: Optional[str]) -> None:
    """Constant time check of the X-Internal-Key header against the dedicated secret.

    Fails closed: an unset or short secret rejects every call rather than accepting any.
    """
    secret = _dispatch_secret()
    if len(secret) < MIN_SECRET_LEN:
        raise HTTPException(503, "dispatch secret not configured")
    if not presented or not hmac.compare_digest(presented.encode(), secret.encode()):
        raise HTTPException(401, "invalid internal key")


def check_entitlement(tier: str, user: Optional[str]) -> None:
    """Subscriber runs never enter through the public /run endpoint.

    A client supplied user id or X-User header is not proof of identity, so the public
    endpoint serves the free tier only. Subscriber runs arrive via /internal/dispatch after
    the database entitlement gate in submit-run.
    """
    if tier != "free":
        raise HTTPException(403, "subscriber runs are submitted through the authenticated submit-run function")


def _is_entitled(user: str) -> bool:
    """Fail closed. Entitlement lives in Supabase (subscriptions plus RLS); this backend has
    no trusted view of it, so it never grants entitlement on its own."""
    return False


@app.post("/run")
def submit_run(req: RunRequest, x_user: Optional[str] = Header(default=None)):
    user = req.user or x_user
    check_entitlement(req.tier, user)
    rid = uuid.uuid4().hex[:12]
    spec = req.model_dump()
    spec["user"] = user
    # Free tier: answer from the precompute store (client usually does this directly).
    if req.tier == "free":
        JOBS[rid] = {"id": rid, "status": "complete", "mode": "precomputed",
                     "spec": spec, "submitted": time.time(),
                     "note": "free tier resolves against the precompute store"}
        return {"id": rid, "status": "complete", "mode": "precomputed"}
    raise HTTPException(403, "unsupported tier")  # unreachable after check_entitlement


@app.post("/internal/dispatch")
def internal_dispatch(req: DispatchRequest, x_internal_key: Optional[str] = Header(default=None)):
    """Subscriber run from the submit-run edge function (already entitlement gated)."""
    verify_internal_key(x_internal_key)
    rid = dispatch.safe_run_id(req.run_id)
    job_id = dispatch.submit(req.spec, rid)  # returns compute job id (stubbed)
    JOBS[rid] = {"id": rid, "status": "queued", "mode": "ondemand",
                 "slurm_id": job_id, "spec": req.spec, "submitted": time.time()}
    return {"id": rid, "status": "queued", "mode": "ondemand", "job_id": job_id}


@app.get("/run/{rid}")
def run_status(rid: str):
    job = JOBS.get(rid)
    if not job:
        raise HTTPException(404, "unknown run")
    if job.get("mode") == "ondemand" and job["status"] not in ("complete", "failed"):
        job["status"] = dispatch.poll(job.get("slurm_id"))  # stubbed
    return {"id": rid, "status": job["status"], "mode": job.get("mode")}


@app.get("/run/{rid}/result")
def run_result(rid: str):
    job = JOBS.get(rid)
    if not job:
        raise HTTPException(404, "unknown run")
    if job["status"] != "complete":
        raise HTTPException(409, f"run not complete (status={job['status']})")
    return dispatch.fetch_result(rid, job)  # stubbed for skeleton
