"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { canAccess } from "@/lib/rbac";
import ThemeToggle, { type DashboardTheme } from "@/components/ThemeToggle";
import SalesWorkspace from "@/components/SalesWorkspace";
import RecentInvoicesWorkspace from "@/components/RecentInvoicesWorkspace";
import WorkshopWorkspace from "@/components/WorkshopWorkspace";
import PurchasingWorkspace from "@/components/PurchasingWorkspace";
import ReportsWorkspace from "@/components/ReportsWorkspace";
import RestockingWorkspace from "@/components/RestockingWorkspace";
import NotificationCenter from "@/components/NotificationCenter";
import ChatWorkspace from "@/components/ChatWorkspace";
import BookingsWorkspace from "@/components/BookingsWorkspace";
import OrdersWorkspace from "@/components/OrdersWorkspace";
import InventoryWorkspace from "@/components/InventoryWorkspace";
import ImportWorkspace from "@/components/ImportWorkspace";
import CatalogueReviewWorkspace from "@/components/CatalogueReviewWorkspace";
import BIWorkspace from "@/components/BIWorkspace";
import AssistantPanel from "@/components/AssistantPanel";
import ShiftReportsWorkspace from "@/components/ShiftReportsWorkspace";
import GlassyDashboard from "@/components/ui/glassy-dashboard";
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  ReceiptText,
  Wrench,
  Users,
  Truck,
  FileBarChart,
  Settings,
  LogOut,
  Plus,
  ArrowUpRight,
  PackageCheck,
  Clock3,
  ShieldCheck,
  X,
  RefreshCw,
  TrendingUp,
  FileUp,
  Tags,
  PanelLeftClose,
  PanelLeftOpen,
  BrainCircuit,
  ClipboardList,
  Bot,
  ShieldAlert,
  MessageCircle,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  image_url?: string | null;
  stock: number;
  available_stock: number;
  minimum_stock: number;
  selling_price: number;
  active: boolean;
};
type Props = {
  profile: { id: string; full_name: string; role: "BOSS" | "EMPLOYEE"; email: string };
  initialProducts: Product[];
};
type WorkspaceAlertCounts = {
  invoices: number;
  inventory: number;
  reports: number;
  purchases: number;
  team_chat: number;
};
type WorkspaceNotificationToast = { tab: string; title: string; message: string };

const NOTIFICATION_CATEGORIES_BY_TAB: Record<string, string> = {
  Sales: "SALE",
  "Recent invoices": "SALE",
  Inventory: "LOW_STOCK,OUT_OF_STOCK",
  Reports: "APPROVAL,EXPENSE",
  Purchases: "PURCHASE",
  "Team chat": "MESSAGE",
};
const WORKSPACE_ALERT_DETAILS: Record<keyof WorkspaceAlertCounts, { tab: string; title: string; unit: string }> = {
  invoices: { tab: "Recent invoices", title: "New sale notification", unit: "sale notification" },
  inventory: { tab: "Inventory", title: "New stock alert", unit: "stock alert" },
  reports: { tab: "Reports", title: "New finance update", unit: "finance alert" },
  purchases: { tab: "Purchases", title: "New purchasing update", unit: "purchase alert" },
  team_chat: { tab: "Team chat", title: "New team message", unit: "message" },
};
const NAV_ALERT_KEY: Record<string, keyof WorkspaceAlertCounts> = {
  Sales: "invoices",
  "Recent invoices": "invoices",
  Inventory: "inventory",
  Reports: "reports",
  Purchases: "purchases",
  "Team chat": "team_chat",
};
const EMPTY_WORKSPACE_ALERTS: WorkspaceAlertCounts = {
  invoices: 0, inventory: 0, reports: 0, purchases: 0, team_chat: 0,
};

function unreadForTab(tab: string, counts: WorkspaceAlertCounts) {
  const key = NAV_ALERT_KEY[tab];
  return key ? counts[key] : 0;
}

function NotificationBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return <span title={label} aria-label={label} className="absolute -right-2 -top-2 min-w-4 h-4 rounded-full bg-red-500 px-1 text-[9px] leading-4 font-bold text-white text-center">{count > 9 ? "9+" : count}</span>;
}

