"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  FileUp,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  SkipForward,
  Upload,
  X,
} from "lucide-react";

type ImportStatus = "DRAFT" | "REVIEW" | "APPROVED" | "APPLIED" | "CANCELLED";

type ImportRecord = {
  id: string;
  reference: string;
  status: ImportStatus;
  primary_file: string;
  source_summary: any;
  report: any;
  approved_at: string | null;
  applied_at: string | null;
  created_at: string;
};

type ImportItem = {
  id: string;
  source_file: string;
  source_sheet: string;
  source_row: number;
  source_role: "PRIMARY" | "COMPARISON";
  original_name: string;
  original_reference: string | null;
  original_model: string | null;
  quantity: number | null;
  unit_cost: number | string | null;
  suggested_sell: number | string | null;
  stock_purchase_value: number | string | null;
  potential_sales_value: number | string | null;
  recalculated_stock_value: number | string | null;
  compatibility: string;
  category: string;
  proposed_sku: string | null;
  decision: "PENDING" | "CREATE" | "MATCH" | "ADD_BATCH" | "SKIP";
  review_status: "NEEDS_REVIEW" | "APPROVED" | "SKIPPED";
  matched_product_id: string | null;
  approved_selling_price: number | string | null;
  approved_category: string | null;
  approved_compatibility: string | null;
  notes: string | null;
  has_blocking_conflict: boolean;
  applied: boolean;
  errors: any[] | null;
};

type ImportConflict = {
  id: string;
  item_id: string | null;
  conflict_type: string;
  severity: "INFO" | "WARNING" | "BLOCKING";
  detail: string;
  source_file: string | null;
  source_row: number | null;
  comparison_file: string | null;
  comparison_row: number | null;
  resolved: boolean;
  resolution: string | null;
};

type SelectedImport = ImportRecord & {
  items?: ImportItem[];
  conflicts?: ImportConflict[];
};

type ProductOption = { id: string; name: string; sku: string };

type ReviewDraft = {
  item: ImportItem;
  decision: "CREATE" | "MATCH" | "ADD_BATCH" | "SKIP";
  productId: string;
  sellingPrice: string;
  category: string;
  compatibility: string;
  notes: string;
};

const COMPATIBILITY = ["UNCONFIRMED", "SPIRO ELECTRIC", "AMPERSAND ELECTRIC", "FUEL-POWERED", "UNIVERSAL"];
const DECISIONS = ["CREATE", "MATCH", "ADD_BATCH", "SKIP"] as const;

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

function statusBadge(status: ImportStatus) {
  if (status === "APPLIED") return "badge";
  if (status === "CANCELLED") return "badge badge-red";
  return "badge badge-warn";
}

function reviewBadge(item: ImportItem) {
  if (item.review_status === "APPROVED") return "badge";
  if (item.review_status === "SKIPPED") return "badge badge-red";
  return "badge badge-warn";
}

