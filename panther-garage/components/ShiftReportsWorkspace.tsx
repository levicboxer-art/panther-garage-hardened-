"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string) =>
  new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function ShiftReportsWorkspace({ profile }: { profile: Profile }) {
  const isBoss = profile.role === "BOSS";
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Report | null>(null);

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

  useEffect(() => {
    void load();
  }, [load]);

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