const nav = [
  ["Overview", LayoutDashboard],
  ["Insights", BrainCircuit],
  ["Inventory", Boxes],
  ["Import", FileUp],
  ["Catalogue review", Tags],
  ["Sales", ShoppingCart],
  ["Recent invoices", ReceiptText],
  ["Repairs", Wrench],
  ["Customers", Users],
  ["Bookings", Clock3],
  ["Online Orders", ShoppingCart],
  ["Employees", Users],
  ["Purchases", Truck],
  ["Restocking", TrendingUp],
  ["Reports", FileBarChart],
  ["Shift reports", ClipboardList],
  ["Team chat", MessageCircle],
  ["Settings", Settings],
] as const;

// Module availability by role lives in lib/rbac (mirrored by API + RLS checks).
const THEME_STORAGE_KEY = "pgms-dashboard-theme";
const SIDEBAR_STORAGE_KEY = "pgms-sidebar-collapsed";

export default function DashboardClient({ profile, initialProducts }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState("Overview");
  const [theme, setTheme] = useState<DashboardTheme>("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantSelectedProduct, setAssistantSelectedProduct] = useState<{ id: string; sku: string; name: string } | null>(null);
  const clearAssistantSelection = useCallback(() => setAssistantSelectedProduct(null), []);
  const [products, setProducts] = useState(initialProducts);
  const [modal, setModal] = useState<"employee" | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeePassword, setEmployeePassword] = useState("");
  const [workspaceAlertCounts, setWorkspaceAlertCounts] = useState<WorkspaceAlertCounts>(EMPTY_WORKSPACE_ALERTS);
  const [workspaceNotificationToast, setWorkspaceNotificationToast] = useState<WorkspaceNotificationToast | null>(null);
  const previousWorkspaceAlerts = useRef<WorkspaceAlertCounts | null>(null);
  const workspaceAlertRequestId = useRef(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  // The light theme is a BOSS-only preference. Employees always keep the
  // standard dashboard theme so they cannot leave the workspace unreadable.
  useEffect(() => {
    if (profile.role !== "BOSS") return;
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // Ignore unavailable storage; the default dark theme still works.
    }
  }, [profile.role]);

  // Restore the saved sidebar state after hydration so the server markup
  // stays stable; the preference survives reloads for every staff member.
  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
    } catch {
      // Ignore unavailable storage; the expanded sidebar still works.
    }
  }, []);

  useEffect(() => {
    if (tab === "Employees" && profile.role === "BOSS") void loadEmployees();
  }, [tab, profile.role]);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore unavailable storage.
      }
      return next;
    });
  }

  function changeTheme(next: DashboardTheme) {
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore unavailable storage.
    }
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function refresh() {
    const r = await fetch("/api/products", { cache: "no-store" });
    const j = await r.json();
    if (r.ok) {
      setProducts(j.products || []);
    }
    else setError(j.error || "Could not refresh products.");
    if (tab === "Employees") await loadEmployees();
    return r.ok ? (j.products || []) : undefined;
  }

  async function loadEmployees() {
    const r = await fetch("/api/employees", { cache: "no-store" });
    const j = await r.json();
    if (r.ok) setEmployees(j.employees || []);
    else setError(j.error || "Could not load employees.");
  }

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: employeeName,
        email: employeeEmail,
        temporary_password: employeePassword,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(j.error || "Could not create employee.");
      return;
    }
    setModal(null);
    setEmployeeName("");
    setEmployeeEmail("");
    setEmployeePassword("");
    await loadEmployees();
    notify("Employee account created.");
  }

  async function toggleEmployee(id: string, active: boolean) {
    const r = await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    const j = await r.json();
    if (!r.ok) {
      notify(j.error || "Could not update employee.");
      return;
    }
    await loadEmployees();
    notify(active ? "Employee reactivated." : "Employee deactivated.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const visibleNav = useMemo(
    () => nav.filter(([name]) => canAccess(profile.role, name)),
    [profile.role],
  );

  const refreshWorkspaceAlerts = useCallback(async () => {
    const requestId = ++workspaceAlertRequestId.current;
    try {
      const response = await fetch("/api/notifications?summary=true", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const next: WorkspaceAlertCounts = {
        invoices: Number(data.by_workspace?.invoices) || 0,
        inventory: Number(data.by_workspace?.inventory) || 0,
        reports: Number(data.by_workspace?.reports) || 0,
        purchases: Number(data.by_workspace?.purchases) || 0,
        team_chat: Number(data.by_workspace?.team_chat) || 0,
      };
      if (requestId !== workspaceAlertRequestId.current) return;
      const previous = previousWorkspaceAlerts.current;
      if (previous) {
        const increased = (Object.keys(WORKSPACE_ALERT_DETAILS) as (keyof WorkspaceAlertCounts)[])
          .map((key) => ({ key, delta: next[key] - previous[key], ...WORKSPACE_ALERT_DETAILS[key] }))
          .filter((item) => item.delta > 0);
        if (increased.length) {
          setWorkspaceNotificationToast({
            title: increased.length === 1 ? increased[0].title : "New garage updates",
            message: increased.map((item) => `${item.delta} new ${item.unit}${item.delta === 1 ? "" : "s"}`).join(" · "),
            tab: increased[0].tab,
          });
        }
      }
      previousWorkspaceAlerts.current = next;
      setWorkspaceAlertCounts(next);
    } catch {
      // Keep workspace navigation and its last known badges available offline.
    }
  }, []);

  useEffect(() => {
    void refreshWorkspaceAlerts();
    const timer = window.setInterval(() => void refreshWorkspaceAlerts(), 15_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshWorkspaceAlerts();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshWorkspaceAlerts]);

  useEffect(() => {
    if (!workspaceNotificationToast) return;
    const timer = window.setTimeout(() => setWorkspaceNotificationToast(null), 7_000);
    return () => window.clearTimeout(timer);
  }, [workspaceNotificationToast]);

  async function navigateTo(name: string) {
    setTab(name);
    const category = NOTIFICATION_CATEGORIES_BY_TAB[name];
    if (!category) return;
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_category: category }),
      });
      if (response.ok) await refreshWorkspaceAlerts();
    } catch {
      // Keep unread badges visible so acknowledgement can be retried.
    }
  }

  function navigateFromAssistant(destination: string, product?: { id: string; sku: string; name: string; stock: number; active: boolean }) {
    setAssistantSelectedProduct(product ? { id: product.id, sku: product.sku, name: product.name } : null);
    void navigateTo(destination);
    setAssistantOpen(false);
  }

  return (
    <main
      className="dashboard-shell min-h-screen flex"
      data-dashboard-theme={profile.role === "BOSS" ? theme : "dark"}
    >
      <aside
        aria-label="Dashboard navigation"
        className={`dashboard-sidebar sticky top-0 h-screen shrink-0 overflow-y-auto hidden lg:flex flex-col transition-[width] duration-200 ease-out ${
          sidebarCollapsed ? "w-[74px] px-3 py-5" : "w-[245px] p-5"
        }`}
      >
        <div
          className={`mb-8 flex items-center ${
            sidebarCollapsed ? "flex-col gap-4" : "justify-between"
          }`}
        >
          <a href="/" className="flex items-center gap-3" title="Back to website">
            <div className="w-9 h-9 rounded-lg bg-lime text-black grid place-items-center font-black shrink-0">
              P
            </div>
            {!sidebarCollapsed && (
              <div>
                <b className="text-sm tracking-widest">PANTHER</b>
                <div className="text-[9px] text-gray-500 tracking-[.2em]">LEGACY GARAGE</div>
              </div>
            )}
          </a>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-2 rounded-lg border border-line text-gray-400 hover:text-lime transition-colors shrink-0"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        {sidebarCollapsed ? (
          <div className="mx-auto mb-3 h-px w-8 bg-line" role="presentation" />
        ) : (
          <div className="tag mb-3">WORKSPACE</div>
        )}
        <nav className="grid gap-1">
          {visibleNav.map(([name, Icon]) => (
            <button
              key={name}
              onClick={() => void navigateTo(name)}
              title={name}
              aria-label={name}
              className={`sidebar-link ${sidebarCollapsed ? "justify-center px-0" : ""} ${
                tab === name ? "active" : ""
              }`}
            >
              <span className="relative inline-flex">
                <Icon size={17} />
                <NotificationBadge count={unreadForTab(name, workspaceAlertCounts)} label={`${unreadForTab(name, workspaceAlertCounts)} new notification${unreadForTab(name, workspaceAlertCounts) === 1 ? "" : "s"} for ${name}`} />
              </span>
              {!sidebarCollapsed && name}
            </button>
          ))}
        </nav>
        {sidebarCollapsed ? (
          <div className="mt-auto grid place-items-center">
            <div
              title={`${profile.role} account · access enforced by Row Level Security`}
              className="card p-2"
            >
              <ShieldCheck className="lime" size={17} />
            </div>
          </div>
        ) : (
          <div className="mt-auto card p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="lime" size={17} />
              <span className="text-xs font-semibold">{profile.role} ACCOUNT</span>
            </div>
            <p className="text-[10px] muted mt-2">
              Access is enforced by Supabase Row Level Security and server-side checks.
            </p>
          </div>
        )}
      </aside>

      <section className="min-w-0 flex-1">
        <nav
          aria-label="Dashboard sections"
          className="dashboard-mobile-nav lg:hidden sticky top-[72px] z-10 flex gap-2 overflow-x-auto px-4 py-2"
        >
          {visibleNav.map(([name, Icon]) => (
            <button
              key={name}
              onClick={() => void navigateTo(name)}
              className={`sidebar-link shrink-0 whitespace-nowrap ${tab === name ? "active" : ""}`}
            >
              <span className="relative inline-flex">
                <Icon size={16} />
                <NotificationBadge count={unreadForTab(name, workspaceAlertCounts)} label={`${unreadForTab(name, workspaceAlertCounts)} new notification${unreadForTab(name, workspaceAlertCounts) === 1 ? "" : "s"} for ${name}`} />
              </span>
              {name}
            </button>
          ))}
        </nav>
        <header className="dashboard-header sticky top-0 z-20 h-[72px] flex items-center justify-between px-5 md:px-8">
          <div className="hidden sm:block">
            <div className="text-xs muted">Panther Legacy Garage / {tab}</div>
            <h1 className="font-bold text-lg">{tab}</h1>
          </div>
          <div className="flex gap-2 sm:gap-3 items-center">
            <LanguageSwitcher />
            {profile.role === "BOSS" && <ThemeToggle theme={theme} onChange={changeTheme} />}
            <button
              onClick={refresh}
              title="Refresh data"
              className="p-2 rounded-lg border border-line text-gray-400"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => setAssistantOpen((v) => !v)}
              title="Garage AI assistant"
              aria-label="Garage AI assistant"
              aria-pressed={assistantOpen}
              className={`p-2 rounded-lg border transition ${
                assistantOpen ? "border-lime text-lime bg-lime/10" : "border-line text-gray-400 hover:text-lime"
              }`}
            >
              <Bot size={16} />
            </button>
            <NotificationCenter role={profile.role} />
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold">{profile.full_name}</div>
              <div className="text-[10px] muted">
                {profile.role} · {profile.email}
              </div>
            </div>
            <button title="Sign out" onClick={signOut} className="p-2 rounded-lg border border-line">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="p-5 md:p-8 max-w-[1400px] mx-auto">
          {tab !== "Overview" && <div className="flex flex-wrap justify-between items-center gap-3 mb-7">
            <div>
              <div className="tag">PANTHER LEGACY GARAGE · RWANDA</div>
              <h2 className="text-2xl font-bold mt-2">Good work starts with a clear view.</h2>
              <p className="muted text-sm mt-1">
                Live product and inventory records from your garage database.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.role === "BOSS" && (
                <button
                  onClick={() => {
                    setTab("Employees");
                    loadEmployees();
                  }}
                  className="btn btn-ghost text-xs"
                >
                  <Users size={15} /> Employees
                </button>
              )}
              {profile.role === "BOSS" && (
                <button onClick={() => setTab("Import")} className="btn btn-ghost text-xs">
                  <FileUp size={15} /> Import workbooks
                </button>
              )}
              {profile.role === "BOSS" && (
                <button
                  onClick={() => setTab("Catalogue review")}
                  className="btn btn-ghost text-xs"
                >
                  <Tags size={15} /> Catalogue review
                </button>
              )}
              <button onClick={() => setTab("Inventory")} className="btn btn-primary text-xs">
                <PackageCheck size={15} /> Product register
              </button>
            </div>
          </div>}

          {/* RBAC guard: an employee who lands on an owner module (stale state,
              deep link) sees a lock card instead of the workspace. */}
          {!canAccess(profile.role, tab) ? (
            <section className="card p-10 text-center">
              <ShieldAlert className="mx-auto mb-4 text-lime" size={30} />
              <h2 className="text-lg font-bold">Restricted area</h2>
              <p className="mx-auto mt-2 max-w-md text-sm muted">
                “{tab}” involves supplier costs, price control, purchasing or staff accounts and
                is reserved for the owner. Ask the owner if you need something from it.
              </p>
            </section>
          ) : null}

          {tab === "Overview" ? (
            <GlassyDashboard
              role={profile.role}
              theme={profile.role === "BOSS" ? theme : "dark"}
              products={products}
              unreadSaleAlerts={workspaceAlertCounts.invoices}
              onNavigate={(name) => void navigateTo(name)}
              onRefreshProducts={refresh}
            />
          ) : null}

          {tab === "Inventory" ? (
            <InventoryWorkspace
              role={profile.role}
              onChanged={refresh}
              initialSearch={assistantSelectedProduct?.sku || assistantSelectedProduct?.name}
              onAssistantSearchHandled={clearAssistantSelection}
            />
          ) : null}

          {tab === "Catalogue review" && profile.role === "BOSS" ? (
            <CatalogueReviewWorkspace role={profile.role} onChanged={refresh} />
          ) : null}

          {tab === "Import" && profile.role === "BOSS" ? <ImportWorkspace /> : null}

          {tab === "Insights" && profile.role === "BOSS" ? <BIWorkspace /> : null}

          {tab === "Employees" && profile.role === "BOSS" && (
            <div className="card">
              <div className="p-5 flex justify-between items-center">
                <div>
                  <h3 className="font-bold">Employee accounts</h3>
                  <p className="text-xs muted mt-1">
                    Only BOSS can create or deactivate EMPLOYEE accounts.
                  </p>
                </div>
                <button onClick={() => setModal("employee")} className="btn btn-primary text-xs">
                  <Plus size={15} /> Add employee
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EMPLOYEE</th>
                      <th>ACCOUNT TYPE</th>
                      <th>STATUS</th>
                      <th>CREATED</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => (
                      <tr key={e.id}>
                        <td className="font-semibold">{e.full_name}</td>
                        <td>EMPLOYEE</td>
                        <td>
                          <span className={e.active ? "badge" : "badge badge-red"}>
                            {e.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="muted">{new Date(e.created_at).toLocaleDateString()}</td>
                        <td>
                          <button
                            onClick={() => toggleEmployee(e.id, !e.active)}
                            className="pill"
                          >
                            {e.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!employees.length && (
                  <p className="p-5 text-sm muted">No employee accounts found.</p>
                )}
              </div>
            </div>
          )}

          {tab === "Sales" || tab === "Customers" ? (
            <SalesWorkspace
              mode={tab}
              products={products}
              onProductsChanged={refresh}
              initialProductId={assistantSelectedProduct?.id}
              onAssistantProductHandled={clearAssistantSelection}
            />
          ) : null}
          {tab === "Recent invoices" ? <RecentInvoicesWorkspace role={profile.role} /> : null}
          {tab === "Bookings" ? <BookingsWorkspace /> : null}
          {tab === "Online Orders" ? <OrdersWorkspace /> : null}
          {tab === "Repairs" ? <WorkshopWorkspace products={products} /> : null}
          {tab === "Purchases" && profile.role === "BOSS" ? <PurchasingWorkspace products={products} role={profile.role} /> : null}
          {tab === "Reports" ? <ReportsWorkspace role={profile.role} /> : null}
          {tab === "Shift reports" ? <ShiftReportsWorkspace profile={{ id: profile.id, full_name: profile.full_name, role: profile.role }} /> : null}
          {tab === "Restocking" && profile.role === "BOSS" ? <RestockingWorkspace role={profile.role} /> : null}
          {tab === "Team chat" ? <ChatWorkspace profileId={profile.id} role={profile.role} /> : null}

          {!(
            [
              "Overview",
              "Reports",
              "Shift reports",
              "Team chat",
              "Inventory",
              "Import",
              "Catalogue review",
              "Employees",
              "Sales",
              "Recent invoices",
              "Customers",
              "Bookings",
              "Online Orders",
              "Repairs",
              "Purchases",
              "Restocking",
              "Insights",
            ].includes(tab) ||
            (tab === "Import" && profile.role !== "BOSS")
          ) && (
            <div className="card p-8 md:p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-lime/10 text-lime grid place-items-center mx-auto mb-5">
                <ArrowUpRight />
              </div>
              <h3 className="text-2xl font-bold">{tab} module</h3>
              <p className="muted max-w-lg mx-auto mt-3 text-sm leading-6">
                This module is in the implementation roadmap. Use the available workspace modules
                to manage your garage operations.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                <span className="pill">Supabase Auth</span>
                <span className="pill">PostgreSQL</span>
                <span className="pill">Role-based RLS</span>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3 text-[11px] muted">
            <span>● Connected application layer</span>
            <span>·</span>
            <span>RWF</span>
            <span>·</span>
            <span>Refresh to load latest records</span>
          </div>
        </div>
      </section>

      {modal === "employee" && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <form onSubmit={createEmployee} className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-5">
              <div>
                <div className="tag">STAFF MANAGEMENT</div>
                <h3 className="text-xl font-bold mt-1">Create employee account</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setError("");
                }}
              >
                <X />
              </button>
            </div>
            <label className="text-xs muted">
              Employee full name
              <input
                className="field mt-2 mb-4"
                required
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
              />
            </label>
            <label className="text-xs muted">
              Employee email
              <input
                className="field mt-2 mb-4"
                type="email"
                required
                value={employeeEmail}
                onChange={(e) => setEmployeeEmail(e.target.value)}
              />
            </label>
            <label className="text-xs muted">
              Temporary password (minimum 12 characters)
              <input
                className="field mt-2 mb-4"
                type="password"
                minLength={12}
                required
                value={employeePassword}
                onChange={(e) => setEmployeePassword(e.target.value)}
              />
            </label>
            <p className="text-xs muted mb-4">
              This always creates an EMPLOYEE account. The employee should change the temporary
              password after first login.
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-300 mb-3">
                {error}
              </p>
            )}
            <button disabled={busy} className="btn btn-primary w-full disabled:opacity-50">
              {busy ? "Saving…" : "Create employee"}
            </button>
          </form>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {workspaceNotificationToast && (
        <div role="status" aria-live="polite" className="fixed right-4 top-[88px] z-[60] w-[min(360px,calc(100vw-2rem))] card border-lime/30 bg-[#101010] p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="tag">NEW UPDATE</div>
              <p className="mt-1 text-sm font-semibold">{workspaceNotificationToast.title}</p>
              <p className="mt-1 text-xs muted">{workspaceNotificationToast.message}</p>
            </div>
            <button type="button" onClick={() => setWorkspaceNotificationToast(null)} aria-label="Dismiss new update"><X size={15} /></button>
          </div>
          <button type="button" className="mt-3 text-xs lime hover:underline" onClick={() => { const target = workspaceNotificationToast.tab; setWorkspaceNotificationToast(null); void navigateTo(target); }}>
            Open {workspaceNotificationToast.tab}
          </button>
        </div>
      )}

      {/* Header-triggered garage assistant: instant platform search + AI answers grounded in live data. */}
      <AssistantPanel
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        products={products as any}
        onNavigate={navigateFromAssistant}
      />
    </main>
  );
}
