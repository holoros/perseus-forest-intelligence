// PERSEUS run-service · Paddle webhook (Supabase Edge Function, Deno)
//
// Receives Paddle Billing webhooks (subscription lifecycle) and mirrors state into
// public.subscriptions + public.profiles.tier. Uses the SERVICE ROLE key so it can
// write past RLS. Verifies the Paddle-Signature header before trusting the payload.
//
// Secrets (set with `supabase secrets set`, never commit):
//   PADDLE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy: supabase functions deploy paddle-webhook --no-verify-jwt
// Then register the function URL as a notification destination in the Paddle dashboard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PADDLE_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET")!;

// Paddle Billing signs with HMAC-SHA256 over `${ts}:${rawBody}`; header form is
// "ts=...;h1=...". Verify before acting. (Reference the current Paddle docs when wiring.)
async function verify(req: Request, raw: string): Promise<boolean> {
  const sig = req.headers.get("Paddle-Signature") || "";
  const parts = Object.fromEntries(sig.split(";").map((p) => p.split("=")));
  if (!parts.ts || !parts.h1) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(PADDLE_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.ts}:${raw}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  return hex.length === parts.h1.length &&
    hex.split("").every((c, i) => c === parts.h1[i]);
}

const ACTIVE = new Set(["subscription.created", "subscription.activated", "subscription.updated", "subscription.resumed"]);
const INACTIVE = new Set(["subscription.canceled", "subscription.paused", "subscription.past_due"]);

Deno.serve(async (req) => {
  const raw = await req.text();
  if (!(await verify(req, raw))) return new Response("bad signature", { status: 401 });

  const evt = JSON.parse(raw);
  const type = evt.event_type as string;
  const data = evt.data || {};
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Map the Paddle customer to a PERSEUS user by email (set custom_data.user_id at
  // checkout for a direct link when available).
  const email = data?.customer?.email || data?.custom_data?.email;
  const userId = data?.custom_data?.user_id;
  let uid = userId;
  if (!uid && email) {
    const { data: prof } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
    uid = prof?.id;
  }
  if (!uid) return new Response("no matching user", { status: 202 }); // accept, nothing to do

  const status = ACTIVE.has(type) ? (data.status || "active")
    : INACTIVE.has(type) ? (data.status || "canceled") : null;

  if (status) {
    await sb.from("subscriptions").upsert({
      user_id: uid,
      paddle_subscription_id: data.id,
      paddle_customer_id: data.customer_id,
      status,
      plan: data.items?.[0]?.price?.product_id ?? data.plan,
      current_period_end: data.current_billing_period?.ends_at ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "paddle_subscription_id" });

    const entitled = status === "active" || status === "trialing";
    await sb.from("profiles").update({
      tier: entitled ? "subscriber" : "free",
      quota_monthly: entitled ? 50 : 0, // plan default; adjust per price tier
      updated_at: new Date().toISOString(),
    }).eq("id", uid);
  }
  return new Response("ok", { status: 200 });
});
