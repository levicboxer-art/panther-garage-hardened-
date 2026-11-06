import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchBossNotificationEmail } from "@/lib/notification-email";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("active").eq("id", user.id).single();
  if (!profile?.active) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await dispatchBossNotificationEmail(createAdminClient());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Notification email delivery is temporarily unavailable." }, { status: 503 });
  }
}
