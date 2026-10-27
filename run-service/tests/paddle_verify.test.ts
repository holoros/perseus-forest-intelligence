// Run: node --experimental-strip-types --test run-service/tests/paddle_verify.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verify } from "../supabase/functions/paddle-webhook/verify.ts";

const SECRET = "pdl_ntfset_test_secret_value_0123456789";
const body = JSON.stringify({ event_id: "evt_1", event_type: "subscription.activated" });
const now = 1790000000;
const sign = (ts: number, raw: string, secret = SECRET) =>
  createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex");

test("accepts a valid fresh signature", async () => {
  assert.equal(await verify(`ts=${now};h1=${sign(now, body)}`, body, SECRET, now), true);
});
test("accepts when any of several h1 values matches (secret rotation)", async () => {
  const hdr = `ts=${now};h1=${"0".repeat(64)};h1=${sign(now, body)}`;
  assert.equal(await verify(hdr, body, SECRET, now), true);
});
test("rejects a tampered body", async () => {
  assert.equal(await verify(`ts=${now};h1=${sign(now, body)}`, body + " ", SECRET, now), false);
});
test("rejects a replay outside the 5 minute window", async () => {
  const old = now - 301;
  assert.equal(await verify(`ts=${old};h1=${sign(old, body)}`, body, SECRET, now), false);
});
test("rejects a timestamp from the future beyond tolerance", async () => {
  const fut = now + 301;
  assert.equal(await verify(`ts=${fut};h1=${sign(fut, body)}`, body, SECRET, now), false);
});
test("rejects the wrong secret, a missing ts, a malformed h1, and an empty secret", async () => {
  assert.equal(await verify(`ts=${now};h1=${sign(now, body, "other")}`, body, SECRET, now), false);
  assert.equal(await verify(`h1=${sign(now, body)}`, body, SECRET, now), false);
  assert.equal(await verify(`ts=${now};h1=abc`, body, SECRET, now), false);
  assert.equal(await verify(`ts=${now};h1=${sign(now, body, "")}`, body, "", now), false);
});
