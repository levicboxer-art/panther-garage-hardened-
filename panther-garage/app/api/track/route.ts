import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, invalidBodyResponse, rateLimit, rateLimitedResponse, readJson, requestKey } from "@/lib/api-security";

export async function POST(req: Request) {
  const limited = rateLimit(requestKey(req, "track"), 10);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);
  let body: any;
  try { body = await readJson(req, 16 * 1024); } catch (error) { return invalidBodyResponse(error); }
  const job = String(body?.job_number || "").trim();
  const phone = String(body?.phone || "").trim();
  if (job.length < 1 || job.length > 80 || phone.length < 7 || phone.length > 30) {
    return NextResponse.json({ error: "Enter the repair job number and the phone number registered with the garage." }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("track_customer_repair", { p_job_number: job, p_phone: phone });
  if (error) return dbErrorResponse(503);
  if (!data?.length) return NextResponse.json({ error: "No repair matched those details. Check the job number and registered phone number." }, { status: 404 });
  return NextResponse.json({ repair: data[0] });
}
