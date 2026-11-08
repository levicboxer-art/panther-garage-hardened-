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
function adminUnavailable() {
  return NextResponse.json({ error: "Employee administration is not configured on this deployment. Ask the owner to add SUPABASE_SERVICE_ROLE_KEY in Vercel." }, { status: 503 });
}
export async function GET() {
  const auth = await requireBoss(); if ("error" in auth) return auth.error;
  let admin;
  try { admin = createAdminClient(); } catch { return adminUnavailable(); }
  const { data, error } = await admin.from("profiles").select("id,full_name,role,active,created_at").eq("role", "EMPLOYEE").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load employee accounts." }, { status: 503 });
  return NextResponse.json({ employees: data });
}
export async function POST(request: Request) {
  const auth = await requireBoss(); if ("error" in auth) return auth.error;
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase(); const fullName = String(body.full_name || "").trim();
  const password = String(body.temporary_password || "");
  if (!email || !fullName || password.length < 12) return NextResponse.json({ error: "Provide a name, valid email and temporary password of at least 12 characters." }, { status: 400 });
  let admin;
  try { admin = createAdminClient(); } catch { return adminUnavailable(); }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) return NextResponse.json({ error: "Could not create the employee account. Check that the email is unique and the server admin configuration is valid." }, { status: 400 });
  const { error: profileError } = await admin.from("profiles").update({ full_name: fullName, role: "EMPLOYEE", active: true }).eq("id", data.user.id);
  if (profileError) { await admin.auth.admin.deleteUser(data.user.id); return NextResponse.json({ error: "Could not create staff profile." }, { status: 500 }); }
  return NextResponse.json({ employee: { id: data.user.id, email, full_name: fullName, role: "EMPLOYEE" } }, { status: 201 });
}
export async function PATCH(request: Request) {
  const auth = await requireBoss(); if ("error" in auth) return auth.error;
  const body = await request.json(); const id = String(body.id || ""); const active = body.active;
  if (!id || typeof active !== "boolean") return NextResponse.json({ error: "Employee id and active status are required." }, { status: 400 });
  let admin;
  try { admin = createAdminClient(); } catch { return adminUnavailable(); }
  const { error } = await admin.from("profiles").update({ active }).eq("id", id).eq("role", "EMPLOYEE");
  if (error) return NextResponse.json({ error: "Could not update the employee account." }, { status: 400 });
  return NextResponse.json({ success: true });
}

// Preserve sales, repairs and audit history: “delete” is a safe deactivation.
export async function DELETE(request: Request) {
  const auth = await requireBoss(); if ("error" in auth) return auth.error;
  let body: { id?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Employee id is required." }, { status: 400 }); }
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Employee id is required." }, { status: 400 });
  let admin;
  try { admin = createAdminClient(); } catch { return adminUnavailable(); }
  const { error } = await admin.from("profiles").update({ active: false }).eq("id", id).eq("role", "EMPLOYEE");
  if (error) return NextResponse.json({ error: "Could not deactivate the employee account." }, { status: 400 });
  return NextResponse.json({ success: true, deactivated: true });
}
