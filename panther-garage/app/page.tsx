"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Bike,
  Wrench,
  ShieldCheck,
  ShoppingBag,
  Search,
  X,
  Plus,
  Minus,
  CheckCircle2,
  SlidersHorizontal,
  ImageOff,
  Home as HomeIcon,
  UserRound,
  Mail,
  Phone,
} from "lucide-react";
import ProductImage from "@/components/ProductImage";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ProductDropCard, type DropItem } from "@/components/ui/product-card-3";
import {
  LiquidNavbar,
  type LiquidNavItem,
} from "@/components/ui/liquid-glass-navbar";

const NAV_ITEMS: LiquidNavItem[] = [
  { label: "Home", href: "/", icon: <HomeIcon size={18} />, fx: "glow" },
  { label: "Spare parts", href: "#parts", icon: <Search size={18} />, fx: "spin" },
  { label: "Services", href: "#services", icon: <Wrench size={18} />, fx: "wave" },
  { label: "Portal", href: "/portal", icon: <UserRound size={18} />, fx: "pop" },
  { label: "Contact", href: "#contact", icon: <Mail size={18} />, fx: "drop" },
];

const NAV_STYLE = {
  "--n-fg": "#f4f7f5",
  "--n-fg-soft": "rgba(244,247,245,.68)",
  "--n-tint": "rgba(10,14,12,.4)",
  "--n-rim": "rgba(199,243,107,.3)",
} as CSSProperties;

type Product = {
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
  price_status: string | null;
  availability: string | null;
  in_stock: boolean | null;
  updated_at: string | null;
};

type SortKey = "name" | "price_asc" | "price_desc" | "recent" | "stock";

const money = (n: number) =>
  new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(n);

const priceConfirmed = (product: Product) =>
  (product.price_status || "") === "CONFIRMED" && Number(product.selling_price) > 0;

const isOutOfStock = (product: Product) =>
  product.in_stock === false || product.availability === "OUT OF STOCK";

const canOrder = (product: Product) => priceConfirmed(product) && !isOutOfStock(product);

const availabilityLabel = (product: Product) => {
  if (isOutOfStock(product)) return "OUT OF STOCK";
  if (!product.availability) return "CHECK AVAILABILITY";
  return product.availability;
};

