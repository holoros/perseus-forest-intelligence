"""
PERSEUS run service — backend API skeleton.

Endpoints:
  POST /run            submit a scenario run-spec; validates, checks entitlement, enqueues
  GET  /run/{id}       run status
  GET  /run/{id}/result   results when complete

This is a reviewable skeleton. The free tier reads the precompute store (handled
client-side / static). The subscriber tier enqueues an on-demand Cardinal job via
cardinal_dispatch. Auth/entitlement is a stub: wire it to the real account/billing
provider (the team configures payment; this service only checks an entitlement flag).

Run locally:  uvicorn app:app --reload
"""
from __future__ import annotations
import json, uuid, time
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


def check_entitlement(tier: str, user: Optional[str]) -> None:
    """Stub. Subscriber/custom runs require an entitled account. Wire to billing."""
    if tier == "subscriber":
        if not user:
            raise HTTPException(401, "subscriber runs require an account")
        if not _is_entitled(user):
            raise HTTPException(402, "active subscription required")


def _is_entitled(user: str) -> bool:
    # TODO: look up the account's subscription status from the accounts/billing store.
    return True  # skeleton: allow


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
    # Subscriber tier: enqueue an on-demand Cardinal run.
    slurm_id = dispatch.submit(spec, rid)  # returns Cardinal job id (stubbed)
    JOBS[rid] = {"id": rid, "status": "queued", "mode": "ondemand",
                 "slurm_id": slurm_id, "spec": spec, "submitted": time.time()}
    return {"id": rid, "status": "queued", "mode": "ondemand"}


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
