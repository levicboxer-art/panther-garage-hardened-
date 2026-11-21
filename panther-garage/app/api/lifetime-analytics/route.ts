import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, rateLimitedResponse, requestKey } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimit(requestKey(request, "lifetime-analytics"), 30);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();
  if (!profile?.active || profile.role !== "BOSS") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_lifetime_sales_analytics");
  if (error) {
    console.error("Lifetime analytics failed:", error.message);
    return NextResponse.json({ error: "Lifetime analytics are temporarily unavailable." }, { status: 503 });
  }
  return NextResponse.json(data);
}
