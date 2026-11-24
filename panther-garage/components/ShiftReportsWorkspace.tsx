"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Loader2, RefreshCw, Save, Search } from "lucide-react";

type Report = {
  id: string;
  employee_id: string;
  employee_name: string;
  report_date: string;
  opening_stock: number;
  closing_stock: number;
  comments: string;
  recommendations: string;
  challenges: string;
  solution: string;
  created_at: string;
  updated_at: string;
};

type Profile = { id: string; full_name: string; role: "BOSS" | "EMPLOYEE" };
type ShiftItem = { product_name: string; sku: string; quantity: number; item_type: "STOCK" | "USED_NONSTOCK" };
type ShiftSale = {
  id: string;
  invoice_number: string;
  created_at: string;
  total: number;
  amount_paid: number;
  balance_due: number;
  service_performed: boolean;
  service_fee: number;
  mechanic_name: string | null;
  motorcycle_plate: string | null;
  service_description: string | null;
  sale_items: ShiftItem[];
};
type ShiftRepair = {
  id: string;
  job_number: string;
  motorcycle_make: string;
  motorcycle_model: string | null;
  registration_number: string | null;
  reported_issue: string;
  status: string;
  received_at: string;
  completed_at: string | null;
  total_cost: number;
  job_value_not_payment: number;
  customers: { full_name: string; phone: string | null } | null;
  assigned: { full_name: string } | null;
};
type ShiftRepairActivity = {
  id: string;
  old_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
  job: ShiftRepair | null;
};
type ShiftSession = {
  id: string;
  employee_id: string;
  employee_name: string;
  started_at: string;
  ended_at: string | null;
  sales: ShiftSale[];
  repair_intakes: ShiftRepair[];
  repair_activity: ShiftRepairActivity[];
  totals: {
    invoice_count: number;
    invoiced_total: number;
    collected_total: number;
    outstanding_total: number;
    part_units: number;
    service_invoice_count: number;
    service_fee_total: number;
    repair_intake_count: number;
    repair_job_value_not_payment: number;
    repair_status_update_count: number;
  };
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string) =>
  new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string | null) => iso ? new Date(iso).toLocaleString() : "Still active";