function severityBadge(severity: string) {
  if (severity === "BLOCKING") return "badge badge-red";
  if (severity === "WARNING") return "badge badge-warn";
  return "badge";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ImportWorkspace() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [selected, setSelected] = useState<SelectedImport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [migrationRequired, setMigrationRequired] = useState(false);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "PRIMARY" | "COMPARISON">("ALL");
  const [reviewFilter, setReviewFilter] = useState<
    "ALL" | "NEEDS_REVIEW" | "APPROVED" | "SKIPPED" | "BLOCKING"
  >("ALL");
  const [includeBlocking, setIncludeBlocking] = useState(false);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [showConflicts, setShowConflicts] = useState(true);

  const clearErrors = () => {
    setError("");
    setMigrationRequired(false);
  };

  const load = useCallback(
    async (importId?: string, showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setError("");
      try {
        const url = importId
          ? `/api/imports?id=${encodeURIComponent(importId)}`
          : "/api/imports";
        const response = await fetch(url, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok) {
          if (json.migrationRequired) setMigrationRequired(true);
          throw new Error(json.error || "Could not load the import workspace.");
        }
        setImports(json.imports || []);
        setSelected(json.selected || null);
      } catch (err) {
        setError(errorMessage(err, "Could not load the import workspace."));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const summary = selected?.source_summary || {};
  const sourceFiles: any[] = Array.isArray(summary.sourceFiles) ? summary.sourceFiles : [];
  const primarySource = sourceFiles.find((file) => file.role === "PRIMARY");
  const comparisonSource = sourceFiles.find((file) => file.role === "COMPARISON");

  const items = selected?.items || [];
  const conflicts = selected?.conflicts || [];
  const primaryItems = items.filter((item) => item.source_role === "PRIMARY");
  const comparisonItems = items.filter((item) => item.source_role === "COMPARISON");

  const stats = useMemo(() => {
    return {
      primary: primaryItems.length,
      approved: primaryItems.filter((item) => item.review_status === "APPROVED").length,
      needsReview: primaryItems.filter((item) => item.review_status === "NEEDS_REVIEW").length,
      skipped: primaryItems.filter((item) => item.review_status === "SKIPPED").length,
      blocking: primaryItems.filter((item) => item.has_blocking_conflict).length,
      applied: primaryItems.filter((item) => item.applied).length,
      openBlocking: conflicts.filter(
        (conflict) => conflict.severity === "BLOCKING" && !conflict.resolved,
      ).length,
    };
  }, [primaryItems, conflicts]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (roleFilter !== "ALL" && item.source_role !== roleFilter) return false;
        if (reviewFilter === "BLOCKING" && !item.has_blocking_conflict) return false;
        if (
          reviewFilter !== "ALL" &&
          reviewFilter !== "BLOCKING" &&
          item.review_status !== reviewFilter
        ) {
          return false;
        }
        if (!term) return true;
        return [item.original_name, item.original_reference, item.original_model, item.proposed_sku]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        if (a.source_role !== b.source_role) return a.source_role === "PRIMARY" ? -1 : 1;
        return a.source_row - b.source_row;
      });
  }, [items, roleFilter, reviewFilter, query]);

  const conflictGroups = useMemo(() => {
    const order = { BLOCKING: 0, WARNING: 1, INFO: 2 } as const;
    return [...conflicts].sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      return order[a.severity] - order[b.severity];
    });
  }, [conflicts]);

  const conflictCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const conflict of conflicts) {
      if (conflict.resolved) continue;
      counts[conflict.conflict_type] = (counts[conflict.conflict_type] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [conflicts]);

  async function stageImport() {
    clearErrors();
    setBusy("stage");
    try {
      const response = await fetch("/api/imports", { method: "POST" });
      const json = await response.json();
      if (!response.ok) {
        if (json.migrationRequired) setMigrationRequired(true);
        throw new Error(json.error || "Could not read the workbooks.");
      }
      setNotice(`Workbooks staged as ${json.reference}. No stock has been changed yet.`);
      await load(json.import_id, false);
    } catch (err) {
      setError(errorMessage(err, "Could not read the workbooks."));
    } finally {
      setBusy("");
    }
  }

  async function approveAll() {
    if (!selected) return;
    if (
      includeBlocking &&
      !window.confirm(
        "Approve rows that still have blocking conflicts? Only do this after checking each conflict. Opening stock will be created for every approved row.",
      )
    ) {
      return;
    }
    clearErrors();
    setBusy("approve");
    try {
      const response = await fetch("/api/imports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          import_id: selected.id,
          action: "approve_all",
          include_blocking: includeBlocking,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (json.migrationRequired) setMigrationRequired(true);
        throw new Error(json.error || "Could not approve the import.");
      }
      const result = json.result || {};
      setNotice(
        `${result.approved || 0} row(s) approved. ${result.remaining_review || 0} still need review.`,
      );
      await load(selected.id, false);
    } catch (err) {
      setError(errorMessage(err, "Could not approve the import."));
    } finally {
      setBusy("");
    }
  }

  async function cancelImport() {
    if (!selected) return;
    if (!window.confirm(`Cancel import ${selected.reference}? No stock will be created.`)) return;
    clearErrors();
    setBusy("cancel");
    try {
      const response = await fetch("/api/imports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ import_id: selected.id, action: "cancel" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not cancel the import.");
      setNotice("Import cancelled. No stock was created.");
      await load(undefined, false);
    } catch (err) {
      setError(errorMessage(err, "Could not cancel the import."));
    } finally {
      setBusy("");
    }
  }

  async function applyImport() {
    if (!selected) return;
    if (
      !window.confirm(
        `Apply ${selected.reference}? This creates products, FIFO opening batches and stock movements. A source row is only ever applied once.`,
      )
    ) {
      return;
    }
    clearErrors();
    setBusy("apply");
    try {
      const response = await fetch("/api/imports/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ import_id: selected.id }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (json.migrationRequired) setMigrationRequired(true);
        throw new Error(json.error || "Could not apply the import.");
      }
      setNotice("Import applied. Review the import report below.");
      await load(selected.id, false);
    } catch (err) {
      setError(errorMessage(err, "Could not apply the import."));
    } finally {
      setBusy("");
    }
  }

  async function resolveConflict(conflict: ImportConflict) {
    clearErrors();
    setBusy(conflict.id);
    try {
      const response = await fetch("/api/imports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          import_id: selected?.id,
          action: "resolve_conflict",
          conflict_id: conflict.id,
          resolution: "Reviewed by BOSS during workbook import.",
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not resolve the conflict.");
      setNotice("Conflict marked as reviewed.");
      await load(selected?.id, false);
    } catch (err) {
      setError(errorMessage(err, "Could not resolve the conflict."));
    } finally {
      setBusy("");
    }
  }

  async function openReview(item: ImportItem) {
    clearErrors();
    setDraft({
      item,
      decision:
        item.decision === "PENDING" ? "CREATE" : (item.decision as ReviewDraft["decision"]),
      productId: item.matched_product_id || "",
      sellingPrice:
        item.approved_selling_price === null || item.approved_selling_price === undefined
          ? ""
          : String(item.approved_selling_price),
      category: item.approved_category || item.category || "UNCLASSIFIED",
      compatibility: item.approved_compatibility || item.compatibility || "UNCONFIRMED",
      notes: item.notes || "",
    });
    if (!products.length) {
      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        const json = await response.json();
        if (response.ok) {
          setProducts(
            (json.products || []).map((product: any) => ({
              id: product.id,
              name: product.name,
              sku: product.sku,
            })),
          );
        }
      } catch {
        // Matching a product is optional at this point; the row can still be created.
      }
    }
  }

  async function saveReview(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !selected) return;
    clearErrors();
    setBusy("review");
    try {
      const response = await fetch("/api/imports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          import_id: selected.id,
          action: "item",
          item_id: draft.item.id,
          decision: draft.decision,
          product_id: draft.decision === "MATCH" ? draft.productId || null : null,
          selling_price: draft.sellingPrice.trim() === "" ? null : Number(draft.sellingPrice),
          category: draft.category || null,
          compatibility: draft.compatibility || null,
          review_status: draft.decision === "SKIP" ? "SKIPPED" : "APPROVED",
          notes: draft.notes || null,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (json.migrationRequired) setMigrationRequired(true);
        throw new Error(json.error || "Could not save the review decision.");
      }
      setNotice(
        draft.decision === "SKIP"
          ? "Row skipped. It will not create stock."
          : "Row approved with the BOSS values.",
      );
      setDraft(null);
      await load(selected.id, false);
    } catch (err) {
      setError(errorMessage(err, "Could not save the review decision."));
    } finally {
      setBusy("");
    }
  }

  const active = selected && !["APPLIED", "CANCELLED"].includes(selected.status);
  const canApply = selected?.status === "APPROVED";

  return (
    <div className="space-y-4">
      {migrationRequired && (
        <div className="card border-amber-300/30 p-4 text-sm text-amber-100">
          <div className="flex items-center gap-2 font-semibold">
            <Database size={17} /> Migration 008 is not installed
          </div>
          <p className="mt-2 text-xs leading-6">
            Apply <code className="rounded bg-black/40 px-1">supabase/migrations/008_spare_parts_catalogue_import.sql</code>{" "}
            in the Supabase SQL editor, then reload this page. Until then, imports, price review and
            the public catalogue RPC are unavailable.
          </p>
        </div>
      )}

      {error && (
        <div className="card border-red-300/30 p-4 text-sm text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        </div>
      )}
      {notice && (
        <div className="card flex items-center gap-2 border-lime/30 p-4 text-sm text-lime">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="max-w-2xl">
            <div className="tag">BOSS ONLY · OPENING STOCK IMPORT</div>
            <h3 className="mt-1 text-xl font-bold">Spare-parts workbook import</h3>
            <p className="mt-2 text-xs leading-6 muted">
              The primary workbook creates opening stock once. The comparison workbook is used only
              to detect differences and is never imported as extra stock. Product names, quantities
              and purchase costs are kept exactly as supplied. Imported prices stay unpublished
              until BOSS confirms them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => load(selected?.id)}
              className="btn btn-ghost text-xs"
              disabled={loading || Boolean(busy)}
            >
              <RefreshCw size={14} /> Reload
            </button>
            {!active && (
              <button
                onClick={stageImport}
                className="btn btn-primary text-xs"
                disabled={Boolean(busy)}
              >
                {busy === "stage" ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                Read workbooks
              </button>
            )}
          </div>
        </div>

        {imports.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[.06] px-5 py-4">
            <span className="text-[11px] uppercase tracking-[.14em] muted">Import history</span>
            {imports.map((record) => (
              <button
                key={record.id}
                onClick={() => load(record.id)}
                className={`pill ${selected?.id === record.id ? "!border-lime !text-lime" : ""}`}
                title={record.primary_file}
              >
                {record.reference}
                <span className="text-[10px] opacity-70">{record.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && !selected ? (
        <div className="card flex items-center gap-3 p-8 text-sm muted">
          <Loader2 size={18} className="animate-spin" /> Loading import workspace…
        </div>
      ) : !selected ? (
        <div className="card p-8 text-center md:p-12">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-lime/10 text-lime">
            <FileSpreadsheet />
          </div>
          <h3 className="text-xl font-bold">No import has been staged yet</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 muted">
            Read the two supplied workbooks to create a review draft. Staging does not change
            products or stock. You can inspect every row and conflict before anything is approved
            or applied.
          </p>
          <button
            onClick={stageImport}
            className="btn btn-primary mx-auto mt-6 text-xs"
            disabled={Boolean(busy)}
          >
            {busy === "stage" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Read spare-parts workbooks
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold">{selected.reference}</h3>
                  <span className={statusBadge(selected.status)}>{selected.status}</span>
                  {stats.openBlocking > 0 && (
                    <span className="badge badge-red">{stats.openBlocking} blocking conflicts</span>
                  )}
                </div>
                <p className="mt-1 text-xs muted">
                  Primary source: {selected.primary_file} · Created {formatDate(selected.created_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {active && (
                  <button onClick={cancelImport} className="btn btn-ghost text-xs" disabled={Boolean(busy)}>
                    <SkipForward size={14} /> Cancel import
                  </button>
                )}
                {active && (
                  <button
                    onClick={approveAll}
                    className="btn btn-ghost text-xs"
                    disabled={Boolean(busy)}
                  >
                    {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
                    Approve clean rows
                  </button>
                )}
                <button
                  onClick={applyImport}
                  className="btn btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={Boolean(busy) || !canApply}
                  title={canApply ? "Apply approved opening stock" : "Approve the import first"}
                >
                  {busy === "apply" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  Apply opening stock
                </button>
              </div>
            </div>

            <div className="grid gap-3 border-t border-white/[.06] p-5 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Primary rows", value: String(stats.primary), sub: "Create opening stock" },
                { label: "Approved", value: String(stats.approved), sub: "Ready to apply" },
                { label: "Needs review", value: String(stats.needsReview), sub: "Not applied yet" },
                { label: "Skipped / applied", value: `${stats.skipped} / ${stats.applied}`, sub: "Rows without new stock" },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-white/[.07] bg-white/[.02] p-4">
                  <div className="text-[10px] uppercase tracking-[.16em] muted">{card.label}</div>
                  <div className="stat mt-2 text-2xl">{card.value}</div>
                  <div className="mt-1 text-[10px] muted">{card.sub}</div>
                </div>
              ))}
            </div>

            {selected.status === "REVIEW" && (
              <div className="flex flex-wrap items-center gap-3 border-t border-white/[.06] px-5 py-4 text-xs">
                <label className="flex items-center gap-2 muted">
                  <input
                    type="checkbox"
                    checked={includeBlocking}
                    onChange={(event) => setIncludeBlocking(event.target.checked)}
                  />
                  Include rows that still have blocking conflicts
                </label>
                <span className="text-[11px] text-amber-200/90">
                  Leave this off unless every flagged row has been checked manually.
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="card p-5">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={17} className="lime" />
                <h3 className="font-bold">Primary workbook</h3>
              </div>
              <p className="mt-1 break-all text-xs muted">{selected.primary_file}</p>
              {primarySource ? (
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <Metric label="Rows read" value={String(primarySource.records)} />
                  <Metric label="Units" value={String(primarySource.units)} />
                  <Metric label="Computed purchase value" value={money(primarySource.purchaseValue)} />
                  <Metric label="Workbook stock value" value={money(primarySource.workbookStockValue)} />
                </div>
              ) : (
                <p className="mt-3 text-xs muted">Source summary is not available for this import.</p>
              )}
              <p className="mt-4 text-[11px] leading-5 muted">
                Opening batches use quantity × purchase cost. Any difference from the workbook
                stock-value column is preserved as a conflict for review.
              </p>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2">
                <ShieldAlert size={17} className="lime" />
                <h3 className="font-bold">Comparison workbook</h3>
              </div>
              <p className="mt-1 break-all text-xs muted">{comparisonSource?.fileName || "—"}</p>
              {comparisonSource ? (
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <Metric label="Rows read" value={String(comparisonSource.records)} />
                  <Metric label="Units" value={String(comparisonSource.units)} />
                  <Metric label="Computed purchase value" value={money(comparisonSource.purchaseValue)} />
                  <Metric label="Workbook stock value" value={money(comparisonSource.workbookStockValue)} />
                </div>
              ) : (
                <p className="mt-3 text-xs muted">No comparison summary was staged.</p>
              )}
              <p className="mt-4 text-[11px] leading-5 muted">
                Never added to stock. Used to flag name variants, cost differences and quantity
                differences between the two supplied files.
              </p>
            </div>
          </div>

          {(summary.classificationNotice || summary.priceNotice) && (
            <div className="card border-amber-300/25 p-5">
              <div className="flex items-center gap-2 text-amber-100">
                <AlertTriangle size={17} />
                <h3 className="font-bold">Classification and price review notice</h3>
              </div>
              {summary.classificationNotice && (
                <p className="mt-3 text-xs leading-6 text-amber-50/90">{summary.classificationNotice}</p>
              )}
              {summary.priceNotice && (
                <p className="mt-2 text-xs leading-6 text-amber-50/90">{summary.priceNotice}</p>
              )}
            </div>
          )}

          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h3 className="font-bold">Source rows</h3>
                <p className="mt-1 text-xs muted">
                  {filteredItems.length} of {items.length} staged rows · {comparisonItems.length}{" "}
                  comparison rows are never imported.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                  <Search size={15} className="muted" />
                  <input
                    className="w-44 bg-transparent text-sm outline-none"
                    placeholder="Name, reference, SKU…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search staged rows"
                  />
                </div>
                <select
                  className="field w-auto text-xs"
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}
                  aria-label="Filter by workbook"
                >
                  <option value="ALL">Both workbooks</option>
                  <option value="PRIMARY">Primary only</option>
                  <option value="COMPARISON">Comparison only</option>
                </select>
                <select
                  className="field w-auto text-xs"
                  value={reviewFilter}
                  onChange={(event) => setReviewFilter(event.target.value as typeof reviewFilter)}
                  aria-label="Filter by review state"
                >
                  <option value="ALL">All review states</option>
                  <option value="NEEDS_REVIEW">Needs review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="SKIPPED">Skipped</option>
                  <option value="BLOCKING">Blocking conflicts</option>
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ROW</th>
                    <th>SUPPLIED NAME</th>
                    <th>QTY</th>
                    <th>PURCHASE COST</th>
                    <th>WORKBOOK STOCK VALUE</th>
                    <th>POTENTIAL SALES VALUE</th>
                    <th>DECISION</th>
                    <th>PRICE</th>
                    <th>CATEGORY / COMPATIBILITY</th>
                    <th>REVIEW</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const isComparison = item.source_role === "COMPARISON";
                    return (
                      <tr key={item.id} className={isComparison ? "opacity-60" : ""}>
                        <td className="whitespace-nowrap text-[11px]">
                          <div className="font-semibold">{item.source_row}</div>
                          <div className="muted">{isComparison ? "COMPARE" : "PRIMARY"}</div>
                        </td>
                        <td className="min-w-[220px]">
                          <div className="font-semibold">{item.original_name}</div>
                          <div className="text-[10px] muted">
                            {item.original_reference || item.proposed_sku || "No reference"}
                            {item.original_model ? ` · ${item.original_model}` : ""}
                          </div>
                          {item.has_blocking_conflict && (
                            <span className="badge badge-red mt-2">BLOCKING CONFLICT</span>
                          )}
                        </td>
                        <td>{item.quantity ?? "—"}</td>
                        <td className="whitespace-nowrap text-xs">
                          {item.unit_cost === null ? "—" : money(item.unit_cost)}
                        </td>
                        <td className="whitespace-nowrap text-xs">
                          {item.stock_purchase_value === null ? "—" : money(item.stock_purchase_value)}
                          {item.recalculated_stock_value !== null &&
                            item.stock_purchase_value !== null &&
                            Number(item.recalculated_stock_value) !== Number(item.stock_purchase_value) && (
                              <div className="text-[10px] text-amber-300">
                                computed {money(item.recalculated_stock_value)}
                              </div>
                            )}
                        </td>
                        <td className="whitespace-nowrap text-xs">
                          {item.potential_sales_value === null
                            ? "—"
                            : money(item.potential_sales_value)}
                          <div className="text-[10px] muted">Not a unit price</div>
                        </td>
                        <td className="text-xs">{item.decision}</td>
                        <td className="whitespace-nowrap text-xs">
                          {item.approved_selling_price !== null ? (
                            money(item.approved_selling_price)
                          ) : (
                            <span className="badge badge-warn">NEEDS REVIEW</span>
                          )}
                        </td>
                        <td className="min-w-[160px] text-xs">
                          <div>{item.approved_category || item.category}</div>
                          <div className="mt-1 text-[10px] muted">
                            {item.approved_compatibility || item.compatibility}
                          </div>
                        </td>
                        <td>
                          <span className={reviewBadge(item)}>{item.review_status}</span>
                        </td>
                        <td>
                          <button
                            className="pill"
                            onClick={() => openReview(item)}
                            disabled={!active || isComparison}
                            title={
                              isComparison
                                ? "Comparison rows are evidence only and are never applied"
                                : "Review this row"
                            }
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filteredItems.length && (
                <p className="p-6 text-sm muted">No staged rows match these filters.</p>
              )}
            </div>
          </div>

          <div className="card">
            <button
              onClick={() => setShowConflicts((value) => !value)}
              className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left"
            >
              <div>
                <h3 className="font-bold">Conflict register ({conflicts.length})</h3>
                <p className="mt-1 text-xs muted">
                  Nothing is discarded. Blocking conflicts are listed first; mark a conflict reviewed
                  after checking the source rows.
                </p>
              </div>
              <span className="pill">{showConflicts ? "Hide" : "Show"}</span>
            </button>

            {showConflicts && (
              <>
                <div className="flex flex-wrap gap-2 border-t border-white/[.06] px-5 py-4">
                  {conflictCounts.length ? (
                    conflictCounts.map(([type, count]) => (
                      <span key={type} className="pill">
                        {type} · {count}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs muted">No unresolved conflicts.</span>
                  )}
                </div>
                <div className="max-h-[520px] overflow-y-auto border-t border-white/[.06]">
                  {conflictGroups.map((conflict) => (
                    <div
                      key={conflict.id}
                      className={`border-b border-white/[.055] p-5 ${
                        conflict.resolved ? "opacity-55" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={severityBadge(conflict.severity)}>{conflict.severity}</span>
                        <span className="text-xs font-semibold">{conflict.conflict_type}</span>
                        {conflict.source_row !== null && (
                          <span className="text-[10px] muted">
                            {conflict.source_file} · row {conflict.source_row}
                          </span>
                        )}
                        {conflict.resolved && <span className="badge">REVIEWED</span>}
                      </div>
                      <p className="mt-2 text-xs leading-6">{conflict.detail}</p>
                      {conflict.comparison_row !== null && (
                        <p className="mt-1 text-[10px] muted">
                          Compared with {conflict.comparison_file} row {conflict.comparison_row}
                        </p>
                      )}
                      {!conflict.resolved && active && (
                        <button
                          onClick={() => resolveConflict(conflict)}
                          className="pill mt-3"
                          disabled={Boolean(busy)}
                        >
                          {busy === conflict.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={12} />
                          )}
                          Mark as reviewed
                        </button>
                      )}
                      {conflict.resolved && conflict.resolution && (
                        <p className="mt-2 text-[10px] text-lime">{conflict.resolution}</p>
                      )}
                    </div>
                  ))}
                  {!conflictGroups.length && (
                    <p className="p-6 text-sm muted">No conflicts were recorded for this import.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {selected.report && (
            <div className="card border-lime/25 p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={17} className="lime" />
                <h3 className="font-bold">Import report</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Records imported", selected.report.records_imported],
                  ["Products created", selected.report.products_created],
                  ["Products matched", selected.report.products_matched],
                  ["Batches created", selected.report.inventory_batches_created],
                  ["Movements created", selected.report.stock_movements_created],
                  ["Units imported", selected.report.units_imported],
                  ["Purchase value", money(selected.report.purchase_value_imported)],
                  ["Still needing review", selected.report.records_requiring_review],
                ].map(([label, value]) => (
                  <Metric key={String(label)} label={String(label)} value={String(value ?? "—")} />
                ))}
              </div>
              {Array.isArray(selected.report.errors) && selected.report.errors.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-300/30 bg-red-300/5 p-3 text-xs text-red-200">
                  <b>Rows that could not be applied</b>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {selected.report.errors.map((entry: any, index: number) => (
                      <li key={index}>
                        Row {entry.source_row}: {entry.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-4 text-[11px] muted">
                Applied {formatDate(selected.report.applied_at)}. A repeated apply cannot duplicate
                these opening batches because each source row has a unique import key.
              </p>
            </div>
          )}
        </>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={saveReview} className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="tag">BOSS REVIEW · ROW {draft.item.source_row}</div>
                <h3 className="mt-1 text-xl font-bold">{draft.item.original_name}</h3>
                <p className="mt-1 text-xs muted">
                  {draft.item.source_file} · {draft.item.source_role}
                </p>
              </div>
              <button type="button" onClick={() => setDraft(null)} aria-label="Close">
                <X />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-300/30 bg-red-300/5 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="mb-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Metric label="Quantity" value={String(draft.item.quantity ?? "—")} />
              <Metric
                label="Purchase cost"
                value={draft.item.unit_cost === null ? "—" : money(draft.item.unit_cost)}
              />
              <Metric
                label="Workbook stock value"
                value={
                  draft.item.stock_purchase_value === null
                    ? "—"
                    : money(draft.item.stock_purchase_value)
                }
              />
              <Metric
                label="Potential sales value"
                value={
                  draft.item.potential_sales_value === null
                    ? "—"
                    : money(draft.item.potential_sales_value)
                }
              />
            </div>

            <p className="mb-5 rounded-lg border border-amber-300/25 bg-amber-300/5 p-3 text-[11px] leading-5 text-amber-100">
              Potential sales value is not a unit selling price and is not used here. Leave the
              selling price blank to publish the product as <b>PRICE NEEDS REVIEW</b>; only a BOSS
              can confirm a price.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {draft.item.has_blocking_conflict && (
                <div className="rounded-lg border border-red-300/30 bg-red-300/5 p-3 text-xs text-red-200 sm:col-span-2">
                  This row has blocking conflicts. Review the conflict register before approving it.
                </div>
              )}

              <label className="text-xs muted">
                Decision
                <select
                  className="field mt-2"
                  value={draft.decision}
                  onChange={(event) =>
                    setDraft({ ...draft, decision: event.target.value as ReviewDraft["decision"] })
                  }
                >
                  {DECISIONS.map((decision) => (
                    <option key={decision} value={decision}>
                      {decision}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs muted">
                Confirmed selling price (RWF)
                <input
                  className="field mt-2"
                  type="number"
                  min="1"
                  step="1"
                  value={draft.sellingPrice}
                  onChange={(event) => setDraft({ ...draft, sellingPrice: event.target.value })}
                  placeholder="Blank = price needs review"
                />
              </label>

              {draft.decision === "MATCH" && (
                <label className="text-xs muted sm:col-span-2">
                  Existing product to match
                  <select
                    className="field mt-2"
                    value={draft.productId}
                    onChange={(event) => setDraft({ ...draft, productId: event.target.value })}
                    required
                  >
                    <option value="">Select a product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.sku}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[10px] muted">
                    MATCH adds a new opening batch to an existing product. It never creates a second
                    product record.
                  </span>
                </label>
              )}

              <label className="text-xs muted">
                Category
                <input
                  className="field mt-2"
                  list="import-categories"
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  placeholder="UNCLASSIFIED"
                />
                <datalist id="import-categories">
                  {Array.from(new Set(items.map((item) => item.category).filter(Boolean))).map(
                    (category) => (
                      <option key={category} value={category} />
                    ),
                  )}
                </datalist>
              </label>

              <label className="text-xs muted">
                Compatibility
                <select
                  className="field mt-2"
                  value={draft.compatibility}
                  onChange={(event) => setDraft({ ...draft, compatibility: event.target.value })}
                >
                  {COMPATIBILITY.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs muted sm:col-span-2">
                BOSS note
                <textarea
                  className="field mt-2 min-h-20"
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  placeholder="Why this decision was made (kept with the import record)"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="btn btn-ghost text-xs">
                Cancel
              </button>
              <button type="submit" disabled={Boolean(busy)} className="btn btn-primary text-xs">
                {busy === "review" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ClipboardCheck size={14} />
                )}
                {draft.decision === "SKIP" ? "Skip row" : "Save decision"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[.07] bg-white/[.02] px-3 py-2">
      <div className="text-[9px] uppercase tracking-[.14em] muted">{label}</div>
      <div className="mt-1 break-words text-xs font-semibold">{value}</div>
    </div>
  );
}
