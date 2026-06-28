// PERSEUS run-service · submit-run (Supabase Edge Function, Deno)
//
// The subscriber "Submit custom run to Cardinal" path. Flow:
//   1. Authenticate the caller (JWT from the browser; RLS still applies).
//   2. Insert a run row AS THE USER (anon/JWT client) so the RLS entitlement policy
//      (active subscription AND under monthly quota) is the gate -- no app-side tier check.
//   3. With the service role, hand the run-spec to the Cardinal dispatcher and record
//      the SLURM job id; increment the user's monthly quota.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          CARDINAL_DISPATCH_URL (the run-service backend that owns the SSH/SLURM keys).
//
// Deploy: supabase functions deploy submit-run

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DISPATCH = Deno.env.get("CARDINAL_DISPATCH_URL")!; // backend/cardinal_dispatch endpoint

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const jwt = req.headers.get("Authorization") || "";
  if (!jwt.startsWith("Bearer ")) return new Response("unauthorized", { status: 401 });

  const spec = await req.json().catch(() => null);
  if (!spec || !spec.aoi || !spec.models) return new Response("invalid run-spec", { status: 400 });

  // As-the-user client: RLS decides whether this insert is allowed (the tier gate).
  const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: jwt } } });
  const { data: run, error } = await asUser
    .from("runs")
    .insert({ spec, tier: "subscriber", status: "queued" })
    .select("id, user_id")
    .single();
  if (error) {
    // RLS rejection = not entitled or over quota.
    return new Response(JSON.stringify({ error: "not_entitled_or_over_quota", detail: error.message }),
      { status: 402, headers: { "content-type": "application/json" } });
  }

  // Service-role from here: dispatch to Cardinal and record the job id + quota.
  const svc = createClient(URL_, SERVICE);
  try {
    const r = await fetch(DISPATCH, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": SERVICE.slice(0, 8) },
      body: JSON.stringify({ run_id: run.id, spec }),
    });
    const j = await r.json();
    await svc.from("runs").update({
      status: "dispatched", cardinal_job_id: j.job_id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", run.id);
    await svc.rpc("increment_run_quota", { p_user: run.user_id });
    return new Response(JSON.stringify({ run_id: run.id, status: "dispatched", job_id: j.job_id }),
      { status: 202, headers: { "content-type": "application/json" } });
  } catch (e) {
    await svc.from("runs").update({ status: "failed", error: String(e) }).eq("id", run.id);
    return new Response(JSON.stringify({ run_id: run.id, error: "dispatch_failed" }), { status: 502 });
  }
});