const money = (value: number) => new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(Number(value) || 0);
const elapsed = (start: string, end: string | null) => {
  const minutes = Math.max(0, Math.floor(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export default function ShiftReportsWorkspace({ profile }: { profile: Profile }) {
  const isBoss = profile.role === "BOSS";
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Report | null>(null);
  const [shifts, setShifts] = useState<ShiftSession[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [shiftError, setShiftError] = useState("");
  const [shiftEmployeeFilter, setShiftEmployeeFilter] = useState("ALL");
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [startingShift, setStartingShift] = useState(false);
  const [hasMoreShifts, setHasMoreShifts] = useState(false);
  const [shiftEmployeeOptions, setShiftEmployeeOptions] = useState<{ id: string; full_name: string }[]>([]);
  const shiftRowsRef = useRef<ShiftSession[]>([]);
  const shiftNextOffsetRef = useRef(0);

  // ---------- form state ----------
  const [form, setForm] = useState({
    report_date: todayISO(),
    opening_stock: "",
    closing_stock: "",
    comments: "",
    recommendations: "",
    challenges: "",
    solution: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shift-reports");
      const j = await res.json();
      if (!res.ok) {
        setNotice({ kind: "err", text: j?.error || "Could not load shift reports." });
      } else {
        setReports(j.reports || []);
        if (j.reports?.length) setSelected((s) => s ?? j.reports[0]);
      }
    } catch {
      setNotice({ kind: "err", text: "Network error while loading shift reports." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadShifts = useCallback(async (append = false) => {
    setShiftsLoading(true);
    setShiftError("");
    try {
      const offset = append ? shiftNextOffsetRef.current : 0;
      const params = new URLSearchParams();
      if (offset) params.set("offset", String(offset));
      if (isBoss && shiftEmployeeFilter !== "ALL") params.set("employee_id", shiftEmployeeFilter);
      const suffix = params.toString();
      const response = await fetch(`/api/staff-shifts${suffix ? `?${suffix}` : ""}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setShiftError(body?.error || "Could not load employee shifts.");
        return;
      }
      const rows = (body.shifts || []) as ShiftSession[];
      const combined = append ? [...shiftRowsRef.current, ...rows] : rows;
      shiftRowsRef.current = combined;
      setShifts(combined);
      setShiftEmployeeOptions((body.employee_options || []) as { id: string; full_name: string }[]);
      setHasMoreShifts(Boolean(body.has_more_shifts));
      shiftNextOffsetRef.current = Number(body.next_offset) || offset + rows.length;
      setSelectedShiftId((current) => combined.some((row) => row.id === current) ? current : combined[0]?.id || "");
    } catch {
      setShiftError("Network error while loading employee shifts.");
    } finally {
      setShiftsLoading(false);
    }
  }, [isBoss, shiftEmployeeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

  // Same-day report (employee) or the selected one (boss review) prefills the form so it amends instead of duplicating.
  const myToday = useMemo(
    () => reports.find((r) => !isBoss && r.employee_id === profile.id && r.report_date === form.report_date),
    [reports, isBoss, profile.id, form.report_date],
  );
  useEffect(() => {
    if (!myToday) return;
    setForm((f) =>
      f.comments || f.opening_stock || f.closing_stock
        ? f
        : {
            ...f,
            opening_stock: String(myToday.opening_stock),
            closing_stock: String(myToday.closing_stock),
            comments: myToday.comments,
            recommendations: myToday.recommendations,
            challenges: myToday.challenges,
            solution: myToday.solution,
          },
    );
  }, [myToday]);

  const submit = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/shift-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_date: form.report_date,
          opening_stock: Number(form.opening_stock || 0),
          closing_stock: Number(form.closing_stock || 0),
          comments: form.comments,
          recommendations: form.recommendations,
          challenges: form.challenges,
          solution: form.solution,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setNotice({ kind: "err", text: j?.error || "Could not save the report." });
      } else {
        setNotice({ kind: "ok", text: `Shift report for ${fmtDate(form.report_date)} saved.` });
        await load();
      }
    } catch {
      setNotice({ kind: "err", text: "Network error while saving." });
    } finally {
      setSaving(false);
    }
  };

  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reports) map.set(r.employee_id, r.employee_name);
    return [...map.entries()].sort((a, b) => (a[1] < b[1] ? -1 : 1));
  }, [reports]);

  const visible = useMemo(() => {
    let rows = reports;
    if (isBoss && filterEmployee !== "ALL") rows = rows.filter((r) => r.employee_id === filterEmployee);
    const q = search.trim().toLowerCase();
    if (q)
      rows = rows.filter((r) =>
        `${r.employee_name} ${r.report_date} ${r.comments} ${r.recommendations} ${r.challenges} ${r.solution}`
          .toLowerCase()
          .includes(q),
      );
    return rows;
  }, [reports, isBoss, filterEmployee, search]);

  const activeShift = useMemo(
    () => shifts.find((shift) => shift.employee_id === profile.id && !shift.ended_at) || null,
    [shifts, profile.id],
  );
  const shiftEmployees = useMemo(() => shiftEmployeeOptions.length
    ? shiftEmployeeOptions.map((employee) => [employee.id, employee.full_name] as [string, string])
    : [...new Map(shifts.map((shift) => [shift.employee_id, shift.employee_name])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1])), [shifts, shiftEmployeeOptions]);
  const visibleShifts = useMemo(() => shiftEmployeeFilter === "ALL"
    ? shifts
    : shifts.filter((shift) => shift.employee_id === shiftEmployeeFilter), [shifts, shiftEmployeeFilter]);
  const selectedShift = visibleShifts.find((shift) => shift.id === selectedShiftId) || visibleShifts[0] || null;

  async function startShift() {
    setStartingShift(true);
    setShiftError("");
    try {
      const response = await fetch("/api/staff-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const body = await response.json();
      if (!response.ok) {
        setShiftError(body?.error || "Could not start your shift.");
        return;
      }
      await loadShifts();
    } catch {
      setShiftError("Network error while starting your shift.");
    } finally {
      setStartingShift(false);
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder = "") => (
    <label className="block">
      <span className="tag">{label}</span>
      <input
        className="field mt-1 w-full"
        type={key === "report_date" ? "date" : "number"}
        min={key === "report_date" ? undefined : 0}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  );

  const area = (key: keyof typeof form, label: string, placeholder: string) => (
    <label className="block">
      <span className="tag">{label}</span>
      <textarea
        className="field mt-1 w-full"
        rows={2}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  );

  return (
    <section className="space-y-4">
      <div className="card p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-lime/10 text-lime grid place-items-center">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight">Shift reports</h2>
            <p className="muted text-sm">
              {isBoss
                ? "Daily handover reports from every employee: stock counts, comments, recommendations, challenges and solutions."
                : "File your day: opening stock, closing stock, what happened, what you recommend, the challenge you faced and how it was solved."}
            </p>
          </div>
          <button onClick={() => void load()} className="btn btn-ghost ml-auto" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      {notice && (
        <div className={`card p-4 text-sm ${notice.kind === "ok" ? "text-lime" : "badge-red"}`}>{notice.text}</div>
      )}

      <section className="card p-5 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold">Employee work shifts</h3>
            <p className="muted mt-1 text-sm">
              {isBoss
                ? "Actual login-to-sign-out sessions with invoices, collections, balances and repair intakes linked to the shift."
                : "Your current shift starts when you enter the dashboard and ends when you sign out."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isBoss && <select className="field !w-auto" value={shiftEmployeeFilter} onChange={(event) => setShiftEmployeeFilter(event.target.value)}>
              <option value="ALL">All employees</option>
              {shiftEmployees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>}
            <button onClick={() => void loadShifts()} className="btn btn-ghost text-xs" disabled={shiftsLoading}>
              {shiftsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
            </button>
          </div>
        </div>

        {!isBoss && <div className="rounded-xl border border-lime/20 bg-lime/[.03] p-4 text-sm">
          {activeShift ? <>
            <span className="badge">SHIFT ACTIVE</span>
            <span className="ml-2">Started {fmtDateTime(activeShift.started_at)} · {elapsed(activeShift.started_at, null)} elapsed</span>
          </> : <div className="flex flex-wrap items-center justify-between gap-3">
            <span>No active shift is open. Starting one enables sales and repair intakes to be attributed to you.</span>
            <button type="button" onClick={() => void startShift()} disabled={startingShift} className="btn btn-primary text-xs">
              {startingShift ? "Starting…" : "Start shift"}
            </button>
          </div>}
        </div>}

        {shiftError && <p className="text-sm text-red-300" role="alert">{shiftError}</p>}
        {shiftsLoading ? <p className="muted py-5 text-center"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading employee shifts…</p> : !visibleShifts.length ? (
          <p className="muted py-5 text-center">No tracked shifts yet. Historical sales and repair jobs are not assigned to invented shifts.</p>
        ) : <>
          <div className="table-wrap">
            <table>
              <thead><tr>
                {isBoss && <th>EMPLOYEE</th>}
                <th>STARTED</th><th>ENDED</th><th>DURATION</th><th>INVOICES</th><th>PART UNITS</th>
                <th>INVOICED</th><th>SERVICE FEES IN INVOICES</th><th>COLLECTED</th><th>OUTSTANDING</th>
                <th>REPAIR INTAKES</th><th>REPAIR STATUS UPDATES</th><th>JOB VALUE (NOT PAYMENT)</th>
              </tr></thead>
              <tbody>{visibleShifts.map((shift) => <tr key={shift.id} onClick={() => setSelectedShiftId(shift.id)} className={`cursor-pointer ${selectedShift?.id === shift.id ? "!bg-lime/5" : ""}`}>
                {isBoss && <td className="font-semibold">{shift.employee_name}</td>}
                <td className="whitespace-nowrap">{fmtDateTime(shift.started_at)}</td>
                <td className="whitespace-nowrap">{fmtDateTime(shift.ended_at)}</td>
                <td>{elapsed(shift.started_at, shift.ended_at)}</td>
                <td>{shift.totals.invoice_count}</td><td>{shift.totals.part_units}</td>
                <td>{money(shift.totals.invoiced_total)}</td><td>{money(shift.totals.service_fee_total)}</td>
                <td className="lime">{money(shift.totals.collected_total)}</td><td>{money(shift.totals.outstanding_total)}</td>
                <td>{shift.totals.repair_intake_count}</td><td>{shift.totals.repair_status_update_count}</td>
                <td>{money(shift.totals.repair_job_value_not_payment)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {hasMoreShifts && <div className="flex justify-center">
            <button type="button" onClick={() => void loadShifts(true)} disabled={shiftsLoading} className="btn btn-ghost text-xs">
              {shiftsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Load older shifts
            </button>
          </div>}

          {selectedShift && <div className="space-y-4 rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h4 className="font-bold">Shift detail · {selectedShift.employee_name}</h4>
                <p className="muted mt-1 text-xs">Started {fmtDateTime(selectedShift.started_at)} · Ended {fmtDateTime(selectedShift.ended_at)} · {elapsed(selectedShift.started_at, selectedShift.ended_at)}</p>
              </div>
              <span className="badge">{selectedShift.ended_at ? "ENDED" : "ACTIVE"}</span>
            </div>

            <div>
              <h5 className="text-sm font-semibold">Sales and invoices</h5>
              {!selectedShift.sales.length ? <p className="muted mt-2 text-xs">No completed invoices were recorded during this shift.</p> : <div className="mt-2 space-y-2">
                {selectedShift.sales.map((sale) => <article key={sale.id} className="rounded-lg border border-white/[.08] p-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2"><b>{sale.invoice_number}</b><span className="muted">{fmtDateTime(sale.created_at)}</span></div>
                  <div className="mt-2 grid gap-1 sm:grid-cols-3"><span>Invoiced: <b>{money(sale.total)}</b></span><span>Collected: <b className="lime">{money(sale.amount_paid)}</b></span><span>Outstanding: <b>{money(sale.balance_due)}</b></span></div>
                  <div className="muted mt-2">{sale.sale_items.length ? sale.sale_items.map((item, index) => <span key={`${item.sku}-${index}`} className="mr-3">{item.product_name} × {item.quantity}{item.item_type === "USED_NONSTOCK" ? " · used/non-stock" : ""}</span>) : "No line items"}</div>
                  {sale.service_performed && <div className="mt-2 border-t border-white/[.08] pt-2">Service included · Fee {money(sale.service_fee)} · Mechanic {sale.mechanic_name || "—"} · Plate {sale.motorcycle_plate || "—"}{sale.service_description ? ` · ${sale.service_description}` : ""}</div>}
                </article>)}
              </div>}
            </div>

            <div>
              <h5 className="text-sm font-semibold">Repair intakes received during this shift</h5>
              <p className="muted mt-1 text-[11px]">A repair job value is not a payment or collection record.</p>
              {!selectedShift.repair_intakes.length ? <p className="muted mt-2 text-xs">No repair intakes were recorded during this shift.</p> : <div className="table-wrap mt-2">
                <table><thead><tr><th>RECEIVED</th><th>COMPLETED</th><th>CUSTOMER</th><th>PLATE</th><th>MOTORCYCLE</th><th>ISSUE</th><th>MECHANIC</th><th>STATUS</th><th>JOB VALUE (NOT PAYMENT)</th></tr></thead>
                  <tbody>{selectedShift.repair_intakes.map((job) => <tr key={job.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(job.received_at)}</td><td className="whitespace-nowrap">{fmtDateTime(job.completed_at)}</td><td>{job.customers?.full_name || "Walk-in"}</td>
                    <td>{job.registration_number || "—"}</td><td>{[job.motorcycle_make, job.motorcycle_model].filter(Boolean).join(" ")}</td>
                    <td>{job.reported_issue}</td><td>{job.assigned?.full_name || "Not assigned"}</td><td>{job.status}</td>
                    <td>{money(job.job_value_not_payment)}</td>
                  </tr>)}</tbody>
                </table>
              </div>}
            </div>

            <div>
              <h5 className="text-sm font-semibold">Repair work and status changes during this shift</h5>
              <p className="muted mt-1 text-[11px]">A “READY” status indicates the motorcycle was marked repaired/ready. Job value remains separate from payments.</p>
              {!selectedShift.repair_activity.length ? <p className="muted mt-2 text-xs">No repair status updates were recorded during this shift.</p> : <div className="mt-2 space-y-2">
                {selectedShift.repair_activity.map((event) => <article key={event.id} className="rounded-lg border border-white/[.08] p-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2"><b>{event.job?.job_number || "Repair job"} · {event.job?.registration_number || "No plate recorded"}</b><span className="muted">{fmtDateTime(event.created_at)}</span></div>
                  {event.job && <div className="muted mt-2">{[event.job.motorcycle_make, event.job.motorcycle_model].filter(Boolean).join(" ")} · {event.job.customers?.full_name || "Walk-in"} · Mechanic {event.job.assigned?.full_name || "Not assigned"} · Job value (not payment): {money(event.job.job_value_not_payment)}</div>}
                  {event.job?.reported_issue && <div className="mt-1">Reported issue: {event.job.reported_issue}</div>}
                  <div className="mt-1 font-semibold">{event.old_status || "New"} → {event.new_status}</div>
                  {event.note && <div className="muted mt-1">Note: {event.note}</div>}
                </article>)}
              </div>}
            </div>
          </div>}
        </>}
      </section>

      {/* ---------- employee submission form (boss reviews only) ---------- */}
      {!isBoss && (
        <div className="card p-5 md:p-6 space-y-4">
          <h3 className="font-bold">Today&rsquo;s report {myToday ? <span className="badge ml-2">amending saved report</span> : null}</h3>
          <div className="grid md:grid-cols-3 gap-4">
            {field("report_date", "Date")}
            {field("opening_stock", "Opening stock (units)", "e.g. 1240")}
            {field("closing_stock", "Closing stock (units)", "e.g. 1233")}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {area("comments", "Comments", "What happened during the shift…")}
            {area("recommendations", "Recommendations", "What should the garage do next…")}
            {area("challenges", "Challenge faced", "Problems you ran into…")}
            {area("solution", "Solution", "How it was solved or what help you need…")}
          </div>
          <button onClick={() => void submit()} className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {myToday ? "Update report" : "Submit report"}
          </button>
        </div>
      )}

      {/* ---------- list + review ---------- */}
      <div className="card p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="font-bold">Reports ({visible.length})</h3>
          {isBoss && employeeOptions.length > 0 && (
            <select className="field !w-auto" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
              <option value="ALL">All employees</option>
              {employeeOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              className="field !w-64 pl-9"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className="muted py-8 text-center"><Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Loading shift reports…</p>
        ) : !visible.length ? (
          <p className="muted py-8 text-center">
            No shift reports yet{isBoss ? "" : " — submit your first one above"}.
            <br />
            <span className="text-xs">If the table is missing, run supabase/migrations/011_shift_reports.sql in the Supabase SQL editor.</span>
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {isBoss ? <th>Employee</th> : null}
                  <th>Opening</th>
                  <th>Closing</th>
                  <th>Δ</th>
                  <th>Challenge</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 60).map((r) => {
                  const delta = r.closing_stock - r.opening_stock;
                  return (
                    <tr
                      key={r.id}
                      className={selected?.id === r.id ? "!bg-lime/5" : "cursor-pointer"}
                      onClick={() => setSelected(r)}
                    >
                      <td className="whitespace-nowrap">{fmtDate(r.report_date)}</td>
                      {isBoss ? <td>{r.employee_name}</td> : null}
                      <td>{r.opening_stock}</td>
                      <td>{r.closing_stock}</td>
                      <td className={delta < 0 ? "text-amber-400" : delta > 0 ? "text-lime" : "muted"}>
                        {delta > 0 ? `+${delta}` : delta}
                      </td>
                      <td className="max-w-[260px] truncate muted">{r.challenges || r.comments || "—"}</td>
                      <td className="text-right"><button className="pill" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>View</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- full report detail ---------- */}
      {selected && (
        <div className="card p-5 md:p-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">Report · {fmtDate(selected.report_date)}</h3>
            <span className="tag">{selected.employee_name}</span>
            <span className="ml-auto muted text-xs">updated {fmtDate(selected.updated_at)}</span>
          </div>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div><span className="tag">Opening stock</span><p className="font-semibold">{selected.opening_stock} units</p></div>
            <div><span className="tag">Closing stock</span><p className="font-semibold">{selected.closing_stock} units</p></div>
            <div><span className="tag">Net movement</span><p className="font-semibold">{selected.closing_stock - selected.opening_stock >= 0 ? "+" : ""}{selected.closing_stock - selected.opening_stock} units</p></div>
          </div>
          {(
            [
              ["Comments", selected.comments],
              ["Recommendations", selected.recommendations],
              ["Challenge", selected.challenges],
              ["Solution", selected.solution],
            ] as const
          )
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label}>
                <span className="tag">{label}</span>
                <p className="text-sm leading-6 whitespace-pre-wrap mt-1">{value}</p>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
