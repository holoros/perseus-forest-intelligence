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

  // Map the Paddle customer to a PERSEUS user ONLY through custom_data.user_id. No email
  // fallback: an email in a webhook payload is customer-editable and must never grant
  // entitlement. custom_data is still client supplied if checkout opens in the browser, so
  // before launch create the checkout transaction server side (bound to the JWT's user) or
  // sign custom_data; apply_paddle_event already refuses to move a subscription between
  // users and derives tier from all of a user's subscriptions, which limits the damage.
  const uid = typeof data?.custom_data?.user_id === "string" ? data.custom_data.user_id : null;
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) return new Response("no user_id in custom_data", { status: 202 });

  const eventId = typeof evt.event_id === "string" ? evt.event_id : null;
  if (!eventId) return new Response("missing event_id", { status: 400 });
  const occurred = new Date(evt.occurred_at ?? "");
  if (Number.isNaN(occurred.getTime())) return new Response("bad occurred_at", { status: 400 });
  const periodEnd = data.current_billing_period?.ends_at ? new Date(data.current_billing_period.ends_at) : null;
  if (periodEnd && Number.isNaN(periodEnd.getTime())) return new Response("bad period end", { status: 400 });
  if (typeof data.id !== "string" || !data.id) return new Response("missing subscription id", { status: 400 });

  const STATUSES = new Set(["active", "trialing", "past_due", "paused", "canceled"]);
  const raw_status = ACTIVE.has(type) ? (data.status || "active")
    : INACTIVE.has(type) ? (data.status || "canceled") : null;
  const status = raw_status && STATUSES.has(raw_status) ? raw_status : null;

  // One transaction in the database: record the event id, apply it (never older over
  // newer, never moving a subscription to another user), recompute the profile tier from
  // all of the user's subscriptions. Any error rolls back, so Paddle's retry can apply it.
  const { data: outcome, error } = await sb.rpc("apply_paddle_event", {
    p_event_id: eventId, p_event_type: type, p_occurred: occurred.toISOString(), p_user: uid,
    p_sub_id: data.id, p_customer_id: data.customer_id ?? null, p_status: status,
    p_plan: data.items?.[0]?.price?.product_id ?? data.plan ?? null,
    p_period_end: periodEnd ? periodEnd.toISOString() : null,
  });
  if (error) {
    // 42501 = subscription already bound to a different user. Acknowledge (2xx stops
    // Paddle retrying), apply nothing, and surface it in the function logs for review.
    if (error.code === "42501") {
      console.error(`paddle-webhook: user mismatch on ${data.id} (event ${eventId})`);
      return new Response("subscription user mismatch, not applied", { status: 202 });
    }
    return new Response("apply failed", { status: 500 }); // nothing recorded; Paddle retries
  }
  return new Response(String(outcome ?? "ok"), { status: 200 });
});
