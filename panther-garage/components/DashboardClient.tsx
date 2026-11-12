"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { canAccess } from "@/lib/rbac";
import ThemeToggle, { type DashboardTheme } from "@/components/ThemeToggle";
import SalesWorkspace from "@/components/SalesWorkspace";
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
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Wrench,
  Users,
  Truck,
  FileBarChart,
  Settings,
  LogOut,
  Bell,
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

const money = (n: number) =>
  new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(n);

const nav = [
  ["Overview", LayoutDashboard],
  ["Inventory", Boxes],
  ["Import", FileUp],
  ["Catalogue review", Tags],
  ["Sales", ShoppingCart],
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
  ["Insights", BrainCircuit],
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
  const [products, setProducts] = useState(initialProducts);
  const [modal, setModal] = useState<"employee" | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeePassword, setEmployeePassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const low = products.filter((p) => p.active && p.stock <= Math.max(p.minimum_stock, 2));

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
    if (r.ok) setProducts(j.products || []);
    else setError(j.error || "Could not refresh products.");
    if (tab === "Employees") await loadEmployees();
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
            <Image
              src="/favicon.png"
              alt="Panther Legacy Garage emblem"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-lg object-contain"
            />
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
              onClick={() => setTab(name)}
              title={name}
              aria-label={name}
              className={`sidebar-link ${sidebarCollapsed ? "justify-center px-0" : ""} ${
                tab === name ? "active" : ""
              }`}
            >
              <Icon size={17} />
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
              onClick={() => setTab(name)}
              className={`sidebar-link shrink-0 whitespace-nowrap ${tab === name ? "active" : ""}`}
            >
              <Icon size={16} />
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
          <div className="flex flex-wrap justify-between items-center gap-3 mb-7">
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
          </div>

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
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
                {[
                  {
                    label: "Products in catalogue",
                    value: String(products.filter((p) => p.active).length),
                    sub: "Live database records",
                    icon: Boxes,
                  },
                  {
                    label: "Physical stock units",
                    value: String(products.reduce((s, p) => s + p.stock, 0)),
                    sub: "Across recorded batches",
                    icon: PackageCheck,
                  },
                  {
                    label: "Low-stock alerts",
                    value: String(low.length),
                    sub: "Two units or below needs attention",
                    icon: Bell,
                  },
                  {
                    label: "Active staff role",
                    value: profile.role,
                    sub: "Verified staff profile",
                    icon: ShieldCheck,
                  },
                ].map((s, i) => (
                  <div className="card p-5" key={i}>
                    <div className="flex justify-between text-xs muted">
                      <span>{s.label}</span>
                      <s.icon size={17} className="lime" />
                    </div>
                    <div className="stat mt-3 text-2xl">{s.value}</div>
                    <div className="text-[11px] muted mt-2">{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="grid xl:grid-cols-[1.4fr_1fr] gap-4">
                <div className="card p-5">
                  <div className="flex justify-between items-center mb-5">
                    <div>
                      <h3 className="font-bold">Inventory overview</h3>
                      <p className="text-xs muted mt-1">Physical stock from FIFO batches</p>
                    </div>
                    <button onClick={() => setTab("Inventory")} className="text-xs lime">
                      View inventory →
                    </button>
                  </div>
                  <div className="space-y-4">
                    {products.slice(0, 6).map((p) => (
                      <div key={p.id}>
                        <div className="flex justify-between text-xs mb-2">
                          <span>{p.name}</span>
                          <span
                            className={
                              p.stock <= Math.max(p.minimum_stock, 2) ? "text-amber-300" : "text-gray-400"
                            }
                          >
                            {p.stock} units
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-lime rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                (p.stock / Math.max(p.minimum_stock * 3, 1)) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {!products.length && (
                      <p className="muted text-sm">No products yet. Register your first product.</p>
                    )}
                  </div>
                </div>
                <div className="card p-5">
                  <h3 className="font-bold">Attention required</h3>
                  <p className="text-xs muted mt-1 mb-5">Products that need a restock review</p>
                  {low.length ? (
                    low.map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between items-center py-3 border-b border-line"
                      >
                        <div>
                          <div className="text-sm">{p.name}</div>
                          <div className="text-[10px] muted">{p.sku}</div>
                        </div>
                        <span className="badge-warn badge">{p.stock} left</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm muted">No low-stock products.</p>
                  )}
                  <div className="mt-5 text-xs muted flex gap-2">
                    <Clock3 size={14} /> Restock alerts use actual batch stock.
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {tab === "Inventory" ? (
            <InventoryWorkspace role={profile.role} onChanged={refresh} />
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
            <SalesWorkspace mode={tab} products={products} />
          ) : null}
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

      {/* Header-triggered garage assistant: instant platform search + AI answers grounded in live data. */}
      <AssistantPanel
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        role={profile.role}
        products={products as any}
        onNavigate={setTab}
      />
    </main>
  );
}
