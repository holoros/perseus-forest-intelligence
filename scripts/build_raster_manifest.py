#!/usr/bin/env python3
"""Build or check public/raster/manifest.json for the PNG raster overlays.

The manifest lists every PNG under the raster directory with its path
(relative to that directory), size in bytes, sha256, and pixel width and
height read from the PNG IHDR chunk. It is the source of truth once the PNGs
move to object storage (see docs/raster_storage.md).

Usage:
    python3 scripts/build_raster_manifest.py            # write manifest
    python3 scripts/build_raster_manifest.py --check    # exit 1 on drift

Python 3.9 compatible, standard library only.
"""
import argparse
import datetime
import hashlib
import json
import os
import struct
import sys
from typing import Dict, List, Optional, Tuple

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DIR = os.path.join(REPO_ROOT, "public", "raster")
MANIFEST_NAME = "manifest.json"
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def png_size(path):
    # type: (str) -> Tuple[int, int]
    """Return (width, height) from the IHDR chunk, which must come first."""
    with open(path, "rb") as fh:
        head = fh.read(24)
    if len(head) < 24 or head[:8] != PNG_SIG or head[12:16] != b"IHDR":
        raise ValueError("not a valid PNG: %s" % path)
    width, height = struct.unpack(">II", head[16:24])
    return int(width), int(height)


def sha256_file(path):
    # type: (str) -> str
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def scan(raster_dir):
    # type: (str) -> List[Dict]
    entries = []
    for root, dirs, files in os.walk(raster_dir):
        dirs.sort()
        for name in files:
            if not name.lower().endswith(".png"):
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, raster_dir).replace(os.sep, "/")
            w, h = png_size(full)
            entries.append({
                "path": rel,
                "bytes": os.path.getsize(full),
                "sha256": sha256_file(full),
                "width": w,
                "height": h,
            })
    entries.sort(key=lambda e: e["path"])
    return entries


def build(raster_dir, base_url=None):
    # type: (str, Optional[str]) -> Dict
    files = scan(raster_dir)
    return {
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "count": len(files),
        "total_bytes": sum(e["bytes"] for e in files),
        "base_url": base_url,
        "files": files,
    }


def write_manifest(raster_dir, manifest):
    # type: (str, Dict) -> str
    out = os.path.join(raster_dir, MANIFEST_NAME)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1, sort_keys=False)
        fh.write("\n")
    return out


def diff(manifest, raster_dir):
    # type: (Dict, str) -> List[str]
    """Return human readable differences between a manifest and the disk."""
    problems = []
    listed = {e["path"]: e for e in manifest.get("files", [])}
    actual = {e["path"]: e for e in scan(raster_dir)}
    for p in sorted(set(listed) - set(actual)):
        problems.append("missing on disk: %s" % p)
    for p in sorted(set(actual) - set(listed)):
        problems.append("not in manifest: %s" % p)
    for p in sorted(set(listed) & set(actual)):
        a, b = listed[p], actual[p]
        if a.get("bytes") != b["bytes"]:
            problems.append("size mismatch: %s (manifest %s, disk %s)"
                            % (p, a.get("bytes"), b["bytes"]))
        if a.get("sha256") != b["sha256"]:
            problems.append("hash mismatch: %s" % p)
        if (a.get("width"), a.get("height")) != (b["width"], b["height"]):
            problems.append("dimension mismatch: %s" % p)
    if manifest.get("count") != len(listed):
        problems.append("header count %s != %d entries"
                        % (manifest.get("count"), len(listed)))
    total = sum(e.get("bytes", 0) for e in listed.values())
    if manifest.get("total_bytes") != total:
        problems.append("header total_bytes %s != %d"
                        % (manifest.get("total_bytes"), total))
    return problems


def main(argv=None):
    # type: (Optional[List[str]]) -> int
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dir", default=DEFAULT_DIR,
                    help="raster directory (default: public/raster)")
    ap.add_argument("--check", action="store_true",
                    help="verify the existing manifest; exit 1 on any difference")
    ap.add_argument("--base-url", default=None,
                    help="value for the base_url header field (default null)")
    args = ap.parse_args(argv)

    path = os.path.join(args.dir, MANIFEST_NAME)
    if args.check:
        if not os.path.exists(path):
            print("manifest not found: %s" % path)
            return 1
        with open(path, encoding="utf-8") as fh:
            manifest = json.load(fh)
        problems = diff(manifest, args.dir)
        if problems:
            print("raster manifest is out of date (%d difference(s)):" % len(problems))
            for p in problems:
                print("  " + p)
            print("rerun: python3 scripts/build_raster_manifest.py")
            return 1
        print("raster manifest OK: %d files, %d bytes"
              % (manifest["count"], manifest["total_bytes"]))
        return 0

    base_url = args.base_url
    if base_url is None and os.path.exists(path):
        # keep a previously recorded base_url across rebuilds
        try:
            with open(path, encoding="utf-8") as fh:
                base_url = json.load(fh).get("base_url")
        except (ValueError, OSError):
            base_url = None
    manifest = build(args.dir, base_url)
    out = write_manifest(args.dir, manifest)
    print("wrote %s: %d files, %d bytes" % (out, manifest["count"], manifest["total_bytes"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
