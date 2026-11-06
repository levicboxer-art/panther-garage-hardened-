import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, rateLimitedResponse, requestKey } from "@/lib/api-security";
import { computeBusinessIntelligence, normaliseWindow } from "@/lib/bi-analytics";
import { computeActivityLedger } from "@/lib/activity-ledger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { allowed, retryAfter } = rateLimit(requestKey(req, "bi"), 60);
  if (!allowed) return rateLimitedResponse(retryAfter);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();
  // Business intelligence exposes margins, costs and customer economics: BOSS only.
  if (profile?.role !== "BOSS" || !profile?.active)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const days = normaliseWindow(url.searchParams.get("days"));
  // BI aggregation and the activity/transparency ledger run side by side.
  const [bi, ledger] = await Promise.all([
    computeBusinessIntelligence(supabase, days),
    computeActivityLedger(supabase, days),
  ]);
  if (!bi.ok) return NextResponse.json({ error: bi.error }, { status: 400 });
  if (!ledger.ok) return NextResponse.json({ error: ledger.error }, { status: 400 });
  return NextResponse.json({ ...bi.data, activity: ledger.data });
}
