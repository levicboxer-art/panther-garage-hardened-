import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, rateLimitedResponse, requestKey } from "@/lib/api-security";
import { buildBusinessReport, normaliseReportWindow, REPORT_CATEGORIES, type ReportCategory } from "@/lib/business-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

function error(message: string, status: number) { return NextResponse.json({ error: message }, { status, headers }); }

export async function GET(request: Request) {
  const limited = rateLimit(requestKey(request, "business-reports"), 30);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return error("Unauthorized", 401);
  const { data: profile } = await supabase.from("profiles").select("role,active").eq("id", user.id).single();
  if (!profile?.active || profile.role !== "BOSS") return error("Only an active Boss can access owner-level reports.", 403);

  const params = new URL(request.url).searchParams;
  const window = normaliseReportWindow(params.get("from"), params.get("to"));
  const category = (params.get("category") || "complete") as ReportCategory;
  if (!window) return error("Choose a valid start and end date.", 400);
  if (!REPORT_CATEGORIES.includes(category)) return error("Choose a valid report category.", 400);
  try {
    return NextResponse.json(await buildBusinessReport(supabase, window, category), { headers });
  } catch (err) {
    console.error("Business report failed:", err instanceof Error ? err.message : err);
    return error("The report could not be calculated from the recorded PGMS data.", 503);
  }
}
