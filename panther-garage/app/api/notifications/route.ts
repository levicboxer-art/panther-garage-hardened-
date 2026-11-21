import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse, invalidBodyResponse, isSameOriginRequest, rateLimit, readJson, rateLimitedResponse } from "@/lib/api-security";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function activeStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE }) };
  const { data: profile, error } = await supabase.from("profiles").select("active").eq("id", user.id).single();
  if (error || !profile?.active) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE }) };
  return { supabase, userId: user.id, response: null };
}

export async function GET(request: Request) {
  const session = await activeStaff();
  if (session.response) return session.response;
  const { supabase, userId } = session;
  const limit = rateLimit(`notifications-read:${userId}`, 120);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter);
  const params = new URL(request.url).searchParams;
  const category = params.get("category");
  const saleOnly = category === "SALE";
  const unreadOnly = params.get("unread") === "true";
  const countOnly = params.get("count") === "true";
  if (category && !saleOnly) return NextResponse.json({ error: "Unsupported category filter." }, { status: 400, headers: NO_STORE });
  if (countOnly) {
    let query = supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId);
    if (saleOnly) query = query.eq("category", "SALE");
    if (unreadOnly) query = query.is("read_at", null);
    const { count, error } = await query;
    if (error) return dbErrorResponse(503);
    return NextResponse.json({ notifications: [], unread: count || 0 }, { headers: NO_STORE });
  }
  let query = supabase.from("notifications")
    .select("id,title,message,category,entity_type,entity_id,read_at,created_at")
    .eq("recipient_id", userId);
  if (saleOnly) query = query.eq("category", "SALE");
  if (unreadOnly) query = query.is("read_at", null);
  const [{ data, error }, unreadResult] = await Promise.all([
    query.order("created_at", { ascending: false }).limit(saleOnly ? 100 : 50),
    supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("recipient_id", userId).is("read_at", null),
  ]);
  if (error || unreadResult.error) return dbErrorResponse(503);
  return NextResponse.json({ notifications: data || [], unread: unreadResult.count || 0 }, { headers: NO_STORE });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const session = await activeStaff();
  if (session.response) return session.response;
  const { supabase, userId } = session;
  const limit = rateLimit(`notifications-update:${userId}`, 30);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter);
  let body: unknown;
  try { body = await readJson(request, 2_048); } catch (error) { return invalidBodyResponse(error); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: NO_STORE });
  }
  const input = body as Record<string, unknown>;
  const hasValidId = typeof input.id === "string" && UUID_PATTERN.test(input.id);
  const markAll = input.mark_all === true && input.id === undefined && input.mark_all_category === undefined;
  const markSale = input.mark_all_category === "SALE" && input.id === undefined && input.mark_all === undefined;
  const validKeys = Object.keys(input).every((key) => ["id", "mark_all", "mark_all_category"].includes(key));
  if (!validKeys || (!hasValidId && !markAll && !markSale)) {
    return NextResponse.json({ error: "Provide a valid notification id, mark_all=true, or mark_all_category=SALE." }, { status: 400, headers: NO_STORE });
  }
  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId).is("read_at", null);
  if (hasValidId) query = query.eq("id", input.id as string);
  else if (markSale) query = query.eq("category", "SALE");
  const { error } = await query;
  if (error) return dbErrorResponse(503);
  return NextResponse.json({ message: "Notification updated." }, { headers: NO_STORE });
}
