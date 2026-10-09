import { useState } from "react";
import { PageHeader } from "../components/Layout";
import { useAuth } from "../stores/auth";
import { tokenStore } from "../api/client";

export default function Settings() {
  const user = useAuth((s) => s.user);
  const [copied, setCopied] = useState(false);

  const activeToken = tokenStore.get() || "";

  const handleCopyToken = () => {
    if (activeToken) {
      navigator.clipboard.writeText(activeToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "US";

  // Role permissions breakdown
  const rolePermissions = (() => {
    switch (user?.role) {
      case "ADMIN":
        return {
          title: "System Administrator",
          badge: "bg-red-100 text-red-800 border border-red-200",
          desc: "Full administrative read-write control across all operational modules.",
          rules: [
            "Create, edit, and delete warehouses & depot hubs",
            "Full read-write control of orders, vehicles, and active routes",
            "Optimize routes, start/stop simulations, and apply delay overrides",
            "Access to full solver logs, audit trails, and performance analytics",
          ],
        };
      case "DISPATCHER":
        return {
          title: "Logistics Dispatcher",
          badge: "bg-blue-100 text-blue-800 border border-blue-200",
          desc: "Standard operational control over route dispatching and real-time monitoring.",
          rules: [
            "Read-write control of orders, vehicles, and active routes",
            "Run OR-Tools solver optimizations and materialize active route plans",
            "Control live operations simulation, apply traffic incidents, and trigger re-optimization",
            "View depots, solver logs, and metrics (Depots are read-only)",
          ],
        };
      default:
        return {
          title: "System Observer / Viewer",
          badge: "bg-slate-100 text-slate-700 border border-slate-200",
          desc: "Read-only access to monitoring dashboards, maps, and performance metrics.",
          rules: [
            "View dashboard KPIs, order status pipelines, and active fleet maps",
            "Track live operations simulation and WebSocket telemetry streams",
            "Inspect depots, routes, and optimization runs history",
            "Write operations (creating, editing, deleting, or optimizing) are disabled",
          ],
        };
    }
  })();

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <PageHeader title="Profile & Settings" subtitle="Account configuration, role capabilities, and developer API credentials" />
      
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 max-w-5xl mx-auto w-full space-y-4 sm:space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Left Column: Account Profile Summary */}
          <div className="md:col-span-1 space-y-6">
            <div className="card p-5 flex flex-col items-center text-center space-y-4 border border-slate-200">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white shadow-xs">
                {initials}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{user?.name || "System User"}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${rolePermissions.badge}`}>
                {user?.role}
              </span>
              
              <div className="w-full pt-4 border-t border-slate-150 text-left text-xs text-slate-500 space-y-2">
                <div className="flex justify-between">
                  <span>Account Status</span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Registered</span>
                  <span className="font-medium text-slate-700">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Read-Only Notice */}
            <div className="card p-4 border border-amber-200 bg-amber-50/30 text-xs text-amber-800 space-y-1.5">
              <div className="font-bold flex items-center gap-1">
                <span>⚠️</span> Profile Administration Notice
              </div>
              <p className="leading-relaxed text-[11px] text-amber-900">
                Account profiles, passwords, and security settings are provisioned directly by system administrators to maintain database integrity and dispatcher audit compliance.
              </p>
            </div>
          </div>

          {/* Right Column: Roles, Token & Platform Specs */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Role Permissions Card */}
            <div className="card p-5 border border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2 mb-3">
                Authorized Role Capabilities
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">{rolePermissions.title} Account</h4>
                  <p className="text-xs text-slate-500 mt-1">{rolePermissions.desc}</p>
                </div>
                <ul className="space-y-1.5 pt-2">
                  {rolePermissions.rules.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Developer API credentials */}
            <div className="card p-5 border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-150 pb-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Developer API Authorization Token
                </h3>
                {activeToken && (
                  <button
                    className={`text-xs font-semibold px-2 py-0.5 rounded transition ${
                      copied ? "bg-emerald-100 text-emerald-800" : "text-brand-600 hover:text-brand-800 underline"
                    }`}
                    onClick={handleCopyToken}
                  >
                    {copied ? "Copied!" : "Copy Token"}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Use this JSON Web Token (JWT) to authorize manual HTTP API request audits (e.g. via cURL or Postman).
                </p>
                {activeToken ? (
                  <textarea
                    readOnly
                    className="w-full h-16 rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] text-slate-600 select-all cursor-text focus:outline-none"
                    value={activeToken}
                  />
                ) : (
                  <p className="text-xs italic text-slate-400">No active authorization token found.</p>
                )}
              </div>
            </div>

            {/* Platform Specifications */}
            <div className="card p-5 border border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-150 pb-2 mb-3">
                Platform Architecture Specifications
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                RoutePilot operates on a microservice routing architecture:
              </p>
              <div className="grid grid-cols-2 gap-4 mt-3 text-xs text-slate-700">
                <div className="rounded bg-slate-50 p-3 border border-slate-150">
                  <div className="font-bold text-slate-900">Constraint Solver</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">Google OR-Tools (VRP Engine)</div>
                </div>
                <div className="rounded bg-slate-50 p-3 border border-slate-150">
                  <div className="font-bold text-slate-900">Geospatial Backend</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">PostgreSQL + PostGIS geography extension</div>
                </div>
                <div className="rounded bg-slate-50 p-3 border border-slate-150">
                  <div className="font-bold text-slate-900">Telemetry Streaming</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">Real-time simulation via WebSockets</div>
                </div>
                <div className="rounded bg-slate-50 p-3 border border-slate-150">
                  <div className="font-bold text-slate-900">Response Cache Layer</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">Redis key-value server</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
