import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "../components/Layout";
import { KpiCard, Skeleton, EmptyState, StatusBadge } from "../components/ui";
import { analyticsApi, dashboardApi, optimizationApi, routeApi, vehicleApi } from "../api/endpoints";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  ASSIGNED: "#3b82f6",
  OUT_FOR_DELIVERY: "#6366f1",
  DELIVERED: "#22c55e",
  FAILED: "#ef4444",
  CANCELLED: "#94a3b8",
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH_URGENT: "#f97316",
  NORMAL_LOW: "#cbd5e1",
};

function formatShortDate(val: string): string {
  try {
    const parts = val.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return val;
  } catch {
    return val;
  }
}

function formatFullDate(val: string): string {
  try {
    const parts = val.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
    return val;
  } catch {
    return val;
  }
}

export default function Dashboard() {

  // Queries
  const summary = useQuery({ queryKey: ["dash-summary"], queryFn: dashboardApi.summary, refetchInterval: 5000 });
  const opsSummary = useQuery({ queryKey: ["orders-ops-summary"], queryFn: analyticsApi.ordersOpsSummary, refetchInterval: 5000 });
  const byStatus = useQuery({ queryKey: ["orders-by-status"], queryFn: analyticsApi.ordersByStatus, refetchInterval: 6000 });
  const overTime = useQuery({ queryKey: ["deliveries-over-time"], queryFn: analyticsApi.deliveriesOverTime, refetchInterval: 6000 });
  const distByVeh = useQuery({ queryKey: ["distance-by-vehicle"], queryFn: analyticsApi.distanceByVehicle, refetchInterval: 6000 });
  const optRuns = useQuery({ queryKey: ["opt-runs-dash"], queryFn: optimizationApi.runs, refetchInterval: 8000 });
  const routes = useQuery({ queryKey: ["routes-dash"], queryFn: () => routeApi.list(), refetchInterval: 5000 });
  const vehicles = useQuery({ queryKey: ["vehicles-dash"], queryFn: () => vehicleApi.list(), refetchInterval: 6000 });

  const s = summary.data;
  const opsData = opsSummary.data;

  // Derive priority distribution metrics from opsData
  const priorityData = useMemo(() => {
    if (!opsData) return [];
    const high = opsData.high_priority_orders;
    const normal = Math.max(0, opsData.total_orders - high);
    return [
      { name: "High & Urgent", value: high },
      { name: "Normal & Low", value: normal },
    ];
  }, [opsData]);

  // Active routes list
  const activeRoutesList = useMemo(() => {
    return (routes.data || []).filter((r) => r.status === "ACTIVE").slice(0, 5);
  }, [routes.data]);

  // Derive fleet details by counting vehicles by status
  const fleetSummary = useMemo(() => {
    const list = vehicles.data || [];
    const result = { AVAILABLE: 0, ASSIGNED: 0, IN_TRANSIT: 0, MAINTENANCE: 0, OFFLINE: 0 };
    list.forEach((v) => {
      const status = v.status as keyof typeof result;
      if (status in result) {
        result[status]++;
      }
    });
    return result;
  }, [vehicles.data]);

  // Detect operational alerts from real data
  const alerts = useMemo(() => {
    const activeAlerts: { id: string; type: "warning" | "danger" | "info"; title: string; desc: string }[] = [];

    if (opsData) {
      if (opsData.unassigned_orders > 0) {
        activeAlerts.push({
          id: "unassigned",
          type: "warning",
          title: "Unassigned Orders Pending Dispatch",
          desc: `${opsData.unassigned_orders} order(s) require optimization planning or manual routing.`,
        });
      }
      if (opsData.at_risk_orders > 0) {
        activeAlerts.push({
          id: "at-risk",
          type: "danger",
          title: "At-Risk / Overdue Deliveries",
          desc: `${opsData.at_risk_orders} order(s) have passed their scheduled delivery windows.`,
        });
      }
    }

    // Check for failed runs in the last 24 hours
    const runsList = optRuns.data || [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentFailed = runsList.filter((r) => r.status === "FAILED" && new Date(r.created_at).getTime() > oneDayAgo);
    if (recentFailed.length > 0) {
      activeAlerts.push({
        id: "failed-run",
        type: "danger",
        title: "Solver Optimization Failures Detected",
        desc: `${recentFailed.length} run(s) failed in the solver algorithm within the last 24h.`,
      });
    }

    // Check for high vehicle utilization (load >= 90% capacity)
    const vehList = vehicles.data || [];
    const highUtil = vehList.filter((v) => v.capacity_kg > 0 && (v.current_load_kg / v.capacity_kg) >= 0.9);
    if (highUtil.length > 0) {
      activeAlerts.push({
        id: "high-util",
        type: "info",
        title: "Near-Capacity Vehicle Utilization",
        desc: `${highUtil.length} vehicle(s) currently exceed 90% of their operational payload weight limit.`,
      });
    }

    return activeAlerts;
  }, [opsData, optRuns.data, vehicles.data]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="RoutePilot Dashboard" subtitle="ROUTE INTELLIGENCE ENGINE — Operations Control Center" />

      <div className="flex-1 overflow-y-auto space-y-4 sm:space-y-6 p-3 sm:p-6">
        
        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5">
          {summary.isLoading || !s ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : (
            <>
              <KpiCard label="Total Orders" value={s.total_orders ?? 0} />
              <KpiCard label="Pending Orders" value={s.pending ?? 0} accent="text-amber-600" />
              <KpiCard label="Assigned Orders" value={s.assigned ?? 0} accent="text-blue-600" />
              <KpiCard label="Out for Delivery" value={s.out_for_delivery ?? 0} accent="text-indigo-600" />
              <KpiCard label="Completed Deliveries" value={s.delivered_today ?? 0} accent="text-green-600" />
              <KpiCard label="Active Routes" value={s.active_routes ?? 0} accent="text-brand-600" />
              <KpiCard label="Distance Today" value={`${(s.total_distance_today_km ?? 0).toFixed(0)} km`} />
              <KpiCard label="Vehicles In Transit" value={s.active_vehicles ?? 0} accent="text-indigo-600" />
              <KpiCard label="Available Vehicles" value={s.available_vehicles ?? 0} accent="text-green-600" />
              <KpiCard label="On-time Success Rate" value={`${s.on_time_delivery_rate ?? 100}%`} accent="text-emerald-600" />
            </>
          )}
        </div>

        {/* Operational Alerts */}
        <div className="card p-4 flex flex-col justify-between animate-fade-in">
          <div>
            <h3 className="text-sm font-semibold text-ink-950 uppercase tracking-wider">Live System Alert Monitor</h3>
            <p className="text-xs text-ink-500 mb-3">Real-time issues requiring dispatcher action</p>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[160px] space-y-2.5 pr-1">
            {summary.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-6">
                <span className="text-2xl mb-1">✅</span>
                <p className="text-xs font-semibold text-slate-700">All Operations Normal</p>
                <p className="text-[10px] text-slate-500">No active alerts detected across the fleet or orders.</p>
              </div>
            ) : (
              alerts.map((al) => (
                <div
                  key={al.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-xs leading-relaxed ${
                    al.type === "danger"
                      ? "bg-red-50 border-red-200 text-red-800"
                      : al.type === "warning"
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-blue-50 border-blue-200 text-blue-800"
                  }`}
                >
                  <span className="text-sm">
                    {al.type === "danger" ? "🚨" : al.type === "warning" ? "⚠️" : "ℹ️"}
                  </span>
                  <div>
                    <div className="font-bold text-ink-900">{al.title}</div>
                    <div className="text-[11px] mt-0.5">{al.desc}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Fleet & Active Route Overview */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          {/* Fleet Status Breakdown */}
          <div className="card p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-950 uppercase tracking-wider">Fleet Status Matrix</h3>
              <p className="text-xs text-ink-500 mb-4">Availability status count derived from live vehicle logs</p>
            </div>
            {vehicles.isLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs border-b border-ink-100 pb-2">
                  <span className="flex items-center gap-2 font-medium text-emerald-600">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    Available
                  </span>
                  <span className="font-bold tabular-nums text-slate-800">{fleetSummary.AVAILABLE}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-ink-100 pb-2">
                  <span className="flex items-center gap-2 font-medium text-blue-600">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                    Assigned
                  </span>
                  <span className="font-bold tabular-nums text-slate-800">{fleetSummary.ASSIGNED}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-ink-100 pb-2">
                  <span className="flex items-center gap-2 font-medium text-indigo-600">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
                    In Transit
                  </span>
                  <span className="font-bold tabular-nums text-slate-800">{fleetSummary.IN_TRANSIT}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-ink-100 pb-2">
                  <span className="flex items-center gap-2 font-medium text-amber-600">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                    Maintenance
                  </span>
                  <span className="font-bold tabular-nums text-slate-800">{fleetSummary.MAINTENANCE}</span>
                </div>
                <div className="flex justify-between items-center text-xs pb-1">
                  <span className="flex items-center gap-2 font-medium text-slate-500">
                    <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                    Offline
                  </span>
                  <span className="font-bold tabular-nums text-slate-800">{fleetSummary.OFFLINE}</span>
                </div>
              </div>
            )}
          </div>

          {/* Active Routes Progress Panel */}
          <div className="card p-4 lg:col-span-2 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-950 uppercase tracking-wider">Active Route Monitor</h3>
              <p className="text-xs text-ink-500 mb-3">Live dispatch progress of vehicles currently on the road</p>
            </div>
            <div className="flex-1 space-y-3 max-h-[180px] overflow-y-auto pr-1">
              {routes.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : activeRoutesList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-6 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                  <span className="text-lg">🚛</span>
                  <p className="text-xs font-semibold text-slate-700">No Routes Currently Active</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Activate a route plan or check Live Operations to dispatch vehicles.</p>
                </div>
              ) : (
                activeRoutesList.map((r) => {
                  const completed = r.progress_stop_index >= 0 ? r.progress_stop_index : 0;
                  const total = r.stops.length;
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <div key={r.id} className="border border-ink-200 rounded-lg p-2.5 bg-ink-50/20 text-xs">
                      <div className="flex justify-between items-center font-bold text-ink-900">
                        <span>{r.route_code}</span>
                        <span className="text-brand-600 font-semibold tabular-nums">{completed} / {total} Stops</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-ink-400 mt-1.5">
                        <span>Distance: {r.total_distance_km.toFixed(1)} km</span>
                        <span>Estimated duration: {Math.round(r.estimated_duration_minutes)} min</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Analytics Charts & Solver Log */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          {/* Deliveries Over Time Line Chart */}
          <div className="card p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink-950 uppercase tracking-wider">Deliveries Performance</h3>
                <p className="text-xs text-ink-500">Timeline comparison of daily order creations vs completed drop-offs</p>
              </div>
            </div>
            {overTime.isLoading ? (
              <Skeleton className="h-60" />
            ) : !overTime.data || overTime.data.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center text-center text-ink-400">
                No delivery history recorded.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={overTime.data} margin={{ top: 10, right: 15, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickFormatter={formatShortDate}
                    stroke="#cbd5e1"
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#cbd5e1" allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 5 }} iconType="circle" />
                  <Line type="monotone" dataKey="total" stroke="#6366f1" name="Created" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="delivered" stroke="#10b981" name="Delivered" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Orders by Status (Donut) */}
          <div className="card p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-950 uppercase tracking-wider">Orders pipeline</h3>
              <p className="text-xs text-ink-500 mb-2">Fulfillment lifecycle breakdown</p>
            </div>
            {byStatus.isLoading ? (
              <Skeleton className="h-56" />
            ) : !byStatus.data || byStatus.data.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-xs text-ink-400">
                No orders loaded.
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={byStatus.data}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={2}
                    >
                      {byStatus.data.map((d) => (
                        <Cell key={d.status} fill={STATUS_COLORS[d.status] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-[10px] text-ink-700 w-full pt-1.5 border-t border-slate-100">
                  {byStatus.data.map((d) => (
                    <div key={d.status} className="flex items-center gap-1.5 truncate">
                      <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[d.status] }} />
                      <span className="truncate">{d.status.replace(/_/g, " ")}: <strong>{d.count}</strong></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Optimization Run Log */}
        <div className="grid grid-cols-1 gap-6">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink-950 uppercase tracking-wider mb-1">Recent Solver Executions</h3>
            <p className="text-xs text-ink-500 mb-3.5">Recent automatic route optimization runs and computed distance savings</p>
            {optRuns.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !optRuns.data || optRuns.data.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center text-center text-slate-400 py-6">
                <span className="text-lg">🧠</span>
                <p className="text-xs font-semibold text-slate-700">No Optimization History</p>
                <p className="text-[10px] text-slate-500">Routes have not been optimized by the engine yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-150 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="px-4 py-2.5">Run ID</th>
                      <th className="px-4 py-2.5">Timestamp</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Objective</th>
                      <th className="px-4 py-2.5 text-center">Orders</th>
                      <th className="px-4 py-2.5 text-center">Vehicles</th>
                      <th className="px-4 py-2.5">Assigned Rate</th>
                      <th className="px-4 py-2.5">Distance Gain</th>
                      <th className="px-4 py-2.5">Solver runtime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {optRuns.data.slice(0, 5).map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-bold text-slate-900">#{r.id}</td>
                        <td className="px-4 py-2 text-slate-500 tabular-nums">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="px-4 py-2"><StatusBadge value={r.status} /></td>
                        <td className="px-4 py-2 text-slate-600">{r.objective.replace(/_/g, " ")}</td>
                        <td className="px-4 py-2 text-center tabular-nums">{r.orders_count}</td>
                        <td className="px-4 py-2 text-center tabular-nums">{r.vehicles_count}</td>
                        <td className="px-4 py-2 tabular-nums">{r.assigned_count} / {r.orders_count}</td>
                        <td className="px-4 py-2 font-bold text-emerald-600">
                          {r.improvement_percentage != null ? `+${r.improvement_percentage.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-2 text-slate-500 tabular-nums">{r.execution_time_ms != null ? `${r.execution_time_ms} ms` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
