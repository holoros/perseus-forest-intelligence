"""pytest for scripts/check_api_integrity.py: exit policy and detection on small fixtures."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check_api_integrity.py"


def run(api, *flags):
    return subprocess.run([sys.executable, str(SCRIPT), str(api), *flags],
                          capture_output=True, text=True)


def make_api(tmp_path, series):
    api = tmp_path / "api"
    (api / "series").mkdir(parents=True)
    for st, body in series.items():
        p = api / "series" / f"{st}.json"
        p.write_text(body if isinstance(body, str) else json.dumps(body))
    return api


def good_state():
    return {"agc_live_total": {"base": [{"model": "fvs_gompit", "pts": [[2020, 10.5], [2030, 12.0]]}]},
            "rd_mean_wtd": {"base": [{"model": "yc_hybrid", "pts": [[2020, 0.45]]}]}}


def test_clean_fixture_passes_and_reports_coverage(tmp_path):
    r = run(make_api(tmp_path, {"ME": good_state()}), "--strict")
    assert r.returncode == 0
    assert "coverage: 1 states" in r.stdout
    assert "PASS" in r.stdout


def test_parse_failure_is_structural_and_fails_strict(tmp_path):
    api = make_api(tmp_path, {"ME": good_state(), "GA": "{not json"})
    assert run(api).returncode == 0                # report only by default
    r = run(api, "--strict")
    assert r.returncode == 1
    assert "JSON parse failure" in r.stdout


def test_null_value_is_structural(tmp_path):
    s = good_state()
    s["agc_live_total"]["base"][0]["pts"].append([2040, None])
    r = run(make_api(tmp_path, {"ME": s}), "--strict")
    assert r.returncode == 1 and "NaN/Inf/null" in r.stdout


def test_nan_token_is_structural(tmp_path):
    body = json.dumps(good_state()).replace("12.0", "NaN")
    r = run(make_api(tmp_path, {"ME": body}), "--strict")
    assert r.returncode == 1


def test_empty_series_is_structural(tmp_path):
    s = good_state()
    s["agc_live_total"]["base"][0]["pts"] = []
    r = run(make_api(tmp_path, {"ME": s}), "--strict")
    assert r.returncode == 1 and "empty series" in r.stdout


def test_range_and_retired_issues_warn_but_do_not_fail_strict(tmp_path):
    s = good_state()
    s["rd_mean_wtd"]["base"][0]["pts"] = [[2020, 2.4]]
    s["agc_live_total"]["base"].append({"model": "cem_wear_nh", "pts": [[2020, 1.0]]})
    r = run(make_api(tmp_path, {"ME": s}), "--strict")
    assert r.returncode == 0
    assert "expect 0–1.6" in r.stdout
    assert "retired wear_nh" in r.stdout
    assert "::warning::" in r.stdout


def test_real_public_api_has_no_structural_corruption():
    r = run(ROOT / "public" / "api", "--strict")
    assert r.returncode == 0, r.stdout[-2000:]
