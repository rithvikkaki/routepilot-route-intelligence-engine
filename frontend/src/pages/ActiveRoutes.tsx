import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/Layout";
import { EmptyState, Skeleton, StatusBadge } from "../components/ui";
import { routeApi, vehicleApi, depotApi, orderApi } from "../api/endpoints";
import type { Route, RouteStop } from "../types";

export default function ActiveRoutes() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const routesQuery = useQuery({
    queryKey: ["routes-all"],
    queryFn: () => routeApi.list(),
    refetchInterval: 6000,
  });

  const vehiclesQuery = useQuery({
    queryKey: ["vehicles-routes"],
    queryFn: () => vehicleApi.list(),
  });

  const depotsQuery = useQuery({
    queryKey: ["depots-routes"],
    queryFn: () => depotApi.list(),
  });

  const ordersQuery = useQuery({
    queryKey: ["orders-routes-lookup"],
    queryFn: () => orderApi.list({ page_size: 1000 }),
    refetchInterval: 12000,
  });

  const [expanded, setExpanded] = useState<number | null>(null);

  // Cross-reference mappings
  const vehicleMap = useMemo(() => {
    return new Map((vehiclesQuery.data || []).map((v) => [v.id, v]));
  }, [vehiclesQuery.data]);

  const depotMap = useMemo(() => {
    return new Map((depotsQuery.data || []).map((d) => [d.id, d]));
  }, [depotsQuery.data]);

  const orderWeightMap = useMemo(() => {
    return new Map((ordersQuery.data?.items || []).map((o) => [o.id, o.weight_kg]));
  }, [ordersQuery.data]);

  // Overall KPIs (derived from all routes)
  const kpis = useMemo(() => {
    const list = routesQuery.data || [];
    const active = list.filter((r) => r.status === "ACTIVE");
    const completed = list.filter((r) => r.status === "COMPLETED");
    const planned = list.filter((r) => r.status === "PLANNED");

    // Stops stats
    let totalStops = 0;
    let completedStops = 0;
    let totalDistance = 0;
    
    list.forEach((r) => {
      totalStops += r.stops.length;
      completedStops += r.progress_stop_index >= 0 ? r.progress_stop_index : 0;
      totalDistance += r.total_distance_km;
    });

    const activeVehicles = new Set(
      active.map((r) => r.vehicle_id).filter((id): id is number => id !== null)
    ).size;

    return {
      active: active.length,
      completed: completed.length,
      planned: planned.length,
      activeVehicles,
      totalStops,
      completedStops,
      remainingStops: totalStops - completedStops,
      totalDistance,
    };
  }, [routesQuery.data]);

  // Client-side filtering
  const filtered = useMemo(() => {
    return (routesQuery.data || []).filter((r) => {
      // 1. Status Filter
      if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
      // 2. Search by route code or vehicle registration
      if (search) {
        const query = search.toLowerCase();
        const codeMatch = r.route_code.toLowerCase().includes(query);
        const vehicle = r.vehicle_id ? vehicleMap.get(r.vehicle_id) : null;
        const regMatch = vehicle?.registration_number.toLowerCase().includes(query) || false;
        const driverMatch = vehicle?.driver_name.toLowerCase().includes(query) || false;
        return codeMatch || regMatch || driverMatch;
      }
      return true;
    });
  }, [routesQuery.data, filterStatus, search, vehicleMap]);

  function stopStatusColor(status: string) {
    switch (status) {
      case "COMPLETED": return "bg-emerald-500";
      case "ARRIVED":   return "bg-blue-500";
      case "PENDING":   return "bg-slate-400";
      case "SKIPPED":   return "bg-red-500";
      default:          return "bg-slate-300";
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Route Dispatch Center"
        subtitle="Live monitoring, sequencing, and dispatch control"
      />

      {/* KPI stats bar */}
      <div className="border-b border-ink-200 bg-ink-50 px-4 sm:px-6 py-3 sm:py-4">
        {routesQuery.isLoading ? (
          <div className="flex gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-28 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2.5 sm:gap-3 items-center">
            <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-xs">
              <span className="text-lg sm:text-xl font-bold tabular-nums text-ink-900">{filtered.length}</span>
              <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-ink-500">Filtered Routes</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-xs">
              <span className="text-lg sm:text-xl font-bold tabular-nums text-blue-600">{kpis.active}</span>
              <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-ink-500">Active</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-xs">
              <span className="text-lg sm:text-xl font-bold tabular-nums text-emerald-600">{kpis.completed}</span>
              <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-ink-500">Completed</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-xs">
              <span className="text-lg sm:text-xl font-bold tabular-nums text-indigo-600">{kpis.activeVehicles}</span>
              <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-ink-500">Active Fleet</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-xs">
              <span className="text-xs sm:text-sm font-bold tabular-nums text-ink-900">
                {kpis.completedStops} / {kpis.totalStops}
              </span>
              <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-ink-500">Completed Stops</span>
              {kpis.totalStops > 0 && (
                <div className="mt-1 h-1 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${(kpis.completedStops / kpis.totalStops) * 100}%` }}
                  />
                </div>
              )}
            </div>
            <div className="w-full sm:w-auto sm:ml-auto flex flex-col items-start sm:items-end justify-center rounded-lg border border-ink-200 bg-white px-4 sm:px-5 py-2.5 sm:py-3 shadow-xs">
              <span className="text-sm font-bold tabular-nums text-ink-900">
                {kpis.totalDistance.toFixed(0)} km
              </span>
              <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">Scheduled dist.</span>
            </div>
          </div>
        )}
      </div>

      {/* Filters strip */}
      <div className="border-b border-ink-200 bg-white px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap gap-2.5 sm:gap-3 items-center">
        <div className="flex items-center gap-1 sm:gap-1.5 sm:border-r sm:border-ink-200 sm:pr-3 overflow-x-auto whitespace-nowrap scrollbar-none w-full sm:w-auto">
          {(["ALL", "PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md border transition-all ${
                filterStatus === st
                  ? "bg-brand-500 border-brand-500 text-white shadow-xs"
                  : "bg-white border-ink-200 text-ink-600 hover:bg-ink-50"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-auto flex-1 sm:flex-initial">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="input pl-8 py-1.5 text-xs w-full sm:w-60"
            placeholder="Search code, registration, driver..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <button className="text-xs text-ink-500 hover:text-ink-800 underline" onClick={() => setSearch("")}>
            Clear search
          </button>
        )}
      </div>

      {/* Route List container */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
        {routesQuery.isLoading ? (
          <Skeleton className="h-64" />
        ) : routesQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-3xl mb-2">⚠️</span>
            <div className="font-semibold text-ink-700 mb-1">Failed to load routes</div>
            <button className="btn-primary text-xs py-1.5 px-4" onClick={() => routesQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search || filterStatus !== "ALL" ? "No matching routes found" : "No routes exist"}
            hint={search || filterStatus !== "ALL" ? "Try adjusting your search criteria." : "Accept a plan in the Route Planner to create routes."}
          />
        ) : (
          filtered.map((r: Route) => {
            const vehicle = r.vehicle_id ? vehicleMap.get(r.vehicle_id) : null;
            const depot = depotMap.get(r.depot_id);
            const isExpanded = expanded === r.id;
            
            const totalStops = r.stops.length;
            const completedStops = r.progress_stop_index >= 0 ? r.progress_stop_index : 0;
            const progressPct = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;

            return (
              <div
                key={r.id}
                className={`card border transition-all hover:shadow-xs overflow-hidden ${
                  isExpanded ? "border-brand-500 shadow-xs" : "border-ink-200"
                }`}
              >
                <div
                  className="flex flex-wrap items-center justify-between gap-4 p-4 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-ink-900 text-sm">{r.route_code}</span>
                    <StatusBadge value={r.status} />
                    {depot && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        🏢 {depot.name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-6 text-xs text-ink-500">
                    <div>
                      <span className="text-ink-400">Vehicle:</span>{" "}
                      <span className="font-bold text-ink-700">
                        {vehicle ? `${vehicle.registration_number} (${vehicle.driver_name})` : "Unassigned"}
                      </span>
                    </div>

                    <div>
                      <span className="text-ink-400">Stops:</span>{" "}
                      <span className="font-bold text-ink-700 tabular-nums">
                        {completedStops}/{totalStops}
                      </span>
                    </div>

                    <div className="w-24">
                      <div className="flex justify-between items-center text-[10px] mb-0.5">
                        <span className="text-ink-400">Progress</span>
                        <span className="font-bold tabular-nums">{progressPct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-semibold text-ink-800 tabular-nums">{r.total_distance_km.toFixed(1)} km</div>
                      <div className="text-[10px] text-ink-400 tabular-nums">{Math.round(r.estimated_duration_minutes)} min</div>
                    </div>

                    <div className="text-right">
                      <div className="font-semibold text-ink-800 tabular-nums">{r.total_load_kg} kg</div>
                      <div className="text-[10px] text-ink-400">Load</div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-ink-100 bg-ink-50/30 px-4 py-3">
                    <h4 className="text-xs font-semibold text-ink-700 mb-2">Stop Schedule & Delivery Chain</h4>
                    {r.stops.length === 0 ? (
                      <p className="text-xs text-ink-400 italic py-2">No stops scheduled in this route.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-ink-50 text-[10px] uppercase font-bold text-ink-500 tracking-wider">
                            <tr>
                              <th className="px-4 py-2 w-12 text-center">Seq</th>
                              <th className="px-4 py-2">Order ID</th>
                              <th className="px-4 py-2">Segment Dist</th>
                              <th className="px-4 py-2">Load</th>
                              <th className="px-4 py-2">Scheduled ETA</th>
                              <th className="px-4 py-2">Actual Arrival</th>
                              <th className="px-4 py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink-100">
                            {[...r.stops]
                              .sort((a, b) => a.stop_sequence - b.stop_sequence)
                              .map((s: RouteStop) => {
                                const orderWeight = orderWeightMap.get(s.order_id);
                                return (
                                  <tr key={s.id} className="hover:bg-ink-50/50">
                                    <td className="px-4 py-2 font-semibold text-center tabular-nums">{s.stop_sequence}</td>
                                    <td className="px-4 py-2 font-medium text-brand-600">#{s.order_id}</td>
                                    <td className="px-4 py-2 tabular-nums">{s.distance_from_previous_km} km</td>
                                    <td className="px-4 py-2 tabular-nums">{orderWeight != null ? `${orderWeight} kg` : "—"}</td>
                                    <td className="px-4 py-2 tabular-nums">
                                      {s.estimated_arrival
                                        ? new Date(s.estimated_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : "—"}
                                    </td>
                                    <td className="px-4 py-2 tabular-nums">
                                      {s.actual_arrival
                                        ? new Date(s.actual_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : "—"}
                                    </td>
                                    <td className="px-4 py-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`inline-block h-2 w-2 rounded-full ${stopStatusColor(s.status)}`} />
                                        <span className="font-semibold text-ink-700 text-[10px] tracking-wide uppercase">
                                          {s.status}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
