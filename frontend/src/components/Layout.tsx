import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../stores/auth";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▚", end: true },
  { to: "/orders", label: "Orders", icon: "▤" },
  { to: "/fleet", label: "Fleet", icon: "▦" },
  { to: "/depots", label: "Depots", icon: "◈" },
  { to: "/planner", label: "Route Planner", icon: "✦" },
  { to: "/routes", label: "Active Routes", icon: "➟" },
  { to: "/live", label: "Live Operations", icon: "◉" },
  { to: "/analytics", label: "Analytics", icon: "▨" },
  { to: "/optimization", label: "Optimization Log", icon: "❋" },
];

const BOTTOM_NAV = [
  { to: "/", label: "Dashboard", icon: "▚", end: true },
  { to: "/orders", label: "Orders", icon: "▤" },
  { to: "/planner", label: "Planner", icon: "✦" },
  { to: "/live", label: "Live Ops", icon: "◉" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const activeNav = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));
  const currentTitle = activeNav?.label ?? "RoutePilot";

  return (
    <div className="flex h-screen flex-col lg:flex-row overflow-hidden bg-ink-50">
      {/* ── MOBILE TOP BAR (lg:hidden) ─────────────────────────── */}
      <header className="flex h-14 items-center justify-between border-b border-ink-200 bg-white px-4 lg:hidden z-30 shadow-xs shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-100 active:bg-ink-200"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            <span className="text-base font-bold leading-none">{mobileMenuOpen ? "✕" : "☰"}</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white shadow-xs">
              R
            </div>
            <div>
              <span className="text-sm font-bold text-ink-900 leading-none">RoutePilot</span>
              <span className="text-[10px] text-ink-400 block leading-tight">{currentTitle}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NavLink
            to="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 border border-brand-200 shadow-2xs"
            title={user?.name ?? "Settings"}
          >
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "RP"}
          </NavLink>
        </div>
      </header>

      {/* ── MOBILE BACKDROP OVERLAY ──────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── MOBILE SLIDE-OVER DRAWER (lg:hidden) ─────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white border-r border-ink-200 shadow-2xl transition-transform duration-250 ease-in-out lg:hidden ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white shadow-xs">
              R
            </div>
            <div>
              <div className="text-sm font-bold leading-tight text-ink-900">RoutePilot</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-400">ROUTE INTELLIGENCE</div>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink-600 hover:bg-ink-100 active:bg-ink-200"
                }`
              }
            >
              <span className="text-base text-ink-400">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-200 p-3 bg-slate-50">
          <NavLink
            to="/settings"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-100"
          >
            <div>
              <div className="font-semibold text-xs">{user?.name}</div>
              <div className="text-[11px] text-ink-400">{user?.role}</div>
            </div>
            <span className="text-xs font-semibold text-brand-600">Settings →</span>
          </NavLink>
          <button className="btn-ghost mt-2 w-full text-xs text-red-600 hover:bg-red-50" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── DESKTOP SIDEBAR (hidden on mobile, visible lg:flex) ── */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col border-r border-ink-200 bg-white shrink-0">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white shadow-xs">
            R
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">RoutePilot</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400">ROUTE INTELLIGENCE ENGINE</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink-600 hover:bg-ink-100"
                }`
              }
            >
              <span className="text-ink-400">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-200 p-3">
          <NavLink to="/settings" className="block rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-100">
            <div className="font-medium">{user?.name}</div>
            <div className="text-[11px] text-ink-400">{user?.role}</div>
          </NavLink>
          <button className="btn-ghost mt-1 w-full" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ──────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-ink-50 pb-16 lg:pb-0">
        <Outlet />
      </main>

      {/* ── MOBILE BOTTOM NAVIGATION BAR (lg:hidden) ───────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex h-14 items-center justify-around border-t border-ink-200 bg-white/95 backdrop-blur-md px-2 lg:hidden shadow-lg">
        {BOTTOM_NAV.map((b) => (
          <NavLink
            key={b.to}
            to={b.to}
            end={b.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 text-[10px] font-medium transition-colors ${
                isActive ? "text-brand-600 font-bold" : "text-ink-500 hover:text-ink-800"
              }`
            }
          >
            <span className="text-base leading-none mb-0.5">{b.icon}</span>
            <span>{b.label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center py-1 px-3 text-[10px] font-medium text-ink-500 hover:text-ink-800"
        >
          <span className="text-base leading-none mb-0.5">☰</span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-ink-200 bg-white px-4 sm:px-6 py-3.5 sm:py-4">
      <div className="min-w-0">
        <h1 className="text-base sm:text-lg font-semibold text-ink-900 truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-ink-400 truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
