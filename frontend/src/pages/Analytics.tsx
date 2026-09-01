import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import { PageHeader } from "../components/Layout";
import { Skeleton } from "../components/ui";
import { analyticsApi } from "../api/endpoints";

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

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#64748b", "#ec4899", "#8b5cf6"];

function KpiChip({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-5 py-3 shadow-xs min-w-[140px] flex-1">
      <span className={`text-xl font-bold tabular-nums ${accent ?? "text-ink-900"}`}>{value}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 text-center">{label}</span>
    </div>
  );
}

export default function Analytics() {
  const summary = useQuery({ queryKey: ["an-summary"], queryFn: () => analyticsApi.summary(), refetchInterval: 8000 });
  const savings = useQuery({ queryKey: ["an-savings"], queryFn: analyticsApi.optimizationSavings, refetchInterval: 8000 });
  const distByVeh = useQuery({ queryKey: ["an-dist"], queryFn: analyticsApi.distanceByVehicle, refetchInterval: 8000 });
  const overTime = useQuery({ queryKey: ["an-time"], queryFn: analyticsApi.deliveriesOverTime, refetchInterval: 8000 });
  const statusDist = useQuery({ queryKey: ["an-status"], queryFn: analyticsApi.ordersByStatus, refetchInterval: 8000 });

  const s = summary.data;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Logistics & Route Analytics" subtitle="Fleet performance, delivery metrics, and optimization intelligence" />
      
      <div className="flex-1 overflow-y-auto space-y-6 p-6">
        {/* KPI Strip */}
        <div className="flex flex-wrap gap-3">
          {!s ? (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 flex-1 min-w-[120px]" />)
          ) : (
            <>
              <KpiChip label="Avg Route Dist" value={`${s.avg_route_distance_km ?? 0} km`} />
              <KpiChip label="Avg Route Duration" value={`${s.avg_route_duration_minutes ?? 0} min`} />
              <KpiChip label="Completed Routes" value={s.completed_routes ?? 0} />
              <KpiChip label="Deliveries / Veh" value={s.deliveries_per_vehicle ?? 0} />
              <KpiChip label="Vehicle Utilisation" value={`${s.vehicle_utilisation_pct ?? 0}%`} accent="text-brand-600" />
              <KpiChip label="Capacity Utilisation" value={`${s.capacity_utilisation_pct ?? 0}%`} accent="text-indigo-600" />
              <KpiChip label="Unassigned Rate" value={`${s.unassigned_order_rate_pct ?? 0}%`} accent="text-amber-600" />
              <KpiChip label="Optimization Gain" value={`${s.avg_optimization_improvement_pct ?? 0}%`} accent="text-emerald-600" />
            </>
          )}
        </div>

        {/* Sections Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          
          {/* Order & Delivery Performance */}
          <div className="card p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink-950">Deliveries Over Time</h3>
                <p className="text-xs text-ink-500">14-day trend of orders created vs. completed deliveries</p>
              </div>
              {overTime.data && overTime.data.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  Last 14 Days
                </span>
              )}
            </div>
            {overTime.isLoading ? (
              <Skeleton className="h-64" />
            ) : !overTime.data || overTime.data.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center p-6 text-ink-400">
                <p className="text-sm font-medium text-ink-600">No delivery history recorded yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={overTime.data} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickFormatter={formatShortDate}
                    stroke="#cbd5e1"
                    dy={4}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      return (
                        <div className="rounded-lg border border-ink-100 bg-white p-3 shadow-lg text-xs">
                          <p className="font-semibold text-ink-900 mb-2 border-b border-ink-100 pb-1.5">
                            {formatFullDate(String(label))}
                          </p>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-5">
                              <span className="flex items-center gap-1.5 text-ink-600">
                                <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
                                Orders Created:
                              </span>
                              <span className="font-semibold text-ink-900">{payload[0]?.value ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between gap-5">
                              <span className="flex items-center gap-1.5 text-ink-600">
                                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                                Orders Delivered:
                              </span>
                              <span className="font-semibold text-ink-900">{payload[1]?.value ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} iconType="circle" />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#6366f1"
                    name="Orders Created"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#6366f1", stroke: "#ffffff", strokeWidth: 1.5 }}
                    activeDot={{ r: 6, fill: "#4f46e5", stroke: "#ffffff", strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="delivered"
                    stroke="#10b981"
                    name="Orders Delivered"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#10b981", stroke: "#ffffff", strokeWidth: 1.5 }}
                    activeDot={{ r: 6, fill: "#059669", stroke: "#ffffff", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Orders by Status (Donut Chart) */}
          <div className="card p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-950">Orders by Status</h3>
              <p className="text-xs text-ink-500">Current volume split across fulfillment pipeline</p>
            </div>
            {statusDist.isLoading ? (
              <Skeleton className="h-60 mt-3" />
            ) : !statusDist.data || statusDist.data.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-xs text-ink-400">
                No orders found to report status distribution.
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-3">
                <ResponsiveContainer width="100%" height={200} className="max-w-[200px]">
                  <PieChart>
                    <Pie
                      data={statusDist.data}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="status"
                    >
                      {statusDist.data.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 max-w-[200px]">
                  {statusDist.data.map((item, index) => (
                    <div key={item.status} className="flex items-center justify-between text-xs text-ink-700">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        {item.status.replace(/_/g, " ")}
                      </span>
                      <span className="font-bold tabular-nums">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Distance by Vehicle (Bar Chart) */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink-950">Fleet Mileage Comparison</h3>
            <p className="text-xs text-ink-500 mb-3">Total cumulative distance (km) dispatched per vehicle</p>
            {distByVeh.isLoading ? (
              <Skeleton className="h-60" />
            ) : !distByVeh.data || distByVeh.data.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-xs text-ink-400">
                No vehicle mileage records found.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={distByVeh.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                  <XAxis dataKey="vehicle" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="distance_km" fill="#6366f1" radius={[3, 3, 0, 0]} name="Distance (km)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Optimization Savings */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink-950">Optimization Impact (Distance)</h3>
            <p className="text-xs text-ink-500 mb-3">Comparison between solver-suggested routes and baseline distance</p>
            {savings.isLoading ? (
              <Skeleton className="h-60" />
            ) : !savings.data || savings.data.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-xs text-ink-400">
                No optimization runs saved yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={savings.data} margin={{ left: -15, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                  <XAxis dataKey="run_id" tick={{ fontSize: 10 }} tickFormatter={(val) => `Run #${val}`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="before_km" stroke="#94a3b8" fill="#e2e8f0" name="Baseline km" />
                  <Area type="monotone" dataKey="after_km" stroke="#2563eb" fill="#bcd2ff" name="Optimized km" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Improvement Percentage */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink-950">Improvement Percentage Per Run</h3>
            <p className="text-xs text-ink-500 mb-3">Efficiency gains achieved by OR-Tools solver relative to greedy algorithm</p>
            {savings.isLoading ? (
              <Skeleton className="h-60" />
            ) : !savings.data || savings.data.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-xs text-ink-400">
                No comparisons available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={savings.data} margin={{ left: -15, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                  <XAxis dataKey="run_id" tick={{ fontSize: 10 }} tickFormatter={(val) => `Run #${val}`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="improvement_pct" stroke="#10b981" strokeWidth={2} name="Improvement %" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
