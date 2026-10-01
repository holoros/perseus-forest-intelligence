#!/usr/bin/env node
// Fails (exit 1) unless every place PERSEUS records its version agrees:
// package.json, package-lock.json, CITATION.cff, README "Deployed version", and the
// newest CHANGELOG heading. package.json is the single source of truth.
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json")).version;              // e.g. 1.38.0
const short = pkg.replace(/\.0$/, "");                               // 1.38
const found = {
  "package.json": pkg,
  "package-lock.json": JSON.parse(read("package-lock.json")).version,
  "CITATION.cff": (read("CITATION.cff").match(/^version:\s*"?([^"\n]+)"?/m) || [])[1],
  "README.md": (read("README.md").match(/Deployed version:\*\*\s*v([\d.]+)/) || [])[1],
  "CHANGELOG.md": (read("CHANGELOG.md").match(/^### v([\d.]+)/m) || [])[1],
};
const ok = (v) => v === pkg || v === short;
const bad = Object.entries(found).filter(([, v]) => !ok(v));
for (const [k, v] of Object.entries(found)) console.log(`${ok(v) ? "ok " : "BAD"} ${k}: ${v}`);
if (bad.length) { console.error(`version mismatch against package.json ${pkg}`); process.exit(1); }
