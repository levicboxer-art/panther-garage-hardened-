import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  dbErrorResponse,
  invalidBodyResponse,
  rateLimit,
  rateLimitedResponse,
  readJson,
  requestKey,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";

const TABLE = "shift_reports";
const text = (v: unknown, max = 2000) => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > max ? null : s;
};
const intUnits = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : null;
};
const dateOnly = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;

export async function GET(req: Request) {
  const { allowed, retryAfter } = rateLimit(requestKey(req, "shift-reports"), 60);
  if (!allowed) return rateLimitedResponse(retryAfter);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,full_name,active")
    .eq("id", user.id)
    .single();
  if (!profile?.active) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  let query = supabase
    .from(TABLE)
    .select("id,employee_id,employee_name,report_date,opening_stock,closing_stock,comments,recommendations,challenges,solution,created_at,updated_at")
    .order("report_date", { ascending: false })
    .limit(400);

  if (profile.role === "BOSS") {
    const emp = url.searchParams.get("employee_id");
    if (emp) query = query.eq("employee_id", emp);
  } else {
    // RLS already scopes reads, but filter server-side so responses are explicit.
    query = query.eq("employee_id", user.id);
  }

  const { data, error } = await query;
  if (error) return dbErrorResponse();
  return NextResponse.json({ reports: data || [], role: profile.role });
}

export async function POST(req: Request) {
  const { allowed, retryAfter } = rateLimit(requestKey(req, "shift-reports-write"), 20);
  if (!allowed) return rateLimitedResponse(retryAfter);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,full_name,active")
    .eq("id", user.id)
    .single();
  if (!profile?.active) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req, 32 * 1024);
  } catch {
    return invalidBodyResponse(null);
  }

  const reportDate = dateOnly(body.report_date);
  const opening = intUnits(body.opening_stock);
  const closing = intUnits(body.closing_stock);
  const comments = text(body.comments);
  const recommendations = text(body.recommendations);
  const challenges = text(body.challenges);
  const solution = text(body.solution);
  if (!reportDate || opening === null || closing === null)
    return NextResponse.json({ error: "Report needs a valid date and whole-number stock counts." }, { status: 400 });
  if ([comments, recommendations, challenges, solution].some((v) => v === null))
    return NextResponse.json({ error: "Text fields are required and must stay under 2000 characters." }, { status: 400 });
  if (!comments && !recommendations && !challenges && !solution && opening === closing)
    return NextResponse.json({ error: "Add at least a comment or a stock change — empty reports are not useful." }, { status: 400 });

  const row = {
    employee_id: user.id,
    employee_name: profile.full_name || "Staff member",
    report_date: reportDate,
    opening_stock: opening,
    closing_stock: closing,
    comments,
    recommendations,
    challenges,
    solution,
    updated_at: new Date().toISOString(),
  };

  // One report per employee per day: same-day submissions amend instead of duplicate.
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "employee_id,report_date" })
    .select()
    .single();
  if (error) return dbErrorResponse();
  return NextResponse.json({ report: data }, { status: 201 });
}
