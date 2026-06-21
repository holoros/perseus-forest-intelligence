"""
Cardinal dispatch — translates a run-spec into an OSC Cardinal SLURM job and
tracks it. Skeleton: the SSH/SLURM calls are outlined but not executed here.

Flow:
  submit(spec, rid)  -> write spec to a per-run dir on Cardinal, sbatch the
                        scenario runner, return the SLURM job id.
  poll(slurm_id)     -> map sacct state to queued|running|complete|failed.
  fetch_result(rid)  -> read the runner's results JSON back from Cardinal.

The scenario runner itself (cardinal/run_scenario.py + submit_scenario.slurm)
reads the spec and runs the selected engines for the AOI under each assumption.
"""
from __future__ import annotations
import json, subprocess, shlex
from typing import Any

CARDINAL = "cardinal"            # ssh host alias (see hpc-cardinal config)
REMOTE_RUNS = "~/perseus_runs"   # per-run working dirs on Cardinal


def _ssh(cmd: str) -> str:
    full = f"ssh -F ~/.ssh/config {CARDINAL} {shlex.quote(cmd)}"
    return subprocess.run(full, shell=True, capture_output=True, text=True).stdout.strip()


def submit(spec: dict[str, Any], rid: str) -> str:
    """Stage the spec on Cardinal and submit the scenario runner. Returns SLURM id."""
    # 1) write spec to ~/perseus_runs/<rid>/spec.json (scp or heredoc)
    # 2) sbatch the runner with the run dir as an argument
    # 3) capture the parsable SLURM id
    #
    # Skeleton (uncomment once the runner is in place on Cardinal):
    # _ssh(f"mkdir -p {REMOTE_RUNS}/{rid}")
    # ... scp spec.json ...
    # sid = _ssh(f"cd {REMOTE_RUNS}/{rid} && sbatch --parsable ~/perseus_run/submit_scenario.slurm {rid}")
    # return sid
    return f"STUB-{rid}"


def poll(slurm_id: str | None) -> str:
    if not slurm_id:
        return "failed"
    # state = _ssh(f"sacct -j {slurm_id} --format=State -n | head -1").strip()
    # return {"COMPLETED": "complete", "FAILED": "failed", "RUNNING": "running"}.get(state, "queued")
    return "complete"  # skeleton


def fetch_result(rid: str, job: dict[str, Any]) -> dict[str, Any]:
    # read ~/perseus_runs/<rid>/result.json back from Cardinal
    # return json.loads(_ssh(f"cat {REMOTE_RUNS}/{rid}/result.json"))
    return {"id": rid, "status": "complete", "note": "skeleton — wire fetch from Cardinal",
            "spec": job.get("spec")}
