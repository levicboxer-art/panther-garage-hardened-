import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from("profiles").select("active").eq("id", user.id).single();
  if (!profile?.active) {
    return { supabase, user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { supabase, user, response: null };
}

export async function GET(req: Request) {
  const s = await session();
  if (s.response) return s.response;

  const params = new URL(req.url).searchParams;
  const saleOnly = params.get("category") === "SALE";
  const unreadOnly = params.get("unread") === "true";
  const countOnly = params.get("count") === "true";

  if (countOnly) {
    let query = s.supabase.from("notifications").select("id", { count: "exact", head: true });
    if (saleOnly) query = query.eq("category", "SALE");
    if (unreadOnly) query = query.is("read_at", null);
    const { count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ notifications: [], unread: count || 0 });
  }

  let query = s.supabase.from("notifications")
    .select("id,title,message,category,entity_type,entity_id,read_at,created_at");
  if (saleOnly) query = query.eq("category", "SALE");
  if (unreadOnly) query = query.is("read_at", null);
  const limit = saleOnly ? 100 : 50;
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notifications: data || [], unread: (data || []).filter(item => !item.read_at).length });
}

export async function PATCH(req: Request) {
  const s = await session();
  if (s.response) return s.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let query = s.supabase.from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", s.user!.id);

  if (body.id) {
    query = query.eq("id", body.id);
  } else if (body.mark_all_category === "SALE") {
    query = query.eq("category", "SALE").is("read_at", null);
  } else if (body.mark_all === true) {
    query = query.is("read_at", null);
  } else {
    return NextResponse.json({ error: "Provide a notification id, mark_all_category=SALE, or mark_all=true." }, { status: 400 });
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ message: "Notification updated." });
}
