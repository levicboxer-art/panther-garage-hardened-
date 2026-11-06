import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bike, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ProductImage from "@/components/ProductImage";
import PartRequest from "@/components/PartRequest";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";

type CatalogueProduct = {
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
  selling_price: number | string | null;
  price_status: string;
  availability: string | null;
  in_stock: boolean | null;
  updated_at: string | null;
};

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadProduct(id: string): Promise<CatalogueProduct | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_catalogue_product", { p_id: id });
  if (!error && data && data.length) {
    return data[0] as CatalogueProduct;
  }

  // Backward-compatible read until migration 008 is applied. Availability stays
  // unknown so the page never promises stock it cannot verify.
  const { data: legacy, error: legacyError } = await supabase
    .from("products")
    .select(
      "id,sku,name,category,brand,description,compatibility,unit,image_url,selling_price,updated_at",
    )
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (legacyError || !legacy) return null;

  return {
    ...(legacy as any),
    keywords: null,
    price_status:
      Number((legacy as any).selling_price) > 0 ? "CONFIRMED" : "PRICE NEEDS REVIEW",
    availability: null,
    in_stock: null,
  };
}

export default async function PartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const product = await loadProduct(id);
  if (!product) notFound();

  const confirmed =
    product.price_status === "CONFIRMED" && Number(product.selling_price) > 0;
  const outOfStock = product.in_stock === false || product.availability === "OUT OF STOCK";
  const canOrder = confirmed && !outOfStock;

  const availability = outOfStock
    ? "OUT OF STOCK"
    : product.availability || "CHECK AVAILABILITY";
  const availabilityClass = outOfStock
    ? "badge badge-red"
    : product.availability === "LOW STOCK" || !product.availability
      ? "badge badge-warn"
      : "badge";

  return (
    <main className="min-h-screen text-white">
      <header className="sticky top-0 z-30 border-b border-white/[.08] bg-[#070809]/65 backdrop-blur-2xl">
        <div className="container h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-lime text-black grid place-items-center">
              <Bike />
            </span>
            <span className="font-bold tracking-widest">
              PANTHER <span className="lime">GARAGE</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/#parts" aria-label="Back to parts" className="btn btn-ghost text-xs">
              <ArrowLeft size={14} /> <span className="hidden sm:inline">Back to parts</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="container py-10 md:py-14">
        <div className="text-xs muted mb-6">
          <Link href="/" className="navlink">
            Home
          </Link>{" "}
          /{" "}
          <Link href="/#parts" className="navlink">
            Spare parts
          </Link>{" "}
          / <span>{product.name}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="card overflow-hidden p-2">
              <ProductImage
                src={product.image_url}
                alt={product.name}
                className="h-[360px] w-full rounded-xl md:h-[460px]"
                imageClassName="rounded-xl"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div className="card p-4">
                <div className="text-[9px] uppercase tracking-[.16em] muted">SKU</div>
                <div className="mt-1 font-semibold">{product.sku}</div>
              </div>
              <div className="card p-4">
                <div className="text-[9px] uppercase tracking-[.16em] muted">Category</div>
                <div className="mt-1 font-semibold">{product.category || "UNCLASSIFIED"}</div>
              </div>
              <div className="card p-4">
                <div className="text-[9px] uppercase tracking-[.16em] muted">Compatibility</div>
                <div className="mt-1 font-semibold">{product.compatibility || "UNCONFIRMED"}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={availabilityClass}>{availability}</span>
              <span className="badge">{product.category || "UNCLASSIFIED"}</span>
            </div>
            <h1 className="display mt-4 text-4xl font-bold leading-tight md:text-5xl">
              {product.name}
            </h1>
            {product.brand && <p className="mt-2 text-sm muted">{product.brand}</p>}

            <div className="mt-6">
              {confirmed ? (
                <div>
                  <div className="text-[10px] uppercase tracking-[.18em] muted">Confirmed price</div>
                  <div className="stat mt-1 text-4xl">{money(product.selling_price)}</div>
                  <div className="mt-1 text-[11px] muted">
                    Per {product.unit || "piece"} · VAT treatment confirmed at the counter
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 p-4">
                  <div className="text-[10px] uppercase tracking-[.18em] text-amber-200">
                    Selling price not published
                  </div>
                  <div className="mt-2 text-xl font-bold text-amber-100">PRICE NEEDS REVIEW</div>
                  <p className="mt-2 text-xs leading-6 text-amber-50/85">
                    The garage has not confirmed this unit price yet. Ask for the current price
                    before ordering; the workbook&apos;s potential sales value is not used as a
                    selling price.
                  </p>
                </div>
              )}
            </div>

            <p className="mt-6 text-sm leading-7 text-gray-300">
              {product.description ||
                "This spare part is listed in the Panther Legacy Garage inventory. Contact the garage for fitment advice and current availability."}
            </p>

            {product.keywords && (
              <div className="mt-4 flex flex-wrap gap-2">
                {product.keywords
                  .split(/[,;]/)
                  .map((keyword) => keyword.trim())
                  .filter(Boolean)
                  .slice(0, 8)
                  .map((keyword) => (
                    <span key={keyword} className="pill">
                      {keyword}
                    </span>
                  ))}
              </div>
            )}

            <div className="mt-8 card p-5">
              <div className="mb-4 flex items-start gap-2 text-xs muted">
                <ShieldCheck size={16} className="lime shrink-0" />
                Requests are reviewed by garage staff. No cost, supplier or internal stock figure is
                shown on the public catalogue.
              </div>
              <PartRequest
                productId={product.id}
                productName={product.name}
                canOrder={canOrder}
              />
            </div>

            <div className="mt-4 text-[11px] muted">
              Last catalogue update:{" "}
              {product.updated_at ? new Date(product.updated_at).toLocaleDateString() : "—"}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
