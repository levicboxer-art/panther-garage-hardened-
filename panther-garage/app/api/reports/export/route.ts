import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

function monthWindow(month: string | null) {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  const currentMonth = new Date();
  const currentMonthStart = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth(), 1));
  if (start > currentMonthStart) return null;
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

/** Compatibility endpoint for the former monthly download control. It no longer emits the legacy dataset CSV. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has("period") && params.get("period") !== "month") return error("Monthly exports are now professional Excel reports. Choose a calendar month.", 400);
  const range = monthWindow(params.get("month"));
  if (!range) return error("Choose a valid past or current calendar month.", 400);
  const target = new URL("/api/business-reports/export", request.url);
  target.searchParams.set("from", range.from);
  target.searchParams.set("to", range.to);
  target.searchParams.set("category", "complete");
  target.searchParams.set("format", "xlsx");
  return NextResponse.redirect(target, 307);
}
