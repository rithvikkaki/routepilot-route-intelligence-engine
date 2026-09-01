import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/Layout";
import { EmptyState, Skeleton, StatusBadge } from "../components/ui";
import { optimizationApi } from "../api/endpoints";
import type { OptimizationRun } from "../types";

export default function OptimizationHistory() {
  const runsQuery = useQuery({
    queryKey: ["opt-runs"],
    queryFn: optimizationApi.runs,
    refetchInterval: 12000,
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterObjective, setFilterObjective] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const kpis = useMemo(() => {
    const list = runsQuery.data || [];
    const total = list.length;
    const completed = list.filter((r) => r.status === "COMPLETED");
    const failed = list.filter((r) => r.status === "FAILED");
    
    // Avg execution time for completed
    const execTimes = completed.map((r) => r.execution_time_ms).filter((t): t is number => t !== null);
    const avgExecTime = execTimes.length > 0 ? Math.round(execTimes.reduce((a, b) => a + b, 0) / execTimes.length) : 0;

    // Avg improvement for completed
    const improvements = completed.map((r) => r.improvement_percentage).filter((i): i is number => i !== null);
    const avgImprovement = improvements.length > 0 ? (improvements.reduce((a, b) => a + b, 0) / improvements.length).toFixed(1) : "0";

    const totalOrders = completed.reduce((sum, r) => sum + r.orders_count, 0);

    return { total, completed: completed.length, failed: failed.length, avgExecTime, avgImprovement, totalOrders };
  }, [runsQuery.data]);

  // Client-side filtering & sorting (newest first)
  const filteredRuns = useMemo(() => {
    const list = [...(runsQuery.data || [])];
    // Sort by created_at descending (newest runs at the top)
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return list.filter((r) => {
      if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
      if (filterObjective !== "ALL" && r.objective !== filterObjective) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const idMatch = String(r.id).includes(q);
        const algoMatch = r.algorithm.toLowerCase().includes(q);
        const errMsgMatch = r.error_message?.toLowerCase().includes(q) || false;
        return idMatch || algoMatch || errMsgMatch;
      }
      return true;
    });
  }, [runsQuery.data, filterStatus, filterObjective, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Optimization Log & Solver Audit" subtitle="Audit solver runs, performance metrics, and routing improvement logs" />

      {/* KPI strip */}
      <div className="border-b border-ink-200 bg-ink-50 px-6 py-4 flex flex-wrap gap-4 items-center">
        <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-5 py-3 shadow-xs min-w-[100px] flex-1">
          <span className="text-xl font-bold tabular-nums text-ink-900">{kpis.total}</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Total Runs</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-5 py-3 shadow-xs min-w-[100px] flex-1">
          <span className="text-xl font-bold tabular-nums text-emerald-600">{kpis.completed}</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Success</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-5 py-3 shadow-xs min-w-[100px] flex-1">
          <span className="text-xl font-bold tabular-nums text-red-600">{kpis.failed}</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Failed</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-5 py-3 shadow-xs min-w-[100px] flex-1">
          <span className="text-xl font-bold tabular-nums text-brand-600">{kpis.avgExecTime} ms</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Avg Solve Time</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-5 py-3 shadow-xs min-w-[100px] flex-1">
          <span className="text-xl font-bold tabular-nums text-green-600">+{kpis.avgImprovement}%</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Avg Distance Saved</span>
        </div>
      </div>

      {/* Filter strip */}
      <div className="border-b border-ink-200 bg-white px-6 py-3 flex flex-wrap gap-3 items-center">
        {/* Status Filter */}
        <select
          className="input py-1.5 text-xs"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING">PENDING</option>
          <option value="PROCESSING">PROCESSING</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="FAILED">FAILED</option>
        </select>

        {/* Objective Filter */}
        <select
          className="input py-1.5 text-xs"
          value={filterObjective}
          onChange={(e) => setFilterObjective(e.target.value)}
        >
          <option value="ALL">All Objectives</option>
          <option value="MIN_DISTANCE">MIN DISTANCE</option>
          <option value="MIN_TIME">MIN TIME</option>
          <option value="BALANCED">BALANCED</option>
        </select>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="input pl-8 py-1.5 text-xs w-48"
            placeholder="Search run ID or algorithm…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {(filterStatus !== "ALL" || filterObjective !== "ALL" || searchQuery) && (
          <button
            className="text-xs text-ink-500 hover:text-ink-800 underline"
            onClick={() => {
              setFilterStatus("ALL");
              setFilterObjective("ALL");
              setSearchQuery("");
            }}
          >
            Clear filters
          </button>
        )}

        {!runsQuery.isLoading && (
          <span className="ml-auto text-xs text-ink-400 tabular-nums">
            Showing {filteredRuns.length} of {runsQuery.data?.length || 0} runs
          </span>
        )}
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-6">
        {runsQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : runsQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-3xl mb-2">⚠️</span>
            <div className="font-semibold text-ink-700 mb-1">Failed to load optimization log</div>
            <button className="btn-primary text-xs py-1.5 px-4" onClick={() => runsQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : filteredRuns.length === 0 ? (
          <EmptyState
            title="No optimization runs matching filters"
            hint="Try clearing your filters or running optimization in the Route Planner."
          />
        ) : (
          <div className="card overflow-hidden border border-ink-200">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-ink-50 font-semibold text-ink-700 border-b border-ink-200">
                  <tr>
                    <th className="px-4 py-3 w-16">Run</th>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Objective</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Algorithm</th>
                    <th className="px-4 py-3 text-center">Orders</th>
                    <th className="px-4 py-3 text-center">Vehicles</th>
                    <th className="px-4 py-3">Assigned</th>
                    <th className="px-4 py-3">Distance Before → After</th>
                    <th className="px-4 py-3">Gain</th>
                    <th className="px-4 py-3">Solver Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredRuns.map((r: OptimizationRun) => {
                    const isExpanded = expandedId === r.id;
                    const dateStr = new Date(r.created_at).toLocaleString([], {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });

                    return (
                      <>
                        <tr
                          key={r.id}
                          className={`cursor-pointer hover:bg-ink-50/50 transition-all ${
                            isExpanded ? "bg-brand-50/10 font-medium" : ""
                          }`}
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        >
                          <td className="px-4 py-3 font-bold text-ink-900">#{r.id}</td>
                          <td className="px-4 py-3 text-ink-500 tabular-nums">{dateStr}</td>
                          <td className="px-4 py-3 text-ink-700">{r.objective.replace(/_/g, " ")}</td>
                          <td className="px-4 py-3">
                            <StatusBadge value={r.status} />
                          </td>
                          <td className="px-4 py-3 text-ink-600">{r.algorithm}</td>
                          <td className="px-4 py-3 text-center tabular-nums">{r.orders_count}</td>
                          <td className="px-4 py-3 text-center tabular-nums">{r.vehicles_count}</td>
                          <td className="px-4 py-3 tabular-nums">
                            {r.assigned_count} <span className="text-ink-400">/</span> {r.orders_count}
                          </td>
                          <td className="px-4 py-3 text-ink-600 tabular-nums">
                            {r.total_distance_before != null && r.total_distance_after != null
                              ? `${r.total_distance_before.toFixed(1)} → ${r.total_distance_after.toFixed(1)} km`
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {r.improvement_percentage != null ? (
                              <span className="text-emerald-600 font-bold tabular-nums">
                                +{r.improvement_percentage.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-ink-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-ink-500 tabular-nums">
                            {r.execution_time_ms != null ? `${r.execution_time_ms} ms` : "—"}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`expanded-${r.id}`} className="bg-ink-50/20 border-t border-ink-150">
                            <td colSpan={11} className="px-6 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-ink-700">
                                {/* Left detail panel */}
                                <div className="space-y-3">
                                  <h4 className="font-bold text-ink-900 border-b border-ink-150 pb-1.5 uppercase tracking-wider text-[10px]">
                                    Solver Audit Info
                                  </h4>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                    <div>
                                      <span className="text-ink-400">Run ID:</span> <span className="font-medium">#{r.id}</span>
                                    </div>
                                    <div>
                                      <span className="text-ink-400">Objective function:</span>{" "}
                                      <span className="font-medium">{r.objective}</span>
                                    </div>
                                    <div>
                                      <span className="text-ink-400">Fulfillment:</span>{" "}
                                      <span className="font-medium">
                                        {r.assigned_count} assigned, {r.unassigned_count} unassigned
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-ink-400">Algorithm config:</span>{" "}
                                      <span className="font-medium">{r.algorithm}</span>
                                    </div>
                                    {r.objective_value != null && (
                                      <div>
                                        <span className="text-ink-400">Objective score:</span>{" "}
                                        <span className="font-semibold text-indigo-600">{r.objective_value.toFixed(1)}</span>
                                      </div>
                                    )}
                                    {r.result_payload?.matrix_source && (
                                      <div>
                                        <span className="text-ink-400">Distance matrix source:</span>{" "}
                                        <span className="font-semibold text-ink-600 uppercase">{r.result_payload.matrix_source}</span>
                                      </div>
                                    )}
                                  </div>

                                  {r.status === "FAILED" && r.error_message && (
                                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 mt-2 text-red-700">
                                      <span className="font-bold">Solver Error:</span> {r.error_message}
                                    </div>
                                  )}

                                  {/* Baseline Comparison Details */}
                                  {r.result_payload?.comparison && (
                                    <div className="bg-white rounded-lg border border-ink-200 p-3 space-y-2 mt-2">
                                      <h5 className="font-semibold text-ink-800 text-[11px]">Baseline comparison</h5>
                                      <table className="w-full text-left text-[11px]">
                                        <thead>
                                          <tr className="border-b border-ink-100 text-ink-400">
                                            <th className="py-1">Metric</th>
                                            <th>Baseline (Greedy)</th>
                                            <th>Optimized (OR-Tools)</th>
                                            <th className="text-right">Saved</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-ink-50">
                                          <tr>
                                            <td className="py-1">Total Distance</td>
                                            <td className="tabular-nums">{r.result_payload.comparison.baseline.total_distance_km.toFixed(1)} km</td>
                                            <td className="tabular-nums font-bold text-brand-600">{r.result_payload.comparison.optimized.total_distance_km.toFixed(1)} km</td>
                                            <td className="text-right text-emerald-600 font-bold tabular-nums">
                                              {r.result_payload.comparison.distance_reduction_pct.toFixed(1)}%
                                            </td>
                                          </tr>
                                          <tr>
                                            <td className="py-1">Est. Duration</td>
                                            <td className="tabular-nums">{Math.round(r.result_payload.comparison.baseline.estimated_duration_minutes)} min</td>
                                            <td className="tabular-nums font-bold text-brand-600">{Math.round(r.result_payload.comparison.optimized.estimated_duration_minutes)} min</td>
                                            <td className="text-right text-emerald-600 font-bold tabular-nums">
                                              {r.result_payload.comparison.time_reduction_pct.toFixed(1)}%
                                            </td>
                                          </tr>
                                          <tr>
                                            <td className="py-1">Vehicles Used</td>
                                            <td className="tabular-nums">{r.result_payload.comparison.baseline.vehicles_used}</td>
                                            <td className="tabular-nums font-bold text-brand-600">{r.result_payload.comparison.optimized.vehicles_used}</td>
                                            <td className="text-right text-emerald-600 font-bold tabular-nums">
                                              {r.result_payload.comparison.vehicles_reduction_pct.toFixed(1)}%
                                            </td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>

                                {/* Right detail panel */}
                                <div className="space-y-3">
                                  {/* Result routes summary */}
                                  <h4 className="font-bold text-ink-900 border-b border-ink-150 pb-1.5 uppercase tracking-wider text-[10px]">
                                    Dispatched Routes Summary
                                  </h4>
                                  {r.result_payload?.routes && r.result_payload.routes.length > 0 ? (
                                    <div className="max-h-[140px] overflow-y-auto border border-ink-200 rounded-lg divide-y divide-ink-100 bg-white">
                                      {r.result_payload.routes.map((rt) => (
                                        <div key={rt.vehicle_id} className="p-2 flex justify-between items-center hover:bg-ink-50/50">
                                          <div>
                                            <div className="font-bold text-ink-800 text-[11px]">{rt.registration_number}</div>
                                            <div className="text-[10px] text-ink-400">{rt.stops.length} stops scheduled</div>
                                          </div>
                                          <div className="text-right text-[11px]">
                                            <div className="font-semibold text-ink-700">{rt.total_distance_km.toFixed(1)} km</div>
                                            <div className="text-[9px] text-ink-400">{rt.total_load_kg} kg load</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-ink-400 italic">No routes generated in this run.</p>
                                  )}

                                  {/* Unassigned orders list */}
                                  {r.result_payload?.unassigned && r.result_payload.unassigned.length > 0 ? (
                                    <div className="space-y-1.5 mt-2">
                                      <h5 className="font-bold text-amber-600 text-[10px] uppercase">
                                        ⚠️ Unassigned orders ({r.result_payload.unassigned.length})
                                      </h5>
                                      <div className="max-h-[100px] overflow-y-auto border border-amber-200 rounded-lg divide-y divide-amber-100 bg-amber-50/20">
                                        {r.result_payload.unassigned.map((un) => (
                                          <div key={un.order_id} className="p-2 flex justify-between items-center text-[10px]">
                                            <span className="font-semibold text-ink-800">Order #{un.order_number}</span>
                                            <span className="text-amber-700 font-medium">{un.reason.replace(/_/g, " ").toLowerCase()}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
