import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
async function requireBoss() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role,active").eq("id", user.id).single();
  if (!profile?.active || profile.role !== "BOSS") return { error: NextResponse.json({ error: "Boss access required." }, { status: 403 }) };
  return { user };
}
export async function GET() {
  const auth = await requireBoss(); if ("error" in auth) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("id,full_name,role,active,created_at").eq("role", "EMPLOYEE").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ employees: data });
}
export async function POST(request: Request) {
  const auth = await requireBoss(); if ("error" in auth) return auth.error;
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase(); const fullName = String(body.full_name || "").trim();
  const password = String(body.temporary_password || "");
  if (!email || !fullName || password.length < 12) return NextResponse.json({ error: "Provide a name, valid email and temporary password of at least 12 characters." }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { error: profileError } = await admin.from("profiles").update({ full_name: fullName, role: "EMPLOYEE", active: true }).eq("id", data.user.id);
  if (profileError) { await admin.auth.admin.deleteUser(data.user.id); return NextResponse.json({ error: "Could not create staff profile." }, { status: 500 }); }
  return NextResponse.json({ employee: { id: data.user.id, email, full_name: fullName, role: "EMPLOYEE" } }, { status: 201 });
}
export async function PATCH(request: Request) {
  const auth = await requireBoss(); if ("error" in auth) return auth.error;
  const body = await request.json(); const id = String(body.id || ""); const active = body.active;
  if (!id || typeof active !== "boolean") return NextResponse.json({ error: "Employee id and active status are required." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ active }).eq("id", id).eq("role", "EMPLOYEE");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
