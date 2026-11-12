import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, invalidBodyResponse, readJson } from "@/lib/api-security";
import { flushBossAlertEmail } from "@/lib/alert-delivery";

async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("id,full_name,role,active").eq("id", user.id).single();
  if (!profile?.active) return { supabase, user: null, profile: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { supabase, user, profile, response: null };
}

function validId(value: unknown) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export async function GET(request: Request) {
  const s = await session();
  if (s.response) return s.response;
  const url = new URL(request.url);
  const peer = url.searchParams.get("peer");
  let admin;
  try { admin = createAdminClient(); } catch { return dbErrorResponse(503); }
  const contactsQuery = s.profile!.role === "BOSS"
    ? admin.from("profiles").select("id,full_name,role,active").eq("role", "EMPLOYEE").eq("active", true).order("full_name")
    : admin.from("profiles").select("id,full_name,role,active").eq("role", "BOSS").eq("active", true).order("full_name");
  const { data: contacts, error: contactsError } = await contactsQuery;
  if (contactsError) return dbErrorResponse(503);
  if (!peer) return NextResponse.json({ contacts: contacts || [], messages: [] });
  if (!validId(peer) || !contacts?.some((contact) => contact.id === peer)) {
    return NextResponse.json({ error: "Choose an active staff contact." }, { status: 400 });
  }
  const { data: messages, error } = await admin
    .from("staff_messages")
    .select("id,sender_id,recipient_id,body,read_at,created_at")
    .or(`and(sender_id.eq.${s.user!.id},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${s.user!.id})`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return dbErrorResponse(503);
  return NextResponse.json({ contacts: contacts || [], messages: (messages || []).reverse() });
}

export async function POST(request: Request) {
  const s = await session();
  if (s.response) return s.response;
  let body: any;
  try { body = await readJson(request, 8 * 1024); } catch (error) { return invalidBodyResponse(error); }
  const recipientId = String(body.recipient_id || "");
  const message = typeof body.body === "string" ? body.body.trim() : "";
  if (!validId(recipientId) || !message || message.length > 2000) {
    return NextResponse.json({ error: "Enter a message of 1–2000 characters and choose a valid colleague." }, { status: 400 });
  }
  let admin;
  try { admin = createAdminClient(); } catch { return dbErrorResponse(503); }
  const { data: allowed } = await admin
    .from("profiles")
    .select("id")
    .eq("id", recipientId)
    .eq("active", true)
    .eq("role", s.profile!.role === "BOSS" ? "EMPLOYEE" : "BOSS")
    .maybeSingle();
  if (!allowed) return NextResponse.json({ error: "Messages can only be sent to an active colleague." }, { status: 403 });
  const { data, error } = await admin
    .from("staff_messages")
    .insert({ sender_id: s.user!.id, recipient_id: recipientId, body: message })
    .select("id,sender_id,recipient_id,body,read_at,created_at")
    .single();
  if (error) return dbErrorResponse(400);
  await flushBossAlertEmail();
  return NextResponse.json({ message: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const s = await session();
  if (s.response) return s.response;
  let body: any;
  try { body = await readJson(request, 4 * 1024); } catch (error) { return invalidBodyResponse(error); }
  const peer = String(body.peer_id || "");
  if (!validId(peer)) return NextResponse.json({ error: "Choose a valid conversation." }, { status: 400 });
  let admin;
  try { admin = createAdminClient(); } catch { return dbErrorResponse(503); }
  const { data: allowed } = await admin
    .from("profiles")
    .select("id")
    .eq("id", peer)
    .eq("active", true)
    .eq("role", s.profile!.role === "BOSS" ? "EMPLOYEE" : "BOSS")
    .maybeSingle();
  if (!allowed) return NextResponse.json({ error: "Choose an active staff contact." }, { status: 400 });
  const { error } = await admin
    .from("staff_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", s.user!.id)
    .eq("sender_id", peer)
    .is("read_at", null);
  if (error) return dbErrorResponse(400);
  return NextResponse.json({ marked: true });
}
