import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/Layout";
import { EmptyState, Skeleton, StatusBadge } from "../components/ui";
import { depotApi, optimizationApi, orderApi, vehicleApi } from "../api/endpoints";
import { useToast } from "../stores/toast";
import { useAuth, canManage } from "../stores/auth";
import { useFleetSocket } from "../hooks/useFleetSocket";
import { DEFAULT_CENTER, ROUTE_COLORS, coloredDot, depotIcon, MapAutoBounds } from "../utils/map";
import type { Objective, OptimizationRun } from "../types";

export default function RoutePlanner() {
  const push = useToast((s) => s.push);
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const canPlan = canManage(user?.role);

  const [selectedDepotId, setSelectedDepotId] = useState<number | null>(null);
  const [objective, setObjective] = useState<Objective>("BALANCED");
  const [solverBudget, setSolverBudget] = useState<number>(15);
  const [selOrders, setSelOrders] = useState<Set<number>>(new Set());
  const [selVehicles, setSelVehicles] = useState<Set<number>>(new Set());
  const [run, setRun] = useState<OptimizationRun | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ elapsed: number; budget: number } | null>(null);
  const [acceptedSuccess, setAcceptedSuccess] = useState(false);
  const [expandedRouteId, setExpandedRouteId] = useState<number | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const abortRef = useRef(false);

  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  const depots = useQuery({ queryKey: ["depots"], queryFn: depotApi.list });

  useEffect(() => {
    if (depots.data && depots.data.length > 0 && selectedDepotId === null) {
      setSelectedDepotId(depots.data[0].id);
    }
  }, [depots.data, selectedDepotId]);

  const depot = useMemo(() => {
    if (!depots.data || depots.data.length === 0) return null;
    return depots.data.find((d) => d.id === selectedDepotId) || depots.data[0];
  }, [depots.data, selectedDepotId]);

  const orders = useQuery({
    queryKey: ["planner-orders", selectedDepotId],
    queryFn: () => orderApi.list({ status: "PENDING", depot_id: selectedDepotId || undefined, page_size: 200 }),
    enabled: selectedDepotId !== null,
  });
  const vehicles = useQuery({
    queryKey: ["planner-vehicles", selectedDepotId],
    queryFn: () => vehicleApi.list({ status: "AVAILABLE", depot_id: selectedDepotId || undefined }),
    enabled: selectedDepotId !== null,
  });

  const depotOrders = useMemo(() => {
    const items = orders.data?.items || [];
    if (!depot) return items;
    return items.filter((o) => o.depot_id === depot.id);
  }, [orders.data, depot]);

  const filteredDepotOrders = useMemo(() => {
    if (!orderSearch.trim()) return depotOrders;
    const q = orderSearch.toLowerCase();
    return depotOrders.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.delivery_address.toLowerCase().includes(q)
    );
  }, [depotOrders, orderSearch]);

  const depotVehicles = useMemo(() => {
    const items = vehicles.data || [];
    if (!depot) return items;
    return items.filter((v) => v.home_depot_id === depot.id);
  }, [vehicles.data, depot]);

  // Pre-optimization intelligence summary
  const totalSelectedOrderWeight = useMemo(() => {
    let weight = 0;
    for (const o of depotOrders) {
      if (selOrders.has(o.id)) {
        weight += o.weight_kg || 0;
      }
    }
    return Math.round(weight * 10) / 10;
  }, [depotOrders, selOrders]);

  const totalSelectedVehicleCapacity = useMemo(() => {
    let cap = 0;
    for (const v of depotVehicles) {
      if (selVehicles.has(v.id)) {
        cap += v.capacity_kg || 0;
      }
    }
    return Math.round(cap);
  }, [depotVehicles, selVehicles]);

  // When depot changes, reset selections & current run
  const handleDepotChange = (id: number) => {
    setSelectedDepotId(id);
    setSelOrders(new Set());
    setSelVehicles(new Set());
    setRun(null);
    setAcceptedSuccess(false);
    setExpandedRouteId(null);
  };

  // Background optimization solve
  const runMut = useMutation({
    mutationFn: async () => {
      setAcceptedSuccess(false);
      abortRef.current = false;
      const queued = await optimizationApi.startJob({
        depot_id: depot!.id,
        order_ids: [...selOrders],
        vehicle_ids: [...selVehicles],
        objective,
        solver_time_limit_seconds: solverBudget,
      });
      setJobId(queued.id);
      setProgress({ elapsed: 0, budget: solverBudget });
      const startTime = Date.now();
      const MAX_WAIT_MS = 180000;
      while (!abortRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
        if (abortRef.current) {
          throw new Error("Optimization cancelled by user");
        }
        if (Date.now() - startTime > MAX_WAIT_MS) {
          throw new Error("Optimization timed out");
        }
        const latest = await optimizationApi.get(queued.id);
        if (latest.status === "COMPLETED") return latest;
        if (latest.status === "FAILED") {
          throw new Error(latest.error_message || "Optimization failed");
        }
      }
      throw new Error("Optimization cancelled");
    },
    onSuccess: (r) => {
      setRun(r);
      setJobId(null);
      push(`Optimization complete in ${r.execution_time_ms} ms`, "success");
    },
    onError: (e: any) => {
      setJobId(null);
      push(e.message || "Optimization failed", "error");
    },
  });

  const handleCancelJob = () => {
    abortRef.current = true;
    setJobId(null);
    setProgress(null);
    push("Optimization cancelled", "info");
  };

  // Progress heartbeats for the active job
  useFleetSocket((e) => {
    if (e.type === "OPTIMIZATION_PROGRESS" && e.data?.run_id === jobId) {
      setProgress({ elapsed: e.data.elapsed_seconds, budget: e.data.budget_seconds });
    }
  });

  const acceptMut = useMutation({
    mutationFn: (id: number) => optimizationApi.accept(id),
    onSuccess: () => {
      push("Plan accepted — routes are now active!", "success");
      setAcceptedSuccess(true);
      setRun(null);
      setSelOrders(new Set());
      setSelVehicles(new Set());
      orders.refetch();
      vehicles.refetch();
    },
    onError: (e: any) => push(e.message || "Failed to accept plan", "error"),
  });

  const toggle = (set: Set<number>, id: number, setter: (s: Set<number>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  const payload = run?.result_payload;
  const polylines = useMemo(() => {
    if (!payload || !depot) return [];
    return payload.routes.map((r, i) => ({
      color: ROUTE_COLORS[i % ROUTE_COLORS.length],
      positions: [
        [depot.latitude, depot.longitude],
        ...r.stops.map((s) => [s.latitude, s.longitude] as [number, number]),
        [depot.latitude, depot.longitude],
      ] as [number, number][],
      reg: r.registration_number,
    }));
  }, [payload, depot]);

  // Points for map auto-bounds
  const mapPoints = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    if (depot) pts.push([depot.latitude, depot.longitude]);

    if (payload && payload.routes.length > 0) {
      for (const r of payload.routes) {
        for (const s of r.stops) {
          pts.push([s.latitude, s.longitude]);
        }
      }
    } else {
      for (const o of depotOrders) {
        if (selOrders.has(o.id)) {
          pts.push([o.latitude, o.longitude]);
        }
      }
    }
    return pts;
  }, [depot, payload, depotOrders, selOrders]);

  const comp = payload?.comparison;

  // Workflow step determination
  const currentStep = useMemo(() => {
    if (acceptedSuccess) return 4;
    if (run && payload) return 3;
    if (runMut.isPending) return 2;
    return 1;
  }, [acceptedSuccess, run, payload, runMut.isPending]);

  // Efficiency KPIs
  const assignmentRate = useMemo(() => {
    if (!comp) return 0;
    const total = comp.optimized.assigned_orders + comp.optimized.unassigned_orders;
    return total > 0 ? Math.round((comp.optimized.assigned_orders / total) * 100) : 0;
  }, [comp]);

  const avgUtilizationPct = useMemo(() => {
    if (!payload || payload.routes.length === 0) return 0;
    const totalCap = payload.routes.reduce((sum, r) => sum + r.capacity_kg, 0);
    const totalLoad = payload.routes.reduce((sum, r) => sum + r.total_load_kg, 0);
    return totalCap > 0 ? Math.round((totalLoad / totalCap) * 100) : 0;
  }, [payload]);

  return (
    <div className="flex h-full flex-col font-sans">
      {/* Top Header */}
      <PageHeader
        title="Route Planner"
        subtitle="OR-Tools Multi-Vehicle Routing Engine & Constraint Solver"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-600 uppercase tracking-wider">Depot Hub:</span>
            <select
              className="input py-1.5 text-xs font-semibold max-w-[260px]"
              value={depot?.id || ""}
              onChange={(e) => handleDepotChange(Number(e.target.value))}
            >
              {(depots.data || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Visual Workflow Stepper Bar */}
      <div className="flex items-center justify-between border-b border-ink-200 bg-slate-900 px-6 py-2 text-white text-xs">
        <div className="flex items-center gap-6">
          <StepperItem step={1} title="1. CONFIGURE" active={currentStep === 1} completed={currentStep > 1} />
          <span className="text-slate-600">➔</span>
          <StepperItem step={2} title="2. OPTIMIZE" active={currentStep === 2} completed={currentStep > 2} />
          <span className="text-slate-600">➔</span>
          <StepperItem step={3} title="3. REVIEW RESULTS" active={currentStep === 3} completed={currentStep > 3} />
          <span className="text-slate-600">➔</span>
          <StepperItem step={4} title="4. ACCEPT PLAN" active={currentStep === 4} completed={acceptedSuccess} />
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-300">
          <span>Depot: <strong className="text-white font-semibold">{depot?.name || "None"}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Orders: <strong className="text-amber-400 font-semibold">{selOrders.size}</strong> selected</span>
          <span className="text-slate-600">•</span>
          <span>Vehicles: <strong className="text-blue-400 font-semibold">{selVehicles.size}</strong> selected</span>
        </div>
      </div>

      {/* 1-Click Transition Banner after accepting plan */}
      {acceptedSuccess && (
        <div className="flex items-center justify-between border-b border-emerald-300 bg-emerald-50 px-6 py-3 text-xs text-emerald-950 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs">✓</span>
            <div>
              <span className="font-bold text-sm">Optimization plan accepted & materialized!</span>
              <p className="text-[11px] text-emerald-800">Routes have been created in the database and assigned to vehicles.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary bg-emerald-700 hover:bg-emerald-800 text-xs px-3 py-1.5"
              onClick={() => navigate("/live")}
            >
              ▶ Launch Live Simulation
            </button>
            <button
              className="btn-secondary text-xs px-3 py-1.5 border-emerald-300"
              onClick={() => navigate("/routes")}
            >
              📋 View Active Routes
            </button>
            <button
              className="text-xs text-emerald-700 hover:text-emerald-950 px-1"
              onClick={() => setAcceptedSuccess(false)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 12-Column Main Workspace */}
      <div className="grid flex-1 grid-cols-12 gap-0 overflow-hidden">
        {/* LEFT COLUMN (3 cols): Pre-Optimization Intelligence & Order Selection */}
        <div className="col-span-3 flex flex-col overflow-hidden border-r border-ink-200 bg-white">
          <div className="p-3 border-b border-ink-100 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-700">Pre-Opt Intelligence</h3>
              <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                {depot ? depot.name.split("—")[0].trim() : "No Hub"}
              </span>
            </div>

            {/* Compact Workload Metrics Cards */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-ink-200 bg-white p-2">
                <span className="text-[10px] uppercase font-semibold text-ink-400 block">Workload Weight</span>
                <span className="font-bold text-ink-900">{totalSelectedOrderWeight} kg</span>
                <span className="text-[10px] text-ink-400 block mt-0.5">{selOrders.size} orders</span>
              </div>
              <div className="rounded border border-ink-200 bg-white p-2">
                <span className="text-[10px] uppercase font-semibold text-ink-400 block">Fleet Capacity</span>
                <span className="font-bold text-ink-900">{totalSelectedVehicleCapacity} kg</span>
                <span className="text-[10px] text-ink-400 block mt-0.5">{selVehicles.size} vehicles</span>
              </div>
            </div>
          </div>

          {/* Pending Orders Selection Header */}
          <div className="p-3 border-b border-ink-100 flex items-center justify-between gap-2">
            <div className="flex-1 relative">
              <input
                className="input text-xs py-1 pl-2 pr-6 w-full"
                placeholder="Filter orders..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
              />
              {orderSearch && (
                <button className="absolute right-2 top-1 text-ink-400 text-xs" onClick={() => setOrderSearch("")}>
                  ✕
                </button>
              )}
            </div>
            <button
              className="text-[11px] font-semibold text-brand-600 hover:underline whitespace-nowrap"
              onClick={() => setSelOrders(new Set(depotOrders.slice(0, 50).map((o) => o.id)))}
            >
              Select 50
            </button>
            <button
              className="text-[11px] text-ink-400 hover:underline whitespace-nowrap"
              onClick={() => setSelOrders(new Set())}
            >
              Clear
            </button>
          </div>

          {/* Pending Orders List */}
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {orders.isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredDepotOrders.length === 0 ? (
              <EmptyState title="No pending orders" hint="All orders for this depot are dispatched or delivered." />
            ) : (
              filteredDepotOrders.map((o) => (
                <label
                  key={o.id}
                  className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition ${
                    selOrders.has(o.id)
                      ? "border-brand-500 bg-brand-50/70 font-medium shadow-2xs"
                      : "border-ink-100 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded text-brand-600"
                    checked={selOrders.has(o.id)}
                    onChange={() => toggle(selOrders, o.id, setSelOrders)}
                  />
                  <div className="flex flex-1 flex-col truncate">
                    <span className="font-semibold text-ink-900 truncate">{o.order_number}</span>
                    <span className="text-[11px] text-ink-500 truncate">{o.delivery_address}</span>
                  </div>
                  <span className="text-[11px] font-mono text-ink-700 whitespace-nowrap">{o.weight_kg}kg</span>
                  <StatusBadge value={o.priority} />
                </label>
              ))
            )}
          </div>
          <div className="border-t border-ink-200 px-3 py-2 text-xs font-semibold text-ink-600 bg-slate-50 flex justify-between">
            <span>Selected: {selOrders.size} / {depotOrders.length}</span>
            <span>Weight: {totalSelectedOrderWeight} kg</span>
          </div>
        </div>

        {/* CENTER COLUMN (5 cols): Interactive Geospatial Map */}
        <div className="col-span-5 relative bg-slate-100">
          <MapContainer center={DEFAULT_CENTER} zoom={11} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            <MapAutoBounds points={mapPoints} initialOnly={true} />
            {depot && (
              <Marker position={[depot.latitude, depot.longitude]} icon={depotIcon}>
                <Popup>
                  <div className="font-bold text-sm">{depot.name}</div>
                  <div className="text-xs text-ink-600">{depot.address}</div>
                  <div className="text-xs text-ink-500 mt-1">Operating: {depot.operating_start} – {depot.operating_end}</div>
                </Popup>
              </Marker>
            )}
            {polylines.map((p, i) => (
              <Polyline key={i} positions={p.positions} pathOptions={{ color: p.color, weight: 4.5, opacity: 0.9 }} />
            ))}
            {payload
              ? payload.routes.flatMap((r, ri) =>
                  r.stops.map((s) => (
                    <Marker
                      key={`${ri}-${s.order_id}`}
                      position={[s.latitude, s.longitude]}
                      icon={coloredDot(ROUTE_COLORS[ri % ROUTE_COLORS.length], 16)}
                    >
                      <Popup>
                        <div className="text-xs font-sans">
                          <strong className="block font-bold text-ink-900">{s.order_number}</strong>
                          <div>Stop #{s.stop_sequence} · Vehicle: {r.registration_number}</div>
                          <div>Load: {s.load_kg} kg · ETA: +{Math.round(s.eta_minutes_from_start)}m</div>
                          <div className="text-[11px] text-ink-400 mt-0.5">Dist from prev: {s.distance_from_previous_km} km</div>
                        </div>
                      </Popup>
                    </Marker>
                  ))
                )
              : depotOrders
                  .filter((o) => selOrders.has(o.id))
                  .map((o) => (
                    <Marker key={o.id} position={[o.latitude, o.longitude]} icon={coloredDot("#2f66f6", 12)}>
                      <Popup>
                        <div className="font-semibold text-xs">{o.order_number}</div>
                        <div className="text-xs text-ink-500">{o.delivery_address}</div>
                        <div className="text-xs font-mono">{o.weight_kg} kg</div>
                      </Popup>
                    </Marker>
                  ))}
          </MapContainer>
        </div>

        {/* RIGHT COLUMN (4 cols): Solver Control Panel & Optimization Results */}
        <div className="col-span-4 flex flex-col overflow-y-auto border-l border-ink-200 bg-white">
          {/* Solver Controls */}
          <div className="p-4 border-b border-ink-200 space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-700">Available Fleet Vehicles</h3>
              <button
                className="text-[11px] font-semibold text-brand-600 hover:underline"
                onClick={() => setSelVehicles(new Set(depotVehicles.map((v) => v.id)))}
              >
                Select All ({depotVehicles.length})
              </button>
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
              {depotVehicles.length === 0 ? (
                <div className="text-xs text-ink-400 py-2">No available vehicles for this depot.</div>
              ) : (
                depotVehicles.map((v) => (
                  <label
                    key={v.id}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs transition ${
                      selVehicles.has(v.id) ? "border-brand-500 bg-brand-50 font-medium" : "border-ink-100 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded text-brand-600"
                      checked={selVehicles.has(v.id)}
                      onChange={() => toggle(selVehicles, v.id, setSelVehicles)}
                    />
                    <span className="flex-1 truncate font-semibold text-ink-900">{v.registration_number}</span>
                    <span className="text-[11px] font-mono text-ink-500">{v.capacity_kg} kg</span>
                  </label>
                ))
              )}
            </div>

            {/* Objective & Solver Time Budget controls */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="label text-[11px]">Objective</label>
                <select
                  className="input text-xs py-1"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value as Objective)}
                >
                  <option value="BALANCED">Balanced (Dist & Time)</option>
                  <option value="MIN_DISTANCE">Min Distance</option>
                  <option value="MIN_TIME">Min Time</option>
                </select>
              </div>

              <div>
                <label className="label text-[11px]">Solver Budget</label>
                <select
                  className="input text-xs py-1"
                  value={solverBudget}
                  onChange={(e) => setSolverBudget(Number(e.target.value))}
                >
                  <option value={10}>Quick (10s limit)</option>
                  <option value={15}>Standard (15s limit)</option>
                  <option value={30}>Extended (30s limit)</option>
                  <option value={60}>Deep Opt (60s limit)</option>
                </select>
              </div>
            </div>

            {/* Primary Optimize Button */}
            {runMut.isPending ? (
              <div className="flex gap-2 pt-1">
                <button className="btn-primary flex-1 opacity-80 cursor-not-allowed text-xs py-2" disabled>
                  ⚙ Solving with OR-Tools ({progress?.elapsed ?? 0}s)…
                </button>
                <button
                  className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 text-xs px-3"
                  onClick={handleCancelJob}
                >
                  Cancel
                </button>
              </div>
            ) : (() => {
              let isDisabled = !canPlan || !depot || selOrders.size === 0 || selVehicles.size === 0 || totalSelectedOrderWeight > totalSelectedVehicleCapacity;
              let buttonText = "Optimize Routes with OR-Tools";
              if (!canPlan) buttonText = "Read-Only (Viewer Mode)";
              else if (!depot) buttonText = "No Depot Selected";
              else if (selOrders.size === 0) buttonText = "Select Orders to Optimize";
              else if (selVehicles.size === 0) buttonText = "Select Vehicles to Optimize";
              else if (totalSelectedOrderWeight > totalSelectedVehicleCapacity) buttonText = "Insufficient Capacity";

              return (
                <button
                  className="btn-primary w-full shadow-xs text-xs py-2.5 font-bold flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:text-slate-500 disabled:border-slate-300 disabled:cursor-not-allowed"
                  disabled={isDisabled}
                  onClick={() => runMut.mutate()}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {buttonText}
                </button>
              );
            })()}
          </div>

          {/* Results Area */}
          <div className="flex-1 p-4 space-y-4">
            {/* Solver progress state */}
            {runMut.isPending && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-ink-500">
                  <span className="font-bold text-brand-600">OR-Tools Constraint Solver Active</span>
                  {progress && progress.budget > 0 && (
                    <span className="font-mono text-ink-700">
                      {progress.elapsed}s / {progress.budget}s
                    </span>
                  )}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all duration-500"
                    style={{
                      width: progress?.budget
                        ? `${Math.min(99, (progress.elapsed / progress.budget) * 100)}%`
                        : "20%",
                    }}
                  />
                </div>
                <p className="text-[11px] text-ink-400">
                  Running vehicle routing problem (VRP) optimization with capacity constraints and time windows.
                </p>
                <Skeleton className="h-32 w-full" />
              </div>
            )}

            {!run && !runMut.isPending && (
              <EmptyState
                title="No plan generated yet"
                hint="Select orders and vehicles above, then click 'Optimize Routes with OR-Tools'."
              />
            )}

            {/* Optimization Results Display */}
            {run && payload && comp && (
              <div className="space-y-4">
                {/* Proposed Plan Header & Badges */}
                <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-brand-900 text-sm">PROPOSED PLAN</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        payload.plan_source === "solver"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : "bg-amber-100 text-amber-800 border border-amber-300"
                      }`}
                    >
                      {payload.plan_source === "solver" ? "OR-TOOLS SOLVER" : "GREEDY BASELINE"}
                    </span>
                  </div>
                  <p className="text-[11px] text-brand-950">
                    Awaiting dispatch review. Click <strong>"Accept Plan"</strong> to materialize routes into active fleet operations.
                  </p>
                </div>

                {/* Efficiency KPIs Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <KpiBox label="Routes Created" value={payload.routes.length} />
                  <KpiBox label="Assignment Rate" value={`${assignmentRate}%`} highlight />
                  <KpiBox label="Vehicles Used" value={`${comp.optimized.vehicles_used} / ${selVehicles.size}`} />
                  <KpiBox label="Avg Utilization" value={`${avgUtilizationPct}%`} />
                  <KpiBox label="Total Distance" value={`${comp.optimized.total_distance_km} km`} />
                  <KpiBox label="Solver Runtime" value={`${run.execution_time_ms} ms`} />
                </div>

                {/* Baseline Comparison */}
                <div className="rounded-lg bg-slate-50 p-3 border border-ink-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-800">
                    <span>Performance vs Baseline</span>
                    <span className="text-[11px] text-emerald-600 font-mono">
                      Objective: {run.objective_value ? run.objective_value.toFixed(1) : "N/A"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                    <div className="rounded bg-white p-2 border border-ink-100 shadow-2xs">
                      <div className="text-sm font-bold text-emerald-600">{comp.distance_reduction_pct}%</div>
                      <div className="text-[10px] text-ink-400">Distance Saved</div>
                    </div>
                    <div className="rounded bg-white p-2 border border-ink-100 shadow-2xs">
                      <div className="text-sm font-bold text-emerald-600">{comp.time_reduction_pct}%</div>
                      <div className="text-[10px] text-ink-400">Time Saved</div>
                    </div>
                    <div className="rounded bg-white p-2 border border-ink-100 shadow-2xs">
                      <div className="text-sm font-bold text-emerald-600">{comp.vehicles_reduction_pct}%</div>
                      <div className="text-[10px] text-ink-400">Fleet Saved</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-ink-500 pt-1">
                    Naive Baseline: {comp.baseline.total_distance_km} km across {comp.baseline.vehicles_used} vehicles.
                  </div>
                </div>

                {/* Route Results Table with Expandable Stops */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-700">Planned Route Breakdown</h4>
                  <div className="space-y-2">
                    {payload.routes.map((r, idx) => {
                      const isExpanded = expandedRouteId === r.vehicle_id;
                      const loadPct = r.capacity_kg > 0 ? Math.round((r.total_load_kg / r.capacity_kg) * 100) : 0;
                      return (
                        <div key={r.vehicle_id} className="rounded-lg border border-ink-200 bg-white overflow-hidden text-xs">
                          {/* Route Row Summary */}
                          <div
                            className="flex items-center justify-between p-3 bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer transition-colors"
                            onClick={() => setExpandedRouteId(isExpanded ? null : r.vehicle_id)}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-brand-800">Route #{idx + 1}</span>
                                <span className="font-semibold text-ink-900">({r.registration_number})</span>
                              </div>
                              <div className="text-[11px] text-ink-500 mt-0.5">
                                {r.stops.length} stops · {r.total_distance_km} km · ~{Math.round(r.estimated_duration_minutes)} min
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="font-semibold text-ink-800">{loadPct}% load</span>
                                <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-0.5">
                                  <div
                                    className={`h-full ${loadPct > 90 ? "bg-amber-500" : "bg-brand-600"}`}
                                    style={{ width: `${Math.min(100, loadPct)}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-ink-400 font-bold">{isExpanded ? "▲" : "▼"}</span>
                            </div>
                          </div>

                          {/* Expanded Stop Sequence Details */}
                          {isExpanded && (
                            <div className="p-3 border-t border-ink-100 bg-white space-y-2">
                              <div className="flex justify-between text-[11px] font-semibold text-ink-500 uppercase border-b border-ink-100 pb-1">
                                <span>Stop Sequence</span>
                                <span>Weight / ETA</span>
                              </div>
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {r.stops.map((s) => (
                                  <div key={s.order_id} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 last:border-0">
                                    <div>
                                      <span className="font-bold text-brand-700 mr-1.5">#{s.stop_sequence}</span>
                                      <span className="font-medium text-ink-900">{s.order_number}</span>
                                      <span className="text-ink-400 block text-[10px]">+ {s.distance_from_previous_km} km from prev</span>
                                    </div>
                                    <div className="text-right font-mono">
                                      <span>{s.load_kg} kg</span>
                                      <span className="text-ink-400 block text-[10px]">+{Math.round(s.eta_minutes_from_start)} m</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Unassigned Orders Diagnostic Section */}
                {payload.unassigned.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-bold text-amber-900">
                      <svg className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{payload.unassigned.length} Unassigned Orders (Optimization Diagnostic)</span>
                    </div>
                    <div className="space-y-1.5">
                      {payload.unassigned.map((u) => (
                        <div key={u.order_id} className="rounded bg-white p-2 border border-amber-200 text-[11px] space-y-0.5">
                          <div className="font-bold text-amber-950">{u.order_number}</div>
                          <div className="text-amber-800 font-mono text-[10px]">{u.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons: Accept / Discard */}
                <div className="flex gap-2 pt-2">
                  <button
                    className="btn-primary flex-1 shadow-sm text-xs py-2.5 font-bold"
                    disabled={acceptMut.isPending}
                    onClick={() => acceptMut.mutate(run.id)}
                  >
                    {acceptMut.isPending ? "Accepting Plan…" : "✓ Accept & Dispatch Plan"}
                  </button>
                  <button
                    className="btn-secondary text-xs px-3 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                    onClick={() => setRun(null)}
                  >
                    Discard Plan
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stepper Header Item
function StepperItem({ step, title, active, completed }: { step: number; title: string; active: boolean; completed: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 font-bold text-[11px] ${active ? "text-brand-400" : completed ? "text-emerald-400" : "text-slate-500"}`}>
      <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${active ? "bg-brand-500 text-white" : completed ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400"}`}>
        {completed ? "✓" : step}
      </span>
      <span>{title}</span>
    </div>
  );
}

// Compact KPI Box
function KpiBox({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 border text-xs ${highlight ? "bg-emerald-50/60 border-emerald-200" : "bg-slate-50 border-ink-100"}`}>
      <div className="text-[10px] font-semibold uppercase text-ink-400">{label}</div>
      <div className={`font-bold mt-0.5 text-sm ${highlight ? "text-emerald-700" : "text-ink-900"}`}>{value}</div>
    </div>
  );
}
