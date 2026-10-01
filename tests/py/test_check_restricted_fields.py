"""pytest for scripts/check_restricted_fields.py, the public/api restricted data tripwire."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check_restricted_fields.py"


def run(*dirs):
    return subprocess.run([sys.executable, str(SCRIPT), *map(str, dirs)], capture_output=True, text=True)


def write(d, name, obj):
    d.mkdir(parents=True, exist_ok=True)
    p = d / name
    p.write_text(obj if isinstance(obj, str) else json.dumps(obj))
    return p


def plots(lat=44.12, lon=-69.45, note="Public FIADB coordinates, perturbed and swapped."):
    return {"meta": {"schema": ["lat", "lon", "year"], "coord_note": note}, "plots": [[lat, lon, 2020]]}


def test_real_public_tree_passes():
    r = run(ROOT / "public", ROOT / "docs")
    assert r.returncode == 0, r.stdout[-2000:]


def test_clean_fixture_passes(tmp_path):
    write(tmp_path, "ok.json", {"county": [{"fips": "23019", "lat": 45.4, "lon": -68.6, "agc": 12.3}]})
    write(tmp_path / "fia_plots", "ME.json", plots())
    assert run(tmp_path).returncode == 0


@pytest.mark.parametrize("key", ["true_lat", "lat_true", "actual_lon", "LON_ACTUAL", "unfuzzed_coords",
                                 "parcel_id", "stand_id", "owner_name", "landowner_name", "x_serverside"])
def test_restricted_field_names_fail(tmp_path, key):
    write(tmp_path, "leak.json", {"rows": [{key: 1}]})
    r = run(tmp_path)
    assert r.returncode == 1 and key in r.stdout


@pytest.mark.parametrize("text", ["JDI ownership", "J.D. Irving", "Green Diamond", "green_diamond",
                                  "koa partner", "NCASI evaluation", "x_SERVERSIDE", "/restricted/fia"])
def test_restricted_source_text_fails(tmp_path, text):
    write(tmp_path, "note.json", {"source": text})
    assert run(tmp_path).returncode == 1


def test_plot_coordinates_over_two_decimals_fail(tmp_path):
    write(tmp_path / "fia_plots", "ME.json", plots(lat=44.1234))
    r = run(tmp_path)
    assert r.returncode == 1 and "4 decimals" in r.stdout


def test_plot_file_without_perturbation_note_fails(tmp_path):
    write(tmp_path / "fia_plots", "ME.json", plots(note=""))
    assert run(tmp_path).returncode == 1


def test_csv_header_and_bad_json_fail(tmp_path):
    write(tmp_path, "a.csv", "plt_cn,true_lat,true_lon\n1,44.1,-69.2\n")
    assert run(tmp_path).returncode == 1
    (tmp_path / "a.csv").unlink()
    write(tmp_path, "b.json", '{"truncated": ')
    assert run(tmp_path).returncode == 1


def test_lookalike_words_do_not_trip(tmp_path):
    write(tmp_path, "ok.json", {"note": "longitude of the ecoregion centroid", "standing_value_musd": 3,
                                "owner": "Private", "koala": 1, "lat": 44.5})
    assert run(tmp_path).returncode == 0


def test_missing_dir_fails(tmp_path):
    assert run(tmp_path / "nope").returncode == 1
