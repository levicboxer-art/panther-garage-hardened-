import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitedResponse } from "@/lib/api-security";
import { buildReportCsv, reportWindowFromParams } from "@/lib/report-export";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const allowedParams = new Set(["month", "period"]);
  if ([...params.keys()].some((key) => !allowedParams.has(key)) || params.getAll("month").length > 1 || params.getAll("period").length > 1) {
    return jsonError("Use a calendar month or choose all recorded history.", 400);
  }
  const window = reportWindowFromParams(params);
  if (!window) return jsonError("Choose a valid past/current month or all recorded history.", 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();
  if (profileError || !profile?.active || profile.role !== "BOSS") {
    return jsonError("Only an active Boss can download the full event report.", 403);
  }

  const limit = rateLimit(`report-export:${user.id}`, 5);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter);

  try {
    const csv = await buildReportCsv(createAdminClient(), window);
    return new Response(csv, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${window.filename}"; filename*=UTF-8''${encodeURIComponent(window.filename)}`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_EXPORT_TOO_LARGE") {
      return jsonError("This export is larger than the safe download limit. Select a shorter period and export the remaining months separately.", 413);
    }
    return jsonError("The report could not be prepared. Please try again or choose a shorter period.", 503);
  }
}
