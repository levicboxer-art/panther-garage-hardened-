import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchBossNotificationEmail } from "@/lib/notification-email";
import { isSameOriginRequest, rateLimit, rateLimitedResponse } from "@/lib/api-security";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();
  if (profileError || !profile?.active || profile.role !== "BOSS") {
    return NextResponse.json({ error: "Only an active Boss can send the alert digest." }, { status: 403, headers: NO_STORE });
  }

  const limit = rateLimit(`notification-email:${user.id}`, 2);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter);

  try {
    const result = await dispatchBossNotificationEmail(createAdminClient());
    return NextResponse.json(result, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "Notification email delivery is temporarily unavailable." },
      { status: 503, headers: NO_STORE },
    );
  }
}
