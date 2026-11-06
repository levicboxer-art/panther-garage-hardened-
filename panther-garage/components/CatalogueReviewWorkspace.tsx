"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
} from "lucide-react";
import ProductImage from "@/components/ProductImage";

type Role = "BOSS" | "EMPLOYEE";

type ReviewRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  compatibility: string | null;
  selling_price: number | string | null;
  price_status?: string | null;
  stock: number;
  active: boolean;
  image_url?: string | null;
  purchase_cost?: number | null;
  status?: string;
};

type Draft = {
  category: string;
  compatibility: string;
  price: string;
};

const COMPATIBILITY = ["UNCONFIRMED", "SPIRO ELECTRIC", "AMPERSAND ELECTRIC", "FUEL-POWERED", "UNIVERSAL"];
const CATEGORY_FALLBACK = "UNCLASSIFIED";
const COMPATIBILITY_FALLBACK = "UNCONFIRMED";
const NO_CHANGE = "NO_CHANGE";

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function draftFromRow(row: ReviewRow): Draft {
  const confirmed =
    (row.price_status || "PRICE NEEDS REVIEW") === "CONFIRMED" &&
    Number(row.selling_price) > 0;
  return {
    category: row.category || CATEGORY_FALLBACK,
    compatibility: row.compatibility || COMPATIBILITY_FALLBACK,
    price: confirmed ? String(row.selling_price ?? "") : "",
  };
}

function savedPrice(row: ReviewRow) {
  return (row.price_status || "PRICE NEEDS REVIEW") === "CONFIRMED"
    ? Number(row.selling_price || 0)
    : 0;
}

function draftPrice(draft: Draft) {
  return draft.price.trim() === "" ? 0 : Number(draft.price);
}

function draftCategory(draft: Draft) {
  return draft.category.trim() || CATEGORY_FALLBACK;
}

function draftCompatibility(draft: Draft) {
  return draft.compatibility.trim() || COMPATIBILITY_FALLBACK;
}

function needsPrice(row: ReviewRow) {
  return savedPrice(row) <= 0;
}

function needsClassification(row: ReviewRow) {
  return (
    !row.category ||
    row.category === CATEGORY_FALLBACK ||
    !row.compatibility ||
    row.compatibility === COMPATIBILITY_FALLBACK
  );
}

