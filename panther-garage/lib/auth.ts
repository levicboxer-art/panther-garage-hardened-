import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type PgmsRole = "BOSS" | "EMPLOYEE";
export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await supabase
    .from("profiles").select("id, full_name, role, active").eq("id", user.id).single();
  if (error || !profile || !profile.active) return null;
  return { user, profile: profile as { id: string; full_name: string; role: PgmsRole; active: boolean } };
}
export async function requireProfile() {
  const current = await getCurrentProfile();
  if (!current) redirect("/login");
  return current!;
}
