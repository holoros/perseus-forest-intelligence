"""Tests for build_raster_manifest.py.

Run: python3 -m pytest -q scripts/test_build_raster_manifest.py
"""
import json
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_raster_manifest as brm  # noqa: E402


def _chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def make_png(path, w, h, value=0):
    raw = b"".join(b"\x00" + bytes([value]) * w for _ in range(h))
    data = (brm.PNG_SIG
            + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
            + _chunk(b"IDAT", zlib.compress(raw))
            + _chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(data)


def _setup(tmp_path):
    d = tmp_path / "raster"
    (d / "sub").mkdir(parents=True)
    make_png(str(d / "b_layer.png"), 3, 2)
    make_png(str(d / "sub" / "a_layer.png"), 5, 4, 7)
    (d / "b_layer_bounds.json").write_text("{}")
    return d


def test_build(tmp_path):
    d = _setup(tmp_path)
    assert brm.main(["--dir", str(d)]) == 0
    m = json.loads((d / "manifest.json").read_text())
    assert m["count"] == 2
    assert m["base_url"] is None
    assert [f["path"] for f in m["files"]] == ["b_layer.png", "sub/a_layer.png"]
    assert (m["files"][0]["width"], m["files"][0]["height"]) == (3, 2)
    assert (m["files"][1]["width"], m["files"][1]["height"]) == (5, 4)
    assert m["total_bytes"] == sum(f["bytes"] for f in m["files"])
    assert all(len(f["sha256"]) == 64 for f in m["files"])


def test_check_pass(tmp_path):
    d = _setup(tmp_path)
    brm.main(["--dir", str(d)])
    assert brm.main(["--dir", str(d), "--check"]) == 0


def test_check_fail_on_tampered_file(tmp_path, capsys):
    d = _setup(tmp_path)
    brm.main(["--dir", str(d)])
    make_png(str(d / "b_layer.png"), 3, 2, 255)  # same size, new content
    make_png(str(d / "extra.png"), 1, 1)
    capsys.readouterr()
    assert brm.main(["--dir", str(d), "--check"]) == 1
    out = capsys.readouterr().out
    assert "hash mismatch: b_layer.png" in out
    assert "not in manifest: extra.png" in out