export default function CatalogueReviewWorkspace({
  role,
  onChanged,
}: {
  role: Role;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [reviewState, setReviewState] = useState("Needs review");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [compatibilityFilter, setCompatibilityFilter] = useState("All");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkCompatibility, setBulkCompatibility] = useState(NO_CHANGE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [legacySchema, setLegacySchema] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load the catalogue.");
      const products: ReviewRow[] = json.products || [];
      setRows(products);
      setDrafts(
        Object.fromEntries(products.map((product) => [product.id, draftFromRow(product)])),
      );
      setSelected([]);
      setLegacySchema(Boolean(json.detail === false));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the catalogue.");
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const price = rows.filter(needsPrice).length;
    const classification = rows.filter(needsClassification).length;
    const ready = rows.filter(
      (row) => row.active && !needsPrice(row) && !needsClassification(row),
    ).length;
    return { total: rows.length, price, classification, ready };
  }, [rows]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) if (row.category) values.add(row.category);
    for (const draft of Object.values(drafts)) {
      const value = draft.category.trim();
      if (value) values.add(value);
    }
    return [...values].sort();
  }, [rows, drafts]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const haystack = [row.name, row.sku, row.category, row.compatibility]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesQuery = !term || haystack.includes(term);
      const priceMissing = needsPrice(row);
      const classMissing = needsClassification(row);
      const matchesReview =
        reviewState === "All" ||
        (reviewState === "Needs review" && (priceMissing || classMissing)) ||
        (reviewState === "Needs price" && priceMissing) ||
        (reviewState === "Needs classification" && classMissing) ||
        (reviewState === "Ready to publish" &&
          row.active &&
          !priceMissing &&
          !classMissing);
      const matchesCategory =
        categoryFilter === "All" || (row.category || CATEGORY_FALLBACK) === categoryFilter;
      const matchesCompatibility =
        compatibilityFilter === "All" ||
        (row.compatibility || COMPATIBILITY_FALLBACK) === compatibilityFilter;
      return matchesQuery && matchesReview && matchesCategory && matchesCompatibility;
    });
  }, [rows, query, reviewState, categoryFilter, compatibilityFilter]);

  const dirtyRows = useMemo(
    () =>
      rows.filter((row) => {
        const draft = drafts[row.id];
        if (!draft) return false;
        return (
          draftCategory(draft) !== (row.category || CATEGORY_FALLBACK) ||
          draftCompatibility(draft) !== (row.compatibility || COMPATIBILITY_FALLBACK) ||
          draftPrice(draft) !== savedPrice(row)
        );
      }),
    [rows, drafts],
  );

  const visibleIds = visible.map((row) => row.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const existing = current[id] || {
        category: CATEGORY_FALLBACK,
        compatibility: COMPATIBILITY_FALLBACK,
        price: "",
      };
      return { ...current, [id]: { ...existing, ...patch } };
    });
  }

  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function toggleAllVisible() {
    setSelected((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return [...new Set([...current, ...visibleIds])];
    });
  }

  function applyBulkClassification() {
    const category = bulkCategory.trim();
    if (!category && bulkCompatibility === NO_CHANGE) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const id of selected) {
        const draft = next[id];
        if (!draft) continue;
        next[id] = {
          ...draft,
          category: category || draft.category,
          compatibility:
            bulkCompatibility === NO_CHANGE ? draft.compatibility : bulkCompatibility,
        };
      }
      return next;
    });
    setBulkCategory("");
    setBulkCompatibility(NO_CHANGE);
    setNotice(
      `${selected.length} selected row(s) updated in this draft. Save changes to apply them.`,
    );
  }

  function resetRow(row: ReviewRow) {
    setDrafts((current) => ({ ...current, [row.id]: draftFromRow(row) }));
  }

  async function saveRows(target: ReviewRow[]) {
    const changed = target.filter((row) => {
      const draft = drafts[row.id];
      if (!draft) return false;
      return (
        draftCategory(draft) !== (row.category || CATEGORY_FALLBACK) ||
        draftCompatibility(draft) !== (row.compatibility || COMPATIBILITY_FALLBACK) ||
        draftPrice(draft) !== savedPrice(row)
      );
    });
    if (!changed.length) return;

    for (const row of changed) {
      const draft = drafts[row.id] ?? draftFromRow(row);
      const raw = draft.price;
      const price = draftPrice(draft);
      if (raw.trim() !== "" && (!Number.isFinite(price) || price < 0)) {
        setError(`Enter a valid selling price for ${row.name}.`);
        return;
      }
    }

    const updates = changed.map((row) => {
      const draft = drafts[row.id] ?? draftFromRow(row);
      const update: Record<string, unknown> = { id: row.id };
      if (draftCategory(draft) !== (row.category || CATEGORY_FALLBACK)) {
        update.category = draftCategory(draft);
      }
      if (draftCompatibility(draft) !== (row.compatibility || COMPATIBILITY_FALLBACK)) {
        update.compatibility = draftCompatibility(draft);
      }
      if (draftPrice(draft) !== savedPrice(row)) {
        update.selling_price = draftPrice(draft);
      }
      return update;
    });

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = await response.json();
      if (!response.ok && !json.updated) {
        throw new Error(json.error || "Could not save the catalogue changes.");
      }
      await load(false);
      onChanged?.();
      if (json.failed) {
        setError(
          `${json.failed} catalogue row(s) could not be saved. ${json.error || ""}`.trim(),
        );
      } else {
        setNotice(`${json.updated} catalogue record(s) saved.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the catalogue changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Products in review",
            value: String(stats.total),
            sub: "Active and inactive records",
            icon: Tag,
          },
          {
            label: "Needs price",
            value: String(stats.price),
            sub: "Not published until BOSS confirms",
            icon: BadgeCheck,
          },
          {
            label: "Needs classification",
            value: String(stats.classification),
            sub: "Category or compatibility unconfirmed",
            icon: Search,
          },
          {
            label: "Ready to publish",
            value: String(stats.ready),
            sub: "Active, classified and priced",
            icon: CheckCircle2,
          },
        ].map((card) => (
          <div key={card.label} className="card p-5">
            <div className="flex items-center justify-between text-xs muted">
              <span>{card.label}</span>
              <card.icon size={17} className="lime" />
            </div>
            <div className="stat mt-3 text-2xl">{card.value}</div>
            <div className="mt-2 text-[11px] muted">{card.sub}</div>
          </div>
        ))}
      </div>

      {legacySchema && (
        <div className="card border-amber-300/30 p-4 text-sm text-amber-100">
          Migration 008 has not been applied yet. Price review and compatibility fields will
          appear after it is installed.
        </div>
      )}
      {notice && (
        <div className="card flex items-center gap-2 border-lime/30 p-4 text-sm text-lime">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}
      {error && (
        <div className="card border-red-300/30 p-4 text-sm text-red-200">{error}</div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div>
            <h3 className="font-bold">Catalogue price &amp; classification review</h3>
            <p className="mt-1 max-w-3xl text-xs muted">
              Set confirmed selling prices, categories and compatibility. A saved price above zero
              is published immediately; a blank or zero price keeps the part at PRICE NEEDS REVIEW.
              Purchase costs never appear publicly.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => load()} className="btn btn-ghost text-xs" disabled={loading || saving}>
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={() => saveRows(dirtyRows)}
              className="btn btn-primary text-xs"
              disabled={saving || !dirtyRows.length}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {dirtyRows.length ? `Save changes (${dirtyRows.length})` : "Save changes"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/[.06] px-5 py-4">
          <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
            <Search size={15} className="muted" />
            <input
              className="w-52 bg-transparent text-sm outline-none"
              placeholder="Search name, SKU, category…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="field w-auto text-xs"
            value={reviewState}
            onChange={(event) => setReviewState(event.target.value)}
            aria-label="Filter by review state"
          >
            {[
              "All",
              "Needs review",
              "Needs price",
              "Needs classification",
              "Ready to publish",
            ].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="field w-auto text-xs"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Filter by category"
          >
            <option value="All">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="field w-auto text-xs"
            value={compatibilityFilter}
            onChange={(event) => setCompatibilityFilter(event.target.value)}
            aria-label="Filter by compatibility"
          >
            <option value="All">All compatibility</option>
            {COMPATIBILITY.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <span className="self-center text-[11px] muted">
            {`${visible.length} of ${rows.length} records`}
          </span>
          {dirtyRows.length > 0 && (
            <span className="self-center text-[11px] text-amber-300">
              {`${dirtyRows.length} unsaved change(s)`}
            </span>
          )}
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 border-t border-white/[.06] bg-lime/[.03] px-5 py-4">
            <div className="min-w-[150px]">
              <div className="text-xs font-semibold">Bulk classification</div>
              <div className="text-[11px] muted">{`${selected.length} selected`}</div>
            </div>
            <label className="text-xs muted">
              Category
              <input
                className="field mt-1 w-48 text-xs"
                list="catalogue-review-categories"
                value={bulkCategory}
                onChange={(event) => setBulkCategory(event.target.value)}
                placeholder="No change"
              />
            </label>
            <label className="text-xs muted">
              Compatibility
              <select
                className="field mt-1 w-48 text-xs"
                value={bulkCompatibility}
                onChange={(event) => setBulkCompatibility(event.target.value)}
              >
                <option value={NO_CHANGE}>No change</option>
                {COMPATIBILITY.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={applyBulkClassification}
              className="btn btn-primary text-xs"
              disabled={!bulkCategory.trim() && bulkCompatibility === NO_CHANGE}
            >
              Apply to selected
            </button>
            <button
              onClick={() => setSelected([])}
              className="btn btn-ghost text-xs"
            >
              Clear selection
            </button>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible products"
                  />
                </th>
                <th>PRODUCT</th>
                <th>CLASSIFICATION</th>
                <th>PURCHASE COST</th>
                <th>SELLING PRICE</th>
                <th>PRICE STATUS</th>
                <th>ON HAND</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const draft = drafts[row.id] || draftFromRow(row);
                const confirmed =
                  (row.price_status || "PRICE NEEDS REVIEW") === "CONFIRMED" &&
                  Number(row.selling_price) > 0;
                const dirty =
                  draftCategory(draft) !== (row.category || CATEGORY_FALLBACK) ||
                  draftCompatibility(draft) !== (row.compatibility || COMPATIBILITY_FALLBACK) ||
                  draftPrice(draft) !== savedPrice(row);
                return (
                  <tr key={row.id} className={dirty ? "bg-lime/[.03]" : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        aria-label={`Select ${row.name}`}
                      />
                    </td>
                    <td className="min-w-[220px]">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          src={row.image_url}
                          alt={row.name}
                          compact
                          className="h-11 w-11 shrink-0 rounded-lg border border-white/[.06]"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold">{row.name}</div>
                          <div className="text-[10px] muted">{row.sku}</div>
                          {!row.active && (
                            <div className="mt-1 text-[10px] text-red-300">INACTIVE</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="min-w-[230px] space-y-2">
                      <input
                        className="field w-full text-xs"
                        list="catalogue-review-categories"
                        value={draft.category}
                        placeholder="UNCLASSIFIED"
                        aria-label={`Category for ${row.name}`}
                        onChange={(event) =>
                          updateDraft(row.id, { category: event.target.value })
                        }
                      />
                      <select
                        className="field w-full text-xs"
                        value={draft.compatibility}
                        aria-label={`Compatibility for ${row.name}`}
                        onChange={(event) =>
                          updateDraft(row.id, { compatibility: event.target.value })
                        }
                      >
                        {COMPATIBILITY.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {row.purchase_cost == null ? "—" : money(row.purchase_cost)}
                    </td>
                    <td>
                      <input
                        className="field w-32 text-xs"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Price on request"
                        value={draft.price}
                        aria-label={`Selling price for ${row.name}`}
                        onChange={(event) => updateDraft(row.id, { price: event.target.value })}
                      />
                    </td>
                    <td>
                      <span className={confirmed ? "badge" : "badge badge-warn"}>
                        {confirmed ? "Confirmed" : "PRICE NEEDS REVIEW"}
                      </span>
                    </td>
                    <td>{row.stock}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {dirty && (
                          <button
                            className="pill"
                            onClick={() => saveRows([row])}
                            disabled={saving}
                          >
                            Save
                          </button>
                        )}
                        <button
                          className="pill"
                          onClick={() => resetRow(row)}
                          disabled={!dirty || saving}
                          title="Reset this row"
                        >
                          <RotateCcw size={12} /> Reset
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && (
            <p className="p-6 text-sm muted">
              {loading ? "Loading catalogue…" : "No products match this review filter."}
            </p>
          )}
        </div>

        <div className="border-t border-line p-4 text-[11px] muted">
          Saving a positive price publishes it to the public catalogue immediately. Blank or zero
          prices keep the part at PRICE NEEDS REVIEW. Categories, compatibility and prices are
          saved together; purchase costs and internal stock stay private.
        </div>
      </div>

      <datalist id="catalogue-review-categories">
        {categories.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </div>
  );
}
