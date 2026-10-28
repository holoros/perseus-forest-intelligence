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
import json, os, re, subprocess, shlex
from typing import Any

# Compute host is configurable; Phase 1 moves the default to firebreather with Cardinal
# reserved for national ensembles. No host names or credentials are hard coded beyond aliases.
CARDINAL = os.environ.get("PERSEUS_COMPUTE_HOST", "cardinal")   # ssh host alias
SSH_CONFIG = os.path.expanduser(os.environ.get("PERSEUS_SSH_CONFIG", "~/.ssh/config"))
REMOTE_RUNS = "~/perseus_runs"   # per-run working dirs on the compute host
_RUN_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_HOST = re.compile(r"^[A-Za-z0-9._-]+$")


def safe_run_id(rid: str) -> str:
    """Run ids become remote path components; allow only a strict character set."""
    if not isinstance(rid, str) or not _RUN_ID.match(rid):
        raise ValueError("invalid run id")
    return rid


def _ssh(cmd: str, timeout: int = 60) -> str:
    """Run one remote command over ssh WITHOUT a local shell.

    The argument vector goes straight to execve, so nothing in cmd is interpreted locally.
    The remote side still runs cmd through the login shell, so callers must build cmd only
    from constants and values passed through safe_run_id or shlex.quote.
    """
    if not _HOST.match(CARDINAL):
        raise ValueError("invalid compute host alias")
    argv = ["ssh", "-F", SSH_CONFIG, "-o", "BatchMode=yes", "--", CARDINAL, cmd]
    res = subprocess.run(argv, shell=False, capture_output=True, text=True,
                         timeout=timeout, check=False)
    return res.stdout.strip()


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
