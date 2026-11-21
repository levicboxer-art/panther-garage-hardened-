"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import "@fontsource-variable/manrope";
import styles from "./glassy-dashboard.module.css";

type Role = "BOSS" | "EMPLOYEE";
type Theme = "dark" | "light";

type Product = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  minimum_stock: number;
  active: boolean;
};

type ReportSummary = {
  period: { from: string; to: string };
  operations: {
    sales_count: number;
    repairs_received: number;
    repairs_open: number;
    repairs_completed: number;
  };
  inventory: {
    active_products: number;
    units_on_hand: number;
    low_stock: number;
  };
  finance: {
    revenue: number;
    collected: number;
    customer_balance: number;
  } | null;
};

type Props = {
  role: Role;
  theme: Theme;
  products: Product[];
  unreadSaleAlerts: number;
  onNavigate: (tab: string) => void;
  onRefreshProducts: () => Promise<unknown>;
};

type Metric = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "lime" | "amber" | "blue";
};

const money = (value: number) =>
  new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-RW", { day: "numeric", month: "short" }).format(date);
}

export default function GlassyDashboard({
  role,
  theme,
  products,
  unreadSaleAlerts,
  onNavigate,
  onRefreshProducts,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");

    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 29);

    try {
      const response = await fetch(
        `/api/reports?from=${dateKey(from)}&to=${dateKey(today)}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Live dashboard figures are temporarily unavailable.");
      }
      if (!body.operations || !body.inventory) {
        throw new Error("The report response was incomplete. Please refresh to retry.");
      }
      if (id === requestId.current) setReport(body as ReportSummary);
    } catch (cause) {
      if (id === requestId.current) {
        setReport(null);
        setError(cause instanceof Error ? cause.message : "Could not load dashboard figures.");
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
    return () => {
      requestId.current += 1;
    };
  }, [loadReport]);

  useGSAP(
    () => {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo(
        "[data-reveal]",
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.055, ease: "power2.out" },
      );
    },
    { scope: rootRef },
  );

  const lowStockProducts = useMemo(
    () =>
      products
        .filter((product) => product.active && product.stock <= Math.max(product.minimum_stock, 2))
        .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name)),
    [products],
  );

  const metrics: Metric[] = useMemo(() => {
    const unavailable = loading && !report;
    const value = (raw: number | undefined) =>
      unavailable ? "…" : raw === undefined ? "—" : raw.toLocaleString("en-RW");

    if (role === "BOSS") {
      return [
        {
          label: "Sales revenue",
          value: unavailable ? "…" : report?.finance ? money(report.finance.revenue) : "—",
          detail: report?.finance ? `Collected ${money(report.finance.collected)} · last 30 days` : "Last 30 days · owner view",
          icon: CircleDollarSign,
          tone: "lime",
        },
        {
          label: "Completed invoices",
          value: value(report?.operations.sales_count),
          detail: "Completed sales · last 30 days",
          icon: ReceiptText,
        },
        {
          label: "Open repairs received",
          value: value(report?.operations.repairs_open),
          detail: `Of ${value(report?.operations.repairs_received)} jobs received · last 30 days`,
          icon: Wrench,
          tone: "blue",
        },
        {
          label: "Low-stock products",
          value: value(report?.inventory.low_stock),
          detail: "At or below the configured restock threshold",
          icon: TriangleAlert,
          tone: "amber",
        },
      ];
    }

    return [
      {
        label: "Completed sales",
        value: value(report?.operations.sales_count),
        detail: "Completed invoices · last 30 days",
        icon: ShoppingCart,
        tone: "lime",
      },
      {
        label: "Open repairs received",
        value: value(report?.operations.repairs_open),
        detail: `Of ${value(report?.operations.repairs_received)} jobs received · last 30 days`,
        icon: Wrench,
        tone: "blue",
      },
      {
        label: "Physical stock units",
        value: value(report?.inventory.units_on_hand),
        detail: `${value(report?.inventory.active_products)} active products`,
        icon: PackageCheck,
      },
      {
        label: "Low-stock products",
        value: value(report?.inventory.low_stock),
        detail: "At or below the configured restock threshold",
        icon: TriangleAlert,
        tone: "amber",
      },
    ];
  }, [loading, report, role]);

  const periodLabel = report
    ? `${displayDate(report.period.from)} – ${displayDate(report.period.to)}`
    : "Last 30 days";
  const shownLowStock = lowStockProducts.slice(0, 5);
  const threshold = (product: Product) => Math.max(product.minimum_stock, 2);
  const actions: {
    title: string;
    detail: string;
    icon: LucideIcon;
    tab: string;
    accent: "lime" | "blue" | "amber";
    badge?: number;
  }[] = [
    { title: "Sales", detail: "Record a counter sale", icon: ShoppingCart, tab: "Sales", accent: "lime" },
    {
      title: "Recent invoices",
      detail: unreadSaleAlerts ? `${unreadSaleAlerts} new sale alert${unreadSaleAlerts === 1 ? "" : "s"}` : "Review sold items and quantities",
      icon: ReceiptText,
      tab: "Recent invoices",
      accent: "blue",
      badge: unreadSaleAlerts,
    },
    { title: "Repairs", detail: "Open the workshop queue", icon: Wrench, tab: "Repairs", accent: "amber" },
    { title: "Inventory", detail: "Check product stock", icon: Boxes, tab: "Inventory", accent: "lime" },
  ];

  return (
    <div ref={rootRef} className={styles.root} data-theme={theme}>
      <section className={styles.hero} data-reveal aria-labelledby="garage-overview-title">
        <div className={styles.heroTop}>
          <div>
            <div className={styles.eyebrow}>
              <span className={styles.brandMark} aria-hidden="true"><Boxes size={16} /></span>
              PANTHER LEGACY GARAGE <span className={styles.eyebrowDivider}>/</span> RWANDA
            </div>
            <h2 id="garage-overview-title" className={styles.heading}>The garage, at a glance.</h2>
            <p className={styles.subtitle}>
              A clear view of recorded sales, workshop activity and on-hand stock.
            </p>
          </div>
          <div className={styles.heroActions}>
            <span className={styles.liveBadge} aria-live="polite">
              <i aria-hidden="true" /> {error ? "UPDATE ISSUE" : loading ? "UPDATING" : "LIVE RECORDS"}
            </span>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => {
                void loadReport();
                void onRefreshProducts().catch(() => {
                  setError("Product records could not be refreshed; the visible stock list may be out of date.");
                });
              }}
              disabled={loading}
              aria-label="Refresh dashboard report"
              title="Refresh dashboard report"
            >
              <RefreshCw size={15} className={loading ? styles.spinning : undefined} />
              <span>{loading ? "Refreshing" : "Refresh"}</span>
            </button>
          </div>
        </div>

        <div className={styles.heroFoot}>
          <span><Clock3 size={13} /> {periodLabel}</span>
          <span><ShieldCheck size={13} /> {role === "BOSS" ? "Owner overview" : "Staff overview"}</span>
          <span>Figures from authenticated garage reports</span>
        </div>
      </section>

      {error && (
        <div className={styles.errorNotice} role="alert">
          <TriangleAlert size={16} />
          <span>{error} Existing stock records remain available below.</span>
          <button type="button" onClick={() => void loadReport()}>Retry</button>
        </div>
      )}

      <section className={styles.metrics} aria-label="Garage summary" aria-busy={loading}>
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className={styles.metric}
            data-tone={metric.tone || "neutral"}
            data-reveal
          >
            <div className={styles.metricTop}>
              <span>{metric.label}</span>
              <span className={styles.metricIcon}><metric.icon size={17} /></span>
            </div>
            <strong className={styles.metricValue}>{metric.value}</strong>
            <span className={styles.metricDetail}>{metric.detail}</span>
          </article>
        ))}
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.panel} data-reveal aria-labelledby="stock-attention-title">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.panelEyebrow}>INVENTORY WATCH</p>
              <h3 id="stock-attention-title">Attention required</h3>
              <p className={styles.panelDescription}>
                Live product records at or below their restock threshold.
              </p>
            </div>
            <button type="button" className={styles.textAction} onClick={() => onNavigate("Inventory")}>
              Inventory <ArrowRight size={14} />
            </button>
          </div>

          {shownLowStock.length ? (
            <div className={styles.stockList}>
              {shownLowStock.map((product) => {
                const restockAt = threshold(product);
                const fill = Math.max(3, Math.min(100, (product.stock / Math.max(restockAt * 2, 1)) * 100));
                return (
                  <div className={styles.stockItem} key={product.id}>
                    <div className={styles.stockInfo}>
                      <span className={styles.stockName}>{product.name}</span>
                      <span className={styles.stockMeta}>{product.sku}</span>
                    </div>
                    <div className={styles.stockQuantity}>
                      <strong>{product.stock}</strong><span> / {restockAt}</span>
                    </div>
                    <div
                      className={styles.stockTrack}
                      role="progressbar"
                      aria-label={`${product.name} stock level`}
                      aria-valuemin={0}
                      aria-valuemax={restockAt * 2}
                      aria-valuenow={Math.min(product.stock, restockAt * 2)}
                    >
                      <span style={{ width: `${fill}%` }} />
                    </div>
                  </div>
                );
              })}
              {lowStockProducts.length > shownLowStock.length && (
                <button type="button" className={styles.moreStock} onClick={() => onNavigate("Inventory")}>
                  View {lowStockProducts.length - shownLowStock.length} more low-stock items <ArrowRight size={13} />
                </button>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <PackageCheck size={21} />
              <div>
                <strong>{products.length ? "No low-stock products" : "No products registered"}</strong>
                <p>{products.length ? "No active items are currently at their restock threshold." : "Register products to start tracking stock."}</p>
              </div>
            </div>
          )}
        </section>

        <section className={styles.panel} data-reveal aria-labelledby="quick-actions-title">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.panelEyebrow}>WORKSPACE</p>
              <h3 id="quick-actions-title">Quick actions</h3>
              <p className={styles.panelDescription}>Jump straight into the garage workflow.</p>
            </div>
          </div>
          <div className={styles.actionList}>
            {actions.map((action) => (
              <button
                type="button"
                key={action.tab}
                className={styles.actionButton}
                data-accent={action.accent}
                onClick={() => onNavigate(action.tab)}
              >
                <span className={styles.actionIcon}><action.icon size={17} /></span>
                <span className={styles.actionCopy}>
                  <strong>{action.title}</strong>
                  <small>{action.detail}</small>
                </span>
                {action.badge ? <span className={styles.actionBadge} aria-label={`${action.badge} unread sale alerts`}>{action.badge > 9 ? "9+" : action.badge}</span> : null}
                <ArrowRight size={15} className={styles.actionArrow} />
              </button>
            ))}
          </div>
          <div className={styles.trustNote}>
            <ShieldCheck size={15} />
            <span>Access and financial visibility follow your {role === "BOSS" ? "owner" : "staff"} permissions.</span>
          </div>
        </section>
      </div>

      <div className={styles.footer} data-reveal>
        <span>Panther Garage · data shown from recorded transactions only</span>
        {role === "BOSS" ? (
          <button type="button" onClick={() => onNavigate("Insights")}>
            Open business insights <ArrowRight size={13} />
          </button>
        ) : (
          <button type="button" onClick={() => onNavigate("Shift reports")}>
            Open shift reports <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
