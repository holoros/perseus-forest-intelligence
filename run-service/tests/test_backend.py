"""pytest for the run-service backend skeleton (no network, no ssh)."""
import importlib
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

SECRET = "x" * 40


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PERSEUS_DISPATCH_SECRET", SECRET)
    import app as app_mod
    importlib.reload(app_mod)
    return TestClient(app_mod.app)


SPEC = {"aoi": {"state": "ME"}, "models": ["fvs_gompit"], "assumptions": {}}


def test_free_tier_resolves_precomputed(client):
    r = client.post("/run", json={**SPEC, "tier": "free"})
    assert r.status_code == 200 and r.json()["mode"] == "precomputed"


def test_public_run_refuses_subscriber_even_with_user_header(client):
    r = client.post("/run", json={**SPEC, "tier": "subscriber", "user": "someone"},
                    headers={"x-user": "someone"})
    assert r.status_code == 403


def test_is_entitled_fails_closed():
    import app as app_mod
    assert app_mod._is_entitled("anyone") is False


@pytest.mark.parametrize("key", [None, "", "x" * 39, "y" * 40, SECRET[:8]])
def test_internal_dispatch_rejects_bad_keys(client, key):
    headers = {} if key is None else {"x-internal-key": key}
    r = client.post("/internal/dispatch", json={"run_id": "abcdef1234", "spec": SPEC}, headers=headers)
    assert r.status_code == 401


def test_internal_dispatch_accepts_secret(client):
    r = client.post("/internal/dispatch", json={"run_id": "abcdef1234", "spec": SPEC},
                    headers={"x-internal-key": SECRET})
    assert r.status_code == 200 and r.json()["status"] == "queued"


def test_internal_dispatch_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("PERSEUS_DISPATCH_SECRET", raising=False)
    import app as app_mod
    importlib.reload(app_mod)
    c = TestClient(app_mod.app)
    r = c.post("/internal/dispatch", json={"run_id": "abcdef1234", "spec": SPEC},
               headers={"x-internal-key": ""})
    assert r.status_code == 503


def test_short_secret_is_treated_as_unset(monkeypatch):
    monkeypatch.setenv("PERSEUS_DISPATCH_SECRET", "short")
    import app as app_mod
    importlib.reload(app_mod)
    c = TestClient(app_mod.app)
    r = c.post("/internal/dispatch", json={"run_id": "abcdef1234", "spec": SPEC},
               headers={"x-internal-key": "short"})
    assert r.status_code == 503


@pytest.mark.parametrize("rid", ["../etc", "a;rm -rf", "short", "$(id)xxxxx", "a b c d e f"])
def test_safe_run_id_rejects_injection(rid):
    import cardinal_dispatch as d
    with pytest.raises(ValueError):
        d.safe_run_id(rid)


def test_ssh_uses_argv_without_shell(monkeypatch):
    import cardinal_dispatch as d
    seen = {}

    def fake_run(argv, **kw):
        seen["argv"], seen["kw"] = argv, kw
        return subprocess.CompletedProcess(argv, 0, stdout="ok\n", stderr="")

    monkeypatch.setattr(d.subprocess, "run", fake_run)
    assert d._ssh("echo hi; touch /tmp/pwned") == "ok"
    assert isinstance(seen["argv"], list)
    assert seen["kw"].get("shell") is False
    assert seen["argv"][-1] == "echo hi; touch /tmp/pwned"  # one argv element, not split locally


def test_no_shell_true_in_backend():
    for f in BACKEND.glob("*.py"):
        assert "shell=True" not in f.read_text(), f


def test_internal_dispatch_bad_run_id_is_400(client):
    r = client.post("/internal/dispatch", json={"run_id": "../../etc", "spec": SPEC},
                    headers={"x-internal-key": SECRET})
    assert r.status_code == 400
