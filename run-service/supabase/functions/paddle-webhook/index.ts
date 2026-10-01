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
import { verify } from "./verify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PADDLE_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET")!;

const ACTIVE = new Set(["subscription.created", "subscription.activated", "subscription.updated", "subscription.resumed"]);
const INACTIVE = new Set(["subscription.canceled", "subscription.paused", "subscription.past_due"]);

Deno.serve(async (req) => {
  const raw = await req.text();
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (!(await verify(req.headers.get("Paddle-Signature") || "", raw, PADDLE_SECRET)))
    return new Response("bad signature", { status: 401 });

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const type = evt.event_type as string;
  const data = evt.data || {};
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Map the Paddle customer to a PERSEUS user ONLY through custom_data.user_id, which the
  // front end sets at checkout from the signed-in session. No email fallback: an email in a
  // webhook payload is customer-editable and must never grant entitlement to an account.
  const uid = typeof data?.custom_data?.user_id === "string" ? data.custom_data.user_id : null;
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) return new Response("no user_id in custom_data", { status: 202 });

  // Idempotency: record the event id once; a duplicate is acknowledged and ignored.
  const eventId = typeof evt.event_id === "string" ? evt.event_id : null;
  if (!eventId) return new Response("missing event_id", { status: 400 });
  const { error: dupErr } = await sb.from("paddle_events")
    .insert({ event_id: eventId, event_type: type, occurred_at: evt.occurred_at ?? null });
  if (dupErr?.code === "23505") return new Response("duplicate", { status: 200 });
  if (dupErr) return new Response("event log unavailable", { status: 500 }); // Paddle retries

  const status = ACTIVE.has(type) ? (data.status || "active")
    : INACTIVE.has(type) ? (data.status || "canceled") : null;

  if (status) {
    // Out of order delivery guard: never let an older event overwrite newer state.
    const occurred = evt.occurred_at ? new Date(evt.occurred_at).toISOString() : new Date().toISOString();
    const { data: cur } = await sb.from("subscriptions").select("last_event_at")
      .eq("paddle_subscription_id", data.id).maybeSingle();
    if (cur?.last_event_at && new Date(cur.last_event_at) > new Date(occurred))
      return new Response("stale event ignored", { status: 200 });

    await sb.from("subscriptions").upsert({
      user_id: uid,
      paddle_subscription_id: data.id,
      paddle_customer_id: data.customer_id,
      status,
      plan: data.items?.[0]?.price?.product_id ?? data.plan,
      current_period_end: data.current_billing_period?.ends_at ?? null,
      last_event_at: occurred,
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
