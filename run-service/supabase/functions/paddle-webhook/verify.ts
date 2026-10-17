// PERSEUS run-service · Paddle signature verification (dependency free, unit tested).

// Paddle Billing signs with HMAC-SHA256 over `${ts}:${rawBody}`; header form is
// "ts=<unix seconds>;h1=<hex>" and may carry more than one h1 during secret rotation.
// Verification: (1) parse strictly, (2) reject a timestamp outside a 5 minute window
// (replay protection), (3) compare every h1 in constant time. Event ids are also recorded
// in public.paddle_events so a replay inside the window is acknowledged but not applied.
const MAX_SKEW_S = 300;
const enc = new TextEncoder();

function timingSafeEqualHex(a: string, b: string): boolean {
  // Compare full length regardless of where the first mismatch is; length is not secret.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verify(sigHeader: string, raw: string, secret: string,
                             nowS: number = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!secret) return false;
  let ts = "";
  const h1s: string[] = [];
  for (const part of sigHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "ts") ts = v;
    else if (k === "h1" && /^[0-9a-f]{64}$/i.test(v)) h1s.push(v.toLowerCase());
  }
  if (!/^\d{9,11}$/.test(ts) || h1s.length === 0) return false;
  if (Math.abs(nowS - Number(ts)) > MAX_SKEW_S) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${raw}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  let ok = false;
  for (const h of h1s) ok = timingSafeEqualHex(hex, h) || ok; // no early exit
  return ok;
}
