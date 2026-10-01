#!/usr/bin/env python3
"""Fail the build if restricted data could be leaking into the public API.

PERSEUS publishes only aggregated or public products under public/api/. Restricted
inputs (FIA true plot coordinates, JDI ownership, Green Diamond client data, koa
partner data, NCASI evaluation files, any per parcel or per stand proprietary
record) stay on the restricted servers. This check is a tripwire, not a proof: it
looks for the fingerprints such data would carry.

Checks, all hard failures (exit 1):
  1. Field names that signal restricted content (true or actual coordinates,
     parcel or stand identifiers, owner names, server side markers).
  2. Restricted source names anywhere in the file text (JDI, Green Diamond,
     koa partner, NCASI evaluation, _SERVERSIDE, restricted/ or _private/ paths).
  3. Plot level files (a "plots" array with lat/lon in meta.schema) must store
     coordinates at <= 2 decimals and carry meta.coord_note naming them perturbed.
  4. Any JSON that fails to parse (a truncated file could hide anything).

Usage:  python3 scripts/check_restricted_fields.py [dir ...]   (default public/api)
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

RESTRICTED_KEY = re.compile(
    r"(^|_)(true|actual|exact|unfuzz(ed)?|unperturbed|precise|raw)_?(lat|lon|lng|latitude|longitude|coords?|xy)($|_)"
    r"|(^|_)(lat|lon|lng|latitude|longitude|coords?)_?(true|actual|exact|unfuzz(ed)?|unperturbed|precise|raw)($|_)"
    r"|^(parcel|parcel_id|parcel_cn|stand_id|stand_number|owner_name|landowner_name|tax_map|map_lot|apn)$"
    r"|serverside|^_private|restricted",
    re.I,
)
RESTRICTED_TEXT = re.compile(
    r"\bJDI\b|J\.?\s?D\.?\s?Irving|green[\s_-]?diamond|\bGDRC\b|\bkoa[\s_-]?partner"
    r"|ncasi[\s_-]?(eval|evaluation|private)|_SERVERSIDE|/restricted/|/_private/|plot_coords|tree_t2\.csv",
    re.I,
)
MAX_PLOT_DECIMALS = 2


def decimals(v: float) -> int:
    s = repr(float(v))
    if "e" in s or "E" in s:
        return 99
    return len(s.split(".")[1].rstrip("0")) if "." in s else 0


def walk_keys(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield f"{path}.{k}" if path else k, k
            yield from walk_keys(v, f"{path}.{k}" if path else k)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            if isinstance(v, (dict, list)):
                yield from walk_keys(v, f"{path}[{i}]")


def check_plot_file(rel: str, d) -> list[str]:
    out = []
    meta = d.get("meta") if isinstance(d, dict) else None
    plots = d.get("plots") if isinstance(d, dict) else None
    schema = (meta or {}).get("schema") if isinstance(meta, dict) else None
    if not (isinstance(plots, list) and isinstance(schema, list) and "lat" in schema and "lon" in schema):
        return out
    note = str(meta.get("coord_note", ""))
    if "perturb" not in note.lower():
        out.append(f"{rel}: plot level coordinates without meta.coord_note naming them perturbed public values")
    ila, ilo = schema.index("lat"), schema.index("lon")
    worst = 0
    for row in plots:
        for i in (ila, ilo):
            v = row[i] if isinstance(row, list) and len(row) > i else None
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                worst = max(worst, decimals(v))
    if worst > MAX_PLOT_DECIMALS:
        out.append(f"{rel}: plot coordinates stored at {worst} decimals (max {MAX_PLOT_DECIMALS})")
    return out


def scan(root: Path) -> list[str]:
    problems: list[str] = []
    for f in sorted(root.rglob("*")):
        if not f.is_file():
            continue
        rel = str(f)
        if RESTRICTED_KEY.search(f.name) and f.suffix.lower() in {".json", ".csv", ".geojson", ".txt"}:
            problems.append(f"{rel}: restricted marker in file name")
        if f.suffix.lower() not in {".json", ".geojson", ".csv", ".txt", ".md"}:
            continue
        text = f.read_text(encoding="utf-8", errors="replace")
        m = RESTRICTED_TEXT.search(text)
        if m:
            problems.append(f"{rel}: restricted source text {m.group(0)!r}")
        if f.suffix.lower() in {".json", ".geojson"}:
            try:
                d = json.loads(text)
            except Exception as e:  # noqa: BLE001
                problems.append(f"{rel}: JSON parse failure ({e.__class__.__name__})")
                continue
            seen = set()
            for p, k in walk_keys(d):
                if k not in seen and RESTRICTED_KEY.search(k):
                    problems.append(f"{rel}: restricted field name {k!r} at {p}")
                seen.add(k)
            problems.extend(check_plot_file(rel, d))
        elif f.suffix.lower() == ".csv":
            header = text.splitlines()[0] if text else ""
            for k in re.split(r"[,\t;]", header):
                if RESTRICTED_KEY.search(k.strip().strip('"')):
                    problems.append(f"{rel}: restricted CSV column {k.strip()!r}")
    return problems


def main(argv: list[str]) -> int:
    roots = [Path(a) for a in argv if not a.startswith("-")] or [Path("public/api")]
    problems = []
    for r in roots:
        if not r.exists():
            print(f"::error::restricted-field check: {r} does not exist")
            return 1
        problems += scan(r)
    print("=== PERSEUS restricted field check ===")
    for p in problems:
        print(f"::error::{p}")
    if problems:
        print(f"\nFAIL: {len(problems)} restricted data fingerprint(s). Nothing restricted may enter public/.")
        return 1
    print(f"PASS: no restricted fingerprints under {', '.join(map(str, roots))}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
