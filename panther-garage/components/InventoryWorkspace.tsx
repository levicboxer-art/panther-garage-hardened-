"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import ProductImage from "@/components/ProductImage";
import { createClient } from "@/lib/supabase/client";

type Role = "BOSS" | "EMPLOYEE";

type InventoryRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  description: string | null;
  compatibility: string | null;
  unit: string | null;
  image_url: string | null;
  keywords: string | null;
  selling_price: number | string;
  price_status?: string | null;
  minimum_stock: number | string;
  active: boolean;
  stock: number;
  available_stock: number;
  reserved_stock?: number;
  purchase_cost?: number | null;
  stock_value?: number | null;
  supplier?: string | null;
  last_stock_update?: string | null;
  status?: string;
};

type FormState = {
  mode: "create" | "edit";
  id?: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  description: string;
  keywords: string;
  compatibility: string;
  unit: string;
  minimum_stock: string;
  selling_price: string;
  active: boolean;
};

const COMPATIBILITY = ["UNCONFIRMED", "SPIRO ELECTRIC", "AMPERSAND ELECTRIC", "FUEL-POWERED", "UNIVERSAL"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_SIGNATURES = {
  "image/jpeg": (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes: Uint8Array) =>
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
  "image/webp": (bytes: Uint8Array) =>
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
} as const;
const IMAGE_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const blankForm: FormState = {
  mode: "create",
  name: "",
  sku: "",
  category: "UNCLASSIFIED",
  brand: "",
  description: "",
  keywords: "",
  compatibility: "UNCONFIRMED",
  unit: "piece",
  minimum_stock: "0",
  selling_price: "",
  active: true,
};

function statusClass(status: string) {
  if (status === "IN STOCK") return "badge";
  if (status === "LOW STOCK") return "badge badge-warn";
  if (status === "RESERVED") return "badge badge-warn";
  return "badge badge-red";
}

function publicImagePath(url: string | null | undefined) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/product-images/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

export default function InventoryWorkspace({
  role,
  onChanged,
}: {
  role: Role;
  onChanged?: () => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [compatibility, setCompatibility] = useState("All");
  const [status, setStatus] = useState("All");
  const [legacySchema, setLegacySchema] = useState(false);

  const [form, setForm] = useState<FormState | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [receiptRow, setReceiptRow] = useState<InventoryRow | null>(null);
  const [receiptQuantity, setReceiptQuantity] = useState("1");
  const [receiptCost, setReceiptCost] = useState("0");
  const [receiptReference, setReceiptReference] = useState("");

  const canEdit = role === "BOSS";

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load inventory.");
      setRows(json.products || []);
      setLegacySchema(Boolean(json.detail === false));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => row.category || "UNCLASSIFIED").filter(Boolean)),
      ).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const haystack = [
        row.name,
        row.sku,
        row.category,
        row.compatibility,
        row.brand,
        row.description,
        row.keywords,
        row.supplier,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const rowStatus = row.status || "";
      return (
        (!term || haystack.includes(term)) &&
        (category === "All" || (row.category || "UNCLASSIFIED") === category) &&
        (compatibility === "All" || (row.compatibility || "UNCONFIRMED") === compatibility) &&
        (status === "All" || rowStatus === status) &&
        (status !== "INACTIVE" || row.active === false || rowStatus === "INACTIVE")
      );
    });
  }, [rows, query, category, compatibility, status]);

  const totals = useMemo(
    () => ({
      products: rows.length,
      units: rows.reduce((sum, row) => sum + Number(row.stock || 0), 0),
      value: rows.reduce((sum, row) => sum + Number(row.stock_value || 0), 0),
      low: rows.filter(
        (row) => row.status === "LOW STOCK" || row.status === "OUT OF STOCK",
      ).length,
      priceReview: rows.filter(
        (row) => (row.price_status || "PRICE NEEDS REVIEW") !== "CONFIRMED",
      ).length,
    }),
    [rows],
  );

  function openCreate() {
    setForm({ ...blankForm });
    setExistingImage(null);
    setImageFile(null);
    setImagePreview("");
    setRemoveImage(false);
    setError("");
  }

  function openEdit(row: InventoryRow) {
    setForm({
      mode: "edit",
      id: row.id,
      name: row.name,
      sku: row.sku,
      category: row.category || "UNCLASSIFIED",
      brand: row.brand || "",
      description: row.description || "",
      keywords: row.keywords || "",
      compatibility: row.compatibility || "UNCONFIRMED",
      unit: row.unit || "piece",
      minimum_stock: String(row.minimum_stock ?? 0),
      selling_price:
        (row.price_status || "PRICE NEEDS REVIEW") === "CONFIRMED"
          ? String(row.selling_price ?? "")
          : "",
      active: row.active,
    });
    setExistingImage(row.image_url || null);
    setImageFile(null);
    setImagePreview("");
    setRemoveImage(false);
    setError("");
  }

  function closeForm() {
    setForm(null);
    setImageFile(null);
    setImagePreview("");
    setExistingImage(null);
    setRemoveImage(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function chooseImage(file: File | null) {
    setError("");
    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }
    if (!(file.type in IMAGE_SIGNATURES)) {
      setError("Use a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError("The image must be 5 MB or smaller.");
      return;
    }
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const signatureCheck = IMAGE_SIGNATURES[file.type as keyof typeof IMAGE_SIGNATURES];
    if (!signatureCheck(bytes)) {
      setError("The selected file is not a valid JPG, PNG or WebP image.");
      setImageFile(null);
      setImagePreview("");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  }

  async function uploadImage(file: File) {
    const extension = IMAGE_EXTENSIONS[file.type as keyof typeof IMAGE_EXTENSIONS];
    if (!extension || !(file.type in IMAGE_SIGNATURES) || file.size > MAX_IMAGE_SIZE) {
      throw new Error("The selected image is invalid or too large.");
    }
    const path = `products/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
    if (uploadError) throw new Error(uploadError.message);
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  }

  async function removeStoredImage(url: string | null) {
    const path = publicImagePath(url);
    if (!path) return;
    await supabase.storage.from("product-images").remove([path]);
  }

  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      let imageUrl = removeImage ? null : existingImage;
      let uploaded: string | null = null;
      if (imageFile) {
        uploaded = await uploadImage(imageFile);
        imageUrl = uploaded;
      }

      const payload: Record<string, any> = {
        name: form.name,
        category: form.category || "UNCLASSIFIED",
        brand: form.brand,
        description: form.description,
        keywords: form.keywords,
        compatibility: form.compatibility,
        unit: form.unit,
        minimum_stock: Number(form.minimum_stock || 0),
        image_url: imageUrl,
      };
      if (canEdit) {
        payload.selling_price =
          form.selling_price.trim() === "" ? 0 : Number(form.selling_price);
      }

      if (form.mode === "create") {
        payload.sku = form.sku;
        const response = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not create the product.");
        setNotice("Product registered. Stock stays zero until goods are received.");
      } else {
        payload.id = form.id;
        payload.active = form.active;
        const response = await fetch("/api/products", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not update the product.");
        if (uploaded && existingImage) await removeStoredImage(existingImage);
        if (removeImage && existingImage) await removeStoredImage(existingImage);
        setNotice("Product details saved.");
      }
      closeForm();
      await load(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the product.");
    } finally {
      setSaving(false);
    }
  }

  async function receiveStock(event: React.FormEvent) {
    event.preventDefault();
    if (!receiptRow) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/inventory/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: receiptRow.id,
          quantity: Number(receiptQuantity),
          unit_cost: Number(receiptCost),
          receipt_reference: receiptReference || null,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Goods receipt failed.");
      setReceiptRow(null);
      setReceiptQuantity("1");
      setReceiptCost("0");
      setReceiptReference("");
      setNotice("Goods receipt posted. A FIFO batch and stock movement were created.");
      await load(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Goods receipt failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Products", value: String(totals.products), sub: "Same records as the public catalogue", icon: Boxes },
          { label: "Physical units", value: String(totals.units), sub: "From FIFO batch balances", icon: CheckCircle2 },
          // Purchase value is supplier-cost data: owner-only (the API already
          // strips the underlying fields for employee sessions).
          ...(canEdit
            ? [{ label: "Stock purchase value", value: money(totals.value), sub: "Quantity × batch cost", icon: Truck }]
            : []),
          { label: "Need attention", value: String(totals.low + totals.priceReview), sub: `${totals.low} stock · ${totals.priceReview} prices`, icon: ShieldCheck },
        ].map((card) => (
          <div key={card.label} className="card p-5">
            <div className="flex items-center justify-between text-xs muted">
              <span>{card.label}</span>
              <card.icon size={17} className="lime" />
            </div>
            <div className="stat mt-3 break-words text-2xl">{card.value}</div>
            <div className="mt-2 text-[11px] muted">{card.sub}</div>
          </div>
        ))}
      </div>

      {legacySchema && (
        <div className="card border-amber-300/30 p-4 text-sm text-amber-100">
          Migration 008 has not been applied yet. Price review, compatibility and stock-value
          fields will appear after it is installed.
        </div>
      )}
      {notice && (
        <div className="card flex items-center gap-2 border-lime/30 p-4 text-sm text-lime">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}
      {error && !form && !receiptRow && (
        <div className="card border-red-300/30 p-4 text-sm text-red-200">{error}</div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h3 className="font-bold">Product & stock register</h3>
            <p className="mt-1 text-xs muted">
              One set of product records for customers and staff. Costs and internal stock stay
              private.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => load()} className="btn btn-ghost text-xs" disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </button>
            {canEdit && (
              <button onClick={openCreate} className="btn btn-primary text-xs">
                <Plus size={15} /> New product
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/[.06] px-5 py-4">
          <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
            <Search size={15} className="muted" />
            <input
              className="w-44 bg-transparent text-sm outline-none"
              placeholder="Name, SKU, category, compatibility…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="field w-auto text-xs"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
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
            value={compatibility}
            onChange={(event) => setCompatibility(event.target.value)}
            aria-label="Filter by compatibility"
          >
            <option value="All">All compatibility</option>
            {COMPATIBILITY.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="field w-auto text-xs"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            {["All", "IN STOCK", "LOW STOCK", "OUT OF STOCK", "RESERVED", "INACTIVE"].map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ),
            )}
          </select>
          <span className="self-center text-[11px] muted">
            {filtered.length} of {rows.length} records
          </span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PRODUCT</th>
                <th>CATEGORY / COMPATIBILITY</th>
                <th>ON HAND</th>
                <th>AVAILABLE</th>
                <th>RESERVED</th>
                {canEdit ? <th>PURCHASE COST</th> : null}
                <th>SELLING PRICE</th>
                {canEdit ? <th>STOCK VALUE</th> : null}
                <th>REORDER</th>
                <th>STATUS</th>
                {canEdit ? (
                  <>
                    <th>SUPPLIER</th>
                    <th>LAST UPDATE</th>
                  </>
                ) : null}
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const confirmed =
                  (row.price_status || "PRICE NEEDS REVIEW") === "CONFIRMED" &&
                  Number(row.selling_price) > 0;
                return (
                  <tr key={row.id}>
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
                        </div>
                      </div>
                    </td>
                    <td className="min-w-[160px] text-xs">
                      <div>{row.category || "UNCLASSIFIED"}</div>
                      <div className="mt-1 text-[10px] muted">{row.compatibility || "UNCONFIRMED"}</div>
                    </td>
                    <td>{row.stock}</td>
                    <td>{row.available_stock}</td>
                    <td className="muted">{row.reserved_stock ?? 0}</td>
                    {canEdit ? (
                      <td className="whitespace-nowrap text-xs">
                        {row.purchase_cost == null ? "—" : money(row.purchase_cost)}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap text-xs">
                      {confirmed ? (
                        money(row.selling_price)
                      ) : (
                        <span className="badge badge-warn">PRICE NEEDS REVIEW</span>
                      )}
                    </td>
                    {canEdit ? (
                      <td className="whitespace-nowrap text-xs">{money(row.stock_value)}</td>
                    ) : null}
                    <td className="muted">{row.minimum_stock}</td>
                    <td>
                      <span className={statusClass(row.status || "IN STOCK")}>
                        {row.status || "IN STOCK"}
                      </span>
                    </td>
                    {canEdit ? (
                      <>
                        <td className="text-xs muted">{row.supplier || "—"}</td>
                        <td className="whitespace-nowrap text-[11px] muted">
                          {row.last_stock_update
                            ? new Date(row.last_stock_update).toLocaleDateString()
                            : "—"}
                        </td>
                      </>
                    ) : null}
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {canEdit && (
                          <button
                            className="pill"
                            onClick={() => {
                              setReceiptRow(row);
                              setReceiptQuantity("1");
                              setReceiptCost(row.purchase_cost ? String(Math.round(row.purchase_cost)) : "0");
                              setReceiptReference("");
                              setError("");
                            }}
                          >
                            Receive
                          </button>
                        )}
                        {canEdit && (
                          <button className="pill" onClick={() => openEdit(row)}>
                            <Pencil size={12} /> Edit
                          </button>
                        )}
                        {!canEdit && <span className="tag">Read only</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="p-6 text-sm muted">
              {loading ? "Loading inventory…" : "No products match these filters."}
            </p>
          )}
        </div>
        <div className="border-t border-line p-4 text-[11px] muted">
          {canEdit
            ? "Stock is read from FIFO batch balances. Receiving goods creates a new costed batch and a stock movement. Direct quantity editing is disabled. Reservations are not yet used, so reserved quantity currently shows 0."
            : "Read-only staff view. Selling prices and availability are exactly what customers see; costs, suppliers and goods receiving are managed by the owner."}
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveProduct}
            className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="tag">{form.mode === "create" ? "NEW CATALOGUE RECORD" : "EDIT PRODUCT"}</div>
                <h3 className="mt-1 text-xl font-bold">
                  {form.mode === "create" ? "Register a product" : form.name}
                </h3>
                <p className="mt-1 text-xs muted">
                  Product registration never increases stock. Receive goods separately.
                </p>
              </div>
              <button type="button" onClick={closeForm} aria-label="Close">
                <X />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-300/30 bg-red-300/5 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-4">
                  <ProductImage
                    src={imagePreview || (removeImage ? null : existingImage)}
                    alt="Product preview"
                    className="h-32 w-32 rounded-xl border border-white/[.08]"
                  />
                  <div className="min-w-[220px] flex-1">
                    <label className="text-xs muted">Product photograph (optional)</label>
                    <input
                      ref={fileRef}
                      className="field mt-2"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => chooseImage(event.target.files?.[0] || null)}
                    />
                    <p className="mt-2 text-[10px] muted">
                      JPG, PNG or WebP · maximum 5 MB. A placeholder is shown when no photograph
                      exists.
                    </p>
                    {(existingImage || imagePreview) && (
                      <button
                        type="button"
                        className="pill mt-3"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview("");
                          setRemoveImage(true);
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                      >
                        <Trash2 size={12} /> Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <label className="text-xs muted sm:col-span-2">
                Exact product name
                <input
                  className="field mt-2"
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>

              <label className="text-xs muted">
                Internal SKU / reference
                <input
                  className="field mt-2"
                  value={form.sku}
                  disabled={form.mode === "edit"}
                  placeholder={form.mode === "create" ? "Generated if left blank" : ""}
                  onChange={(event) => setForm({ ...form, sku: event.target.value })}
                />
              </label>

              <label className="text-xs muted">
                Category
                <input
                  className="field mt-2"
                  list="inventory-categories"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="UNCLASSIFIED"
                />
                <datalist id="inventory-categories">
                  {categories.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>

              <label className="text-xs muted">
                Motorcycle compatibility
                <select
                  className="field mt-2"
                  value={form.compatibility}
                  onChange={(event) => setForm({ ...form, compatibility: event.target.value })}
                >
                  {COMPATIBILITY.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs muted">
                Unit
                <input
                  className="field mt-2"
                  value={form.unit}
                  onChange={(event) => setForm({ ...form, unit: event.target.value })}
                />
              </label>

              <label className="text-xs muted">
                Brand / supplier note
                <input
                  className="field mt-2"
                  value={form.brand}
                  onChange={(event) => setForm({ ...form, brand: event.target.value })}
                />
              </label>

              <label className="text-xs muted">
                Reorder level (minimum stock)
                <input
                  className="field mt-2"
                  type="number"
                  min="0"
                  step="1"
                  value={form.minimum_stock}
                  onChange={(event) => setForm({ ...form, minimum_stock: event.target.value })}
                />
              </label>

              {canEdit && (
                <label className="text-xs muted">
                  Selling price (RWF)
                  <input
                    className="field mt-2"
                    type="number"
                    min="0"
                    step="1"
                    value={form.selling_price}
                    onChange={(event) => setForm({ ...form, selling_price: event.target.value })}
                    placeholder="Leave blank for PRICE NEEDS REVIEW"
                  />
                </label>
              )}

              {!canEdit && (
                <div className="rounded-lg border border-white/[.08] p-3 text-xs muted">
                  A BOSS must enter and approve the selling price. Your product will be saved with
                  PRICE NEEDS REVIEW.
                </div>
              )}

              <label className="text-xs muted sm:col-span-2">
                Description
                <textarea
                  className="field mt-2 min-h-20"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </label>

              <label className="text-xs muted sm:col-span-2">
                Search keywords
                <input
                  className="field mt-2"
                  value={form.keywords}
                  onChange={(event) => setForm({ ...form, keywords: event.target.value })}
                  placeholder="Optional customer search words"
                />
              </label>

              {form.mode === "edit" && canEdit && (
                <label className="flex items-center gap-3 text-xs muted sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm({ ...form, active: event.target.checked })}
                  />
                  Active in the public catalogue
                </label>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeForm} className="btn btn-ghost text-xs">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary text-xs">
                <ImagePlus size={14} />
                {saving ? "Saving…" : form.mode === "create" ? "Save product" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {receiptRow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={receiveStock} className="card w-full max-w-md p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="tag">GOODS RECEIPT</div>
                <h3 className="mt-1 text-xl font-bold">Receive stock</h3>
                <p className="mt-1 text-xs muted">{receiptRow.name}</p>
              </div>
              <button type="button" onClick={() => setReceiptRow(null)} aria-label="Close">
                <X />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-300/30 bg-red-300/5 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <label className="text-xs muted">
              Quantity received
              <input
                className="field mt-2 mb-4"
                type="number"
                min="1"
                step="1"
                required
                value={receiptQuantity}
                onChange={(event) => setReceiptQuantity(event.target.value)}
              />
            </label>
            <label className="text-xs muted">
              Purchase cost per unit (RWF)
              <input
                className="field mt-2 mb-4"
                type="number"
                min="0"
                step="1"
                required
                value={receiptCost}
                onChange={(event) => setReceiptCost(event.target.value)}
              />
            </label>
            <label className="text-xs muted">
              Receipt / invoice reference
              <input
                className="field mt-2 mb-4"
                value={receiptReference}
                onChange={(event) => setReceiptReference(event.target.value)}
                placeholder="Optional supplier reference"
              />
            </label>
            <p className="mb-4 text-[11px] muted">
              This posts a physical goods receipt. It creates a separate costed FIFO batch and a
              stock movement; it never edits the quantity directly.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReceiptRow(null)} className="btn btn-ghost text-xs">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary text-xs">
                {saving ? "Posting…" : "Post receipt"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