const availabilityClass = (product: Product) => {
  if (isOutOfStock(product)) return "badge badge-red";
  if (product.availability === "LOW STOCK") return "badge badge-warn";
  if (!product.availability) return "badge badge-warn";
  return "badge";
};

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [migrationRequired, setMigrationRequired] = useState(false);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [compatibility, setCompatibility] = useState("All");
  const [availability, setAvailability] = useState("All");
  const [sort, setSort] = useState<SortKey>("name");
  const [showCart, setShowCart] = useState(false);
  const [toast, setToast] = useState("");

  const [order, setOrder] = useState(false);
  const [orderName, setOrderName] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [orderEmail, setOrderEmail] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderReference, setOrderReference] = useState("");

  useEffect(() => {
    fetch("/api/catalog", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not load the catalogue.");
        setProducts(json.products || []);
        if (json.migrationRequired) setMigrationRequired(true);
      })
      .catch((error) =>
        setLoadError(error instanceof Error ? error.message : "Could not load the catalogue."),
      )
      .finally(() => setLoading(false));
  }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  const categories = useMemo(
    () =>
      Array.from(
        new Set(products.map((p) => p.category).filter(Boolean) as string[]),
      ).sort(),
    [products],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = products.filter((product) => {
      const haystack = [
        product.name,
        product.sku,
        product.category,
        product.compatibility,
        product.brand,
        product.description,
        product.keywords,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!term || haystack.includes(term)) &&
        (category === "All" || (product.category || "UNCLASSIFIED") === category) &&
        (compatibility === "All" || (product.compatibility || "UNCONFIRMED") === compatibility) &&
        (availability === "All" ||
          (availability === "In stock" && !isOutOfStock(product)) ||
          (availability === "Out of stock" && isOutOfStock(product)))
      );
    });

    return [...rows].sort((a, b) => {
      switch (sort) {
        case "price_asc":
          return (
            (priceConfirmed(a) ? Number(a.selling_price) : Number.MAX_SAFE_INTEGER) -
            (priceConfirmed(b) ? Number(b.selling_price) : Number.MAX_SAFE_INTEGER)
          );
        case "price_desc":
          return (
            (priceConfirmed(b) ? Number(b.selling_price) : -1) -
            (priceConfirmed(a) ? Number(a.selling_price) : -1)
          );
        case "recent":
          return (
            new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
          );
        case "stock":
          return Number(!isOutOfStock(b)) - Number(!isOutOfStock(a)) || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [products, search, category, compatibility, availability, sort]);

  const cartProducts = products.filter((product) => (cart[product.id] || 0) > 0 && canOrder(product));

  // Map the filtered spare parts into the carousel's drop-item shape:
  // time -> availability, name -> part name, collection -> category.
  // Only staff-uploaded photos are shown; unpriced parts read "Price on request".
  const dropItems: DropItem[] = useMemo(
    () =>
      filtered.map((product) => ({
        time: availabilityLabel(product),
        name: product.name,
        collection: product.category || "UNCLASSIFIED",
        imageSrc: product.image_url || undefined,
        price: priceConfirmed(product)
          ? money(Number(product.selling_price))
          : "Price on request",
        href: `/parts/${product.id}`,
        addable: canOrder(product),
      })),
    [filtered],
  );
  const count = cartProducts.reduce((sum, product) => sum + (cart[product.id] || 0), 0);
  const total = cartProducts.reduce(
    (sum, product) => sum + Number(product.selling_price || 0) * (cart[product.id] || 0),
    0,
  );

  function add(id: string) {
    const product = products.find((item) => item.id === id);
    if (!product || !canOrder(product)) {
      notify(
        product && !priceConfirmed(product)
          ? "This price still needs confirmation."
          : "This part is currently out of stock.",
      );
      return;
    }
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
    notify("Added to your request list");
  }

  function decrement(id: string) {
    setCart((current) => {
      const next = { ...current, [id]: Math.max(0, (current[id] || 0) - 1) };
      if (!next[id]) delete next[id];
      return next;
    });
  }

  async function submitOrder(event: React.FormEvent) {
    event.preventDefault();
    setOrderBusy(true);
    setOrderError("");
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: orderName,
          phone: orderPhone,
          email: orderEmail,
          delivery_note: orderNote,
          items: cartProducts.map((product) => ({
            product_id: product.id,
            quantity: cart[product.id],
          })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not submit order.");
      setOrderReference(j.order_reference);
      setCart({});
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Order submission failed.");
    } finally {
      setOrderBusy(false);
    }
  }

  return (
    <main>
      <header className="border-b border-white/[.08] sticky top-0 z-30 bg-[#070809]/65 backdrop-blur-2xl shadow-[0_20px_60px_-40px_rgba(0,0,0,.9)]">
        <div className="container h-[76px] flex items-center justify-between">
          <a href="#" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-lime text-black grid place-items-center">
              <Bike />
            </div>
            <div>
              <div className="font-bold tracking-[.16em] text-sm">
                PANTHER <span className="lime">LEGACY</span> GARAGE
              </div>
              <div className="text-[9px] tracking-[.25em] text-gray-500 whitespace-nowrap">
                PARTS • SERVICE • PERFORMANCE
              </div>
            </div>
          </a>
          <div className="hidden md:block">
            <LiquidNavbar
              items={NAV_ITEMS}
              tone="dark"
              defaultActive={0}
              className="nimbus-adaptive"
              style={NAV_STYLE}
            />
          </div>
          <div className="flex gap-2 sm:gap-3 items-center">
            <LanguageSwitcher />
            <a href="/login" className="btn btn-ghost whitespace-nowrap px-3 text-xs lg:px-[18px]" aria-label="Staff login">
              <span className="hidden lg:inline">Staff login</span> <ArrowRight size={14} />
            </a>
            <button
              onClick={() => setShowCart(true)}
              className="relative p-3 rounded-lg bg-lime text-black"
              aria-label="Open request list"
            >
              <ShoppingBag size={18} />
              {count > 0 && (
                <span className="absolute -top-2 -right-2 rounded-full bg-white text-black text-[10px] w-5 h-5 grid place-items-center">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/hero-bike.jpg"
            alt="Panther Legacy Garage motorcycle lit in a dark studio"
            fill
            priority
            quality={90}
            sizes="100vw"
            className="object-cover object-center"
            style={{ filter: "brightness(1.3) contrast(1.06) saturate(1.05)" }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(9,11,13,0)_0%,rgba(9,11,13,.18)_42%,rgba(9,11,13,.9)_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070809]/85 via-[#070809]/25 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#070809] via-[#070809]/10 to-[#070809]" />
        </div>
        <div className="container relative z-10 flex min-h-[88vh] flex-col items-start justify-between py-14 text-left">
          <div className="w-full max-w-3xl">
            <div className="pill glass inline-flex items-center gap-2.5 border-white/15 px-4 py-2 text-[11px] tracking-[.22em] text-gray-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-lime shadow-[0_0_14px_#c7f36b]" />{" "}
              YOUR RIDE. OUR PRIORITY.
            </div>
            <h1 className="display mt-7 text-[3.4rem] font-bold leading-[.94] tracking-[-.055em] md:text-[6.5rem] lg:text-[7.5rem]">
              BUILT FOR
              <br />
              <span className="lime drop-shadow-[0_0_45px_rgba(199,243,107,.25)]">THE RIDE.</span>
            </h1>
            <p className="muted mt-6 max-w-2xl text-base leading-7 md:text-lg">
              Quality motorcycle spare parts, rider essentials and dependable workshop service —
              everything your motorcycle needs, in one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#parts" className="btn btn-primary px-7 py-3.5 text-[15px]">
                Explore spare parts <ArrowRight size={17} />
              </a>
              <a href="/portal" className="btn btn-ghost glass px-7 py-3.5 text-[15px]">
                Book a repair
              </a>
            </div>
          </div>
          <div className="mt-10 w-full max-w-4xl self-center">
            <div className="grid grid-cols-3 gap-2.5 md:gap-4">
              {[
                { n: "01", t: "Quality parts" },
                { n: "02", t: "Skilled service" },
                { n: "03", t: "Rider first" },
              ].map((step) => (
                <div key={step.n} className="glass rounded-xl px-3 py-4 md:px-5 md:py-5">
                  <b className="display block text-lg text-lime md:text-xl">{step.n}</b>
                  <span className="mt-1 block text-[10px] uppercase tracking-[.14em] text-gray-400 md:text-xs">
                    {step.t}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="relative z-10 border-y border-white/[.07] bg-[#080a0c]/80 backdrop-blur-md">
          <div className="container flex flex-wrap justify-between gap-4 py-4 text-[10px] tracking-[.18em] text-gray-500">
            <span>SPARE PARTS</span>
            <span>RIDER GEAR</span>
            <span>MECHANICAL REPAIRS</span>
            <span>ELECTRIC &amp; FUEL MOTORCYCLES</span>
            <span>RWANDA</span>
          </div>
        </div>
      </section>

      <section id="parts" className="section">
        <div className="container">
          <div className="flex flex-wrap justify-between items-end gap-5 mb-8">
            <div>
              <div className="tag mb-3">THE PARTS COUNTER</div>
              <h2 className="text-3xl md:text-4xl font-bold">
                Find what keeps you <span className="lime">moving.</span>
              </h2>
              <p className="muted mt-2 max-w-2xl">
                Browse approved parts currently listed by the garage. Prices appear only after the
                garage has confirmed them; unavailable items are clearly marked.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <Search size={16} className="text-gray-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, SKU, model, keyword…"
                aria-label="Search spare parts"
                className="bg-transparent outline-none text-sm w-52 md:w-64"
              />
            </div>
          </div>

          <div className="card mb-7 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 text-[10px] uppercase tracking-[.16em] muted">
                <SlidersHorizontal size={14} /> Filters
              </span>
              <button
                onClick={() => setCategory("All")}
                className={`pill ${category === "All" ? "!border-lime !text-lime" : ""}`}
              >
                All
              </button>
              {categories.map((item) => (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  className={`pill ${category === item ? "!border-lime !text-lime" : ""}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 md:flex-nowrap">
              <select
                className="field w-auto text-xs"
                value={compatibility}
                onChange={(event) => setCompatibility(event.target.value)}
                aria-label="Filter by motorcycle compatibility"
              >
                <option value="All">All motorcycles</option>
                <option value="SPIRO ELECTRIC">UV powered motorbike</option>
                <option value="AMPERSAND ELECTRIC">Ampersand electric motorbike</option>
                <option value="FUEL-POWERED">Fuel powered motorbike</option>
              </select>
              <select
                className="field w-auto text-xs"
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
                aria-label="Filter by availability"
              >
                <option value="All">Any availability</option>
                <option value="In stock">Available now</option>
                <option value="Out of stock">Out of stock</option>
              </select>
              <select
                className="field w-auto text-xs"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                aria-label="Sort products"
              >
                <option value="name">Sort: name</option>
                <option value="price_asc">Sort: price low to high</option>
                <option value="price_desc">Sort: price high to low</option>
                <option value="recent">Sort: recently updated</option>
                <option value="stock">Sort: available first</option>
              </select>
            </div>
          </div>

          {migrationRequired && (
            <div className="card mb-6 border-amber-300/25 p-4 text-xs leading-6 text-amber-100">
              The supplier catalogue migration has not been applied yet. Availability and confirmed
              prices may be limited until the database is updated.
            </div>
          )}
          {loadError && (
            <div className="card mb-6 border-red-300/30 p-4 text-sm text-red-200">{loadError}</div>
          )}

          {loading ? (
            <div className="card py-14 text-center">
              <p className="muted">Loading spare parts…</p>
            </div>
          ) : filtered.length ? (
            <ProductDropCard
              title="The Parts Counter"
              subtitle={`Browse ${filtered.length} spare part${
                filtered.length === 1 ? "" : "s"
              } · select one for details and pricing`}
              items={dropItems}
              onAdd={(index) => add(filtered[index].id)}
              addLabel="Add"
            />
          ) : null}

          {!loading && !filtered.length && (
            <div className="card py-14 text-center">
              <ImageOff className="mx-auto mb-4 text-gray-500" />
              <p className="muted">
                No matching parts. Try a different search, model or availability filter.
              </p>
              <button
                className="pill mt-4"
                onClick={() => {
                  setSearch("");
                  setCategory("All");
                  setCompatibility("All");
                  setAvailability("All");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      <section id="services" className="section glass-panel">
        <div className="container">
          <div className="tag mb-3">MORE THAN A PARTS SHOP</div>
          <h2 className="text-3xl md:text-4xl font-bold mb-9">
            Workshop care. <span className="lime">Done right.</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: <Wrench />,
                n: "Mechanical repairs",
                d: "Diagnostics, engine work, brake servicing and routine maintenance.",
              },
              {
                icon: <Bike />,
                n: "Electric motorcycle care",
                d: "Practical servicing for electric and conventional motorcycles.",
              },
              {
                icon: <ShieldCheck />,
                n: "Rider equipment",
                d: "Helmets, protective gear and useful riding accessories.",
              },
            ].map((service, index) => (
              <div key={index} className="card p-6">
                <div className="w-12 h-12 rounded-xl bg-lime/10 text-lime grid place-items-center mb-6">
                  {service.icon}
                </div>
                <h3 className="text-xl font-bold">{service.n}</h3>
                <p className="muted text-sm leading-6 mt-3">{service.d}</p>
                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 text-lime text-sm mt-6"
                >
                  Enquire <ArrowRight size={15} />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="section">
        <div className="container grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="tag mb-3">WHY PANTHER LEGACY GARAGE</div>
            <h2 className="text-4xl font-bold leading-tight">
              A better garage experience starts with <span className="lime">trust.</span>
            </h2>
            <p className="muted leading-7 mt-5">
              We bring parts, rider essentials and workshop services together to make motorcycle
              ownership simpler. Our focus is clear communication, dependable service and the right
              parts for the job.
            </p>
            <div className="mt-7 space-y-4 text-sm">
              <div className="flex gap-3">
                <CheckCircle2 className="lime shrink-0" /> Clear product information and confirmed
                pricing
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="lime shrink-0" /> Support for electric and fuel motorcycles
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="lime shrink-0" /> Service updates and customer care
              </div>
            </div>
          </div>
          <div className="card p-2">
            <img
              className="rounded-xl w-full h-[340px] object-cover"
              src="https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=1000"
              alt="Motorcycle workshop"
            />
          </div>
        </div>
      </section>

      <section
        id="contact"
        className="section bg-white/[.02] border-t border-white/[.07]"
      >
        <div className="container grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="tag mb-3">LET&apos;S GET YOU BACK ON THE ROAD</div>
            <h2 className="text-4xl font-bold">
              Need a part or a <span className="lime">repair?</span>
            </h2>
            <p className="muted mt-4">
              Contact the garage and tell us what your motorcycle needs. If a part shows{" "}
              <b>PRICE NEEDS REVIEW</b>, ask us to confirm the current price before you order.
            </p>
            <div className="mt-6 grid gap-3 text-sm">
              <a
                href="tel:0787477587"
                className="flex items-center gap-3 text-lime hover:underline"
              >
                <Phone size={17} /> 0787477587
              </a>
              <a
                href="mailto:pantherleagacy.pl@gmail.com"
                className="flex items-center gap-3 text-lime hover:underline"
              >
                <Mail size={17} /> pantherleagacy.pl@gmail.com
              </a>
            </div>
          </div>
          <form
            className="card p-5 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setToast("Thank you. Please call or visit the garage to confirm your enquiry.");
              window.setTimeout(() => setToast(""), 2600);
            }}
          >
            <input className="field" required placeholder="Your name" />
            <input className="field" required placeholder="Phone number" />
            <select className="field">
              <option>I&apos;m interested in…</option>
              <option>Spare parts</option>
              <option>Motorcycle repair</option>
              <option>Rider gear</option>
            </select>
            <textarea className="field min-h-24" placeholder="Tell us more…" />
            <button className="btn btn-primary">
              Send enquiry <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </section>

      <footer className="py-8 border-t border-white/[.06] bg-[#050607]/40">
        <div className="container flex flex-wrap justify-between gap-4 text-xs muted">
          <span>© 2026 Panther Legacy Garage</span>
          <span>Parts • Service • Performance</span>
          <a href="/portal" className="lime">
            Customer portal →
          </a>
          <a href="/login" className="lime">
            Staff portal →
          </a>
        </div>
      </footer>

      {showCart && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end"
          onClick={() => setShowCart(false)}
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            className="bg-[#0b0f11]/85 backdrop-blur-2xl border-l border-white/10 w-full max-w-md h-full p-6 overflow-y-auto"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">
                Your request list <span className="lime">({count})</span>
              </h2>
              <button onClick={() => setShowCart(false)} aria-label="Close request list">
                <X />
              </button>
            </div>

            {cartProducts.map((product) => (
              <div key={product.id} className="flex gap-3 py-5 border-b border-line">
                <ProductImage
                  src={product.image_url}
                  alt={product.name}
                  compact
                  className="h-16 w-16 shrink-0 rounded-lg overflow-hidden"
                />
                <div className="flex-1">
                  <b className="text-sm">{product.name}</b>
                  <div className="text-[10px] muted">{product.sku}</div>
                  <div className="text-sm lime mt-1">{money(Number(product.selling_price))}</div>
                  <div className="flex gap-3 items-center mt-2">
                    <button
                      onClick={() => decrement(product.id)}
                      aria-label={`Remove one ${product.name}`}
                    >
                      <Minus size={14} />
                    </button>
                    {cart[product.id]}
                    <button
                      onClick={() => add(product.id)}
                      aria-label={`Add one ${product.name}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!cartProducts.length && (
              <p className="py-8 text-sm muted">
                Your request list is empty. Add parts with a confirmed price and available stock.
              </p>
            )}

            <div className="flex justify-between py-6 font-bold">
              <span>Estimated total</span>
              <span className="lime">{money(total)}</span>
            </div>

            {orderReference ? (
              <div className="card p-4 text-sm">
                <CheckCircle2 className="lime mb-2" />
                <b>Order request received</b>
                <p className="mt-2">
                  Reference: <span className="lime">{orderReference}</span>
                </p>
                <p className="muted mt-2">
                  The garage will contact you to confirm availability and collection or delivery
                  arrangements. Payment is not taken online.
                </p>
                <button
                  className="pill mt-3"
                  onClick={() => {
                    setOrderReference("");
                    setOrder(false);
                    setOrderName("");
                    setOrderPhone("");
                    setOrderEmail("");
                    setOrderNote("");
                  }}
                >
                  Continue shopping
                </button>
              </div>
            ) : order ? (
              <form onSubmit={submitOrder} className="grid gap-3">
                <h3 className="font-bold">Your contact details</h3>
                <input
                  className="field"
                  required
                  minLength={2}
                  placeholder="Full name"
                  value={orderName}
                  onChange={(event) => setOrderName(event.target.value)}
                />
                <input
                  className="field"
                  required
                  minLength={7}
                  placeholder="Phone number"
                  value={orderPhone}
                  onChange={(event) => setOrderPhone(event.target.value)}
                />
                <input
                  className="field"
                  type="email"
                  placeholder="Email (optional)"
                  value={orderEmail}
                  onChange={(event) => setOrderEmail(event.target.value)}
                />
                <textarea
                  className="field min-h-20"
                  placeholder="Collection or delivery note (optional)"
                  value={orderNote}
                  onChange={(event) => setOrderNote(event.target.value)}
                />
                {orderError && <p className="text-xs text-red-300">{orderError}</p>}
                <button disabled={orderBusy} className="btn btn-primary w-full">
                  {orderBusy ? "Submitting…" : "Submit order request"}
                </button>
                <button type="button" onClick={() => setOrder(false)} className="pill">
                  Back to request list
                </button>
              </form>
            ) : (
              <button
                disabled={!count}
                onClick={() => setOrder(true)}
                className="btn btn-primary w-full disabled:opacity-40"
              >
                Continue to order
              </button>
            )}
            <p className="text-xs muted mt-4">
              Submitting creates an order request at the displayed confirmed prices. The garage
              confirms availability and payment arrangements separately; no online payment is taken.
            </p>
          </aside>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
