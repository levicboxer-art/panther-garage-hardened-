import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse, invalidBodyResponse, readJson } from "@/lib/api-security";

export const dynamic = "force-dynamic";
const SHIFT_PAGE_SIZE = 50;
const DETAIL_PAGE_SIZE = 500;

async function collectPages(buildQuery: (from: number, to: number) => any) {
  const allRows: any[] = [];
  for (let from = 0; ; from += DETAIL_PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + DETAIL_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data || [];
    allRows.push(...page);
    if (page.length < DETAIL_PAGE_SIZE) return { data: allRows, error: null };
  }
}

async function getStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,full_name,role,active").eq("id", user.id).single();
  if (error || !profile?.active) {
    return { supabase, user, profile: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { supabase, user, profile, response: null };
}

export async function GET(request: Request) {
  const staff = await getStaff();
  if (staff.response) return staff.response;

  const url = new URL(request.url);
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    return NextResponse.json({ error: "Invalid shift history page." }, { status: 400 });
  }
  const requestedEmployee = url.searchParams.get("employee_id");
  if (staff.profile!.role === "BOSS" && requestedEmployee && requestedEmployee !== "ALL" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedEmployee)) {
    return NextResponse.json({ error: "Invalid employee filter." }, { status: 400 });
  }

  let employeeOptions: { id: string; full_name: string }[] = [];
  if (staff.profile!.role === "BOSS") {
    const { data } = await staff.supabase.from("profiles")
      .select("id,full_name").eq("active", true).eq("role", "EMPLOYEE")
      .order("full_name", { ascending: true }).limit(500);
    employeeOptions = (data || []) as { id: string; full_name: string }[];
  }

  let query = staff.supabase.from("staff_shifts")
    .select("id,employee_id,employee_name,started_at,ended_at,ended_by")
    .order("started_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + SHIFT_PAGE_SIZE);
  if (staff.profile!.role !== "BOSS") query = query.eq("employee_id", staff.user!.id);
  else if (requestedEmployee && requestedEmployee !== "ALL") query = query.eq("employee_id", requestedEmployee);
  const { data: pageRows, error: shiftsError } = await query;
  if (shiftsError) return dbErrorResponse(503, shiftsError);
  const hasMoreShifts = (pageRows || []).length > SHIFT_PAGE_SIZE;
  const shifts = (pageRows || []).slice(0, SHIFT_PAGE_SIZE);
  const ids = shifts.map((shift) => shift.id);
  const nextOffset = offset + shifts.length;
  if (!ids.length) return NextResponse.json({ shifts: [], role: staff.profile!.role, has_more_shifts: false, next_offset: nextOffset, employee_options: employeeOptions });

  const [salesResult, repairsResult, activityResult] = await Promise.all([
    collectPages((from, to) => staff.supabase.from("sales")
      .select("id,shift_id,invoice_number,created_at,total,amount_paid,balance_due,status,service_performed,service_fee,mechanic_name,motorcycle_plate,service_description,sale_items(product_name,sku,quantity,item_type)")
      .in("shift_id", ids).eq("status", "COMPLETED")
      .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    collectPages((from, to) => staff.supabase.from("repair_jobs")
      .select("id,shift_id,job_number,customer_id,motorcycle_make,motorcycle_model,registration_number,reported_issue,status,labour_fee,parts_total,total_cost,received_at,completed_at,collected_at,customers(full_name,phone),assigned:profiles!repair_jobs_assigned_to_fkey(full_name)")
      .in("shift_id", ids).order("received_at", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    collectPages((from, to) => staff.supabase.from("repair_status_history")
      .select("id,shift_id,repair_job_id,old_status,new_status,note,created_at,job:repair_jobs!repair_status_history_repair_job_id_fkey(job_number,customer_id,motorcycle_make,motorcycle_model,registration_number,reported_issue,status,total_cost,received_at,completed_at,customers(full_name,phone),assigned:profiles!repair_jobs_assigned_to_fkey(full_name))")
      .in("shift_id", ids)
      .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to)),
  ]);
  if (salesResult.error) return dbErrorResponse(503, salesResult.error);
  if (repairsResult.error) return dbErrorResponse(503, repairsResult.error);
  if (activityResult.error) return dbErrorResponse(503, activityResult.error);

  const byId = new Map<string, any>();
  for (const shift of shifts) {
    byId.set(shift.id, {
      ...shift,
      sales: [],
      repair_intakes: [],
      repair_activity: [],
      totals: {
        invoice_count: 0,
        invoiced_total: 0,
        collected_total: 0,
        outstanding_total: 0,
        part_units: 0,
        service_invoice_count: 0,
        service_fee_total: 0,
        repair_intake_count: 0,
        repair_job_value_not_payment: 0,
        repair_status_update_count: 0,
      },
    });
  }

  for (const sale of salesResult.data || []) {
    const shift = byId.get(sale.shift_id);
    if (!shift) continue;
    const items = (sale.sale_items || []).map((item: any) => ({
      product_name: item.product_name,
      sku: item.sku,
      quantity: Number(item.quantity) || 0,
      item_type: item.item_type === "USED" || item.item_type === "USED_NONSTOCK" ? "USED_NONSTOCK" : "STOCK",
    }));
    const total = Number(sale.total) || 0;
    const amountPaid = Number(sale.amount_paid) || 0;
    const balanceDue = Number(sale.balance_due) || 0;
    const serviceFee = sale.service_performed ? Number(sale.service_fee) || 0 : 0;
    const detail = { ...sale, total, amount_paid: amountPaid, balance_due: balanceDue, service_fee: serviceFee, sale_items: items };
    shift.sales.push(detail);
    shift.totals.invoice_count += 1;
    shift.totals.invoiced_total += total;
    shift.totals.collected_total += amountPaid;
    shift.totals.outstanding_total += balanceDue;
    shift.totals.part_units += items.reduce((sum: number, item: any) => sum + item.quantity, 0);
    if (sale.service_performed) {
      shift.totals.service_invoice_count += 1;
      shift.totals.service_fee_total += serviceFee;
    }
  }

  for (const job of repairsResult.data || []) {
    const shift = byId.get(job.shift_id);
    if (!shift) continue;
    const jobValue = Number(job.total_cost) || 0;
    shift.repair_intakes.push({ ...job, job_value_not_payment: jobValue });
    shift.totals.repair_intake_count += 1;
    shift.totals.repair_job_value_not_payment += jobValue;
  }

  for (const event of activityResult.data || []) {
    const shift = byId.get(event.shift_id);
    if (!shift) continue;
    const joinedJob = Array.isArray(event.job) ? event.job[0] : event.job;
    const job = joinedJob ? { ...joinedJob, job_value_not_payment: Number(joinedJob.total_cost) || 0 } : null;
    shift.repair_activity.push({ ...event, job });
    shift.totals.repair_status_update_count += 1;
  }

  return NextResponse.json({ shifts: [...byId.values()], role: staff.profile!.role, has_more_shifts: hasMoreShifts, next_offset: nextOffset, employee_options: employeeOptions });
}

export async function POST(req: Request) {
  const staff = await getStaff();
  if (staff.response) return staff.response;
  if (staff.profile!.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Only employee accounts have employee shift sessions." }, { status: 403 });
  }

  let body: { action?: unknown };
  try { body = await readJson<{ action?: unknown }>(req, 8 * 1024); }
  catch (error) { return invalidBodyResponse(error); }
  const action = String(body.action || "");
  if (action !== "start" && action !== "end") {
    return NextResponse.json({ error: "Choose a valid shift action." }, { status: 400 });
  }

  const { data, error } = await staff.supabase.rpc(action === "start" ? "start_employee_shift" : "end_employee_shift");
  if (error) return dbErrorResponse(503, error);
  return NextResponse.json({ shift: data || null, action });
}
