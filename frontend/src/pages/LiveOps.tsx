import { useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../components/Layout";
import { StatusBadge, Skeleton } from "../components/ui";
import { dashboardApi, depotApi, routeApi, simulationApi, vehicleApi } from "../api/endpoints";
import { useFleetSocket } from "../hooks/useFleetSocket";
import { useToast } from "../stores/toast";
import { useAuth, canManage } from "../stores/auth";
import {
  DEFAULT_CENTER,
  ROUTE_COLORS,
  coloredDot,
  depotIcon,
  vehicleIcon,
  MapAutoBounds,
} from "../utils/map";
import type { Route, Vehicle, WsEvent } from "../types";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
interface LiveVehicle {
  vehicle_id: number;
  route_id: number;
  lat: number;
  lon: number;
  speed_kmh?: number;
  current_stop_sequence?: number;
  order_id?: number;
}

interface FeedEntry {
  id: number;
  type: string;
  message: string;
  ts: string;
  category: "delivery" | "route" | "vehicle" | "sim" | "traffic" | "info";
}

let _feedId = 0;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function categoryColor(cat: FeedEntry["category"]): string {
  switch (cat) {
    case "delivery": return "text-emerald-600";
    case "route":    return "text-blue-600";
    case "vehicle":  return "text-brand-600";
    case "traffic":  return "text-amber-600";
    case "sim":      return "text-purple-600";
    default:         return "text-ink-500";
  }
}

function categoryDot(cat: FeedEntry["category"]): string {
  switch (cat) {
    case "delivery": return "bg-emerald-500";
    case "route":    return "bg-blue-500";
    case "vehicle":  return "bg-brand-500";
    case "traffic":  return "bg-amber-500";
    case "sim":      return "bg-purple-500";
    default:         return "bg-ink-400";
  }
}

function eventTypeLabel(type: string): string {
  switch (type) {
    case "VEHICLE_LOCATION_UPDATED": return "LOCATION";
    case "ORDER_STATUS_UPDATED":     return "ORDER";
    case "DELIVERY_COMPLETED":       return "DELIVERED";
    case "ROUTE_STATUS_UPDATED":     return "ROUTE";
    case "ROUTE_DELAYED":            return "DELAY";
    case "ROUTE_REOPTIMIZED":        return "RE-OPT";
    case "SIMULATION_STARTED":       return "SIM START";
    case "SIMULATION_STOPPED":       return "SIM STOP";
    default:                         return type;
  }
}

function routeProgress(route: Route): { completed: number; total: number; pct: number; remaining: number } {
  const total = route.stops.length;
  const completed = Math.min(route.progress_stop_index, total);
  const remaining = Math.max(0, total - completed);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, pct, remaining };
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------
export default function LiveOps() {
  const qc = useQueryClient();
  const push = useToast((s) => s.push);
  const user = useAuth((s) => s.user);
  const canControl = canManage(user?.role);

  const [speed, setSpeed] = useState(10);
  const [positions, setPositions] = useState<Record<number, LiveVehicle>>({});
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const feedRef = useRef<FeedEntry[]>([]);
  const MAX_FEED = 60;

  // ------ Queries ------
  const depots = useQuery({ queryKey: ["depots"], queryFn: depotApi.list });
  const routes = useQuery({
    queryKey: ["active-routes"],
    queryFn: () => routeApi.list("ACTIVE"),
    refetchInterval: 4000,
  });
  const vehicles = useQuery({ queryKey: ["vehicles-all"], queryFn: () => vehicleApi.list() });
  const simStatus = useQuery({
    queryKey: ["sim-status"],
    queryFn: simulationApi.status,
    refetchInterval: 3000,
  });
  const dashSummary = useQuery({
    queryKey: ["dash-summary-live"],
    queryFn: dashboardApi.summary,
    refetchInterval: 5000,
  });

  // ------ Feed utility ------
  const pushFeed = (type: string, message: string, category: FeedEntry["category"] = "info") => {
    const entry: FeedEntry = {
      id: ++_feedId,
      type,
      message,
      ts: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      category,
    };
    feedRef.current = [entry, ...feedRef.current].slice(0, MAX_FEED);
    setFeed([...feedRef.current]);
  };

  // ------ WebSocket event handler ------
  const onEvent = (e: WsEvent) => {
    switch (e.type) {
      case "SNAPSHOT":
        if (e.data?.vehicles) {
          const next: Record<number, LiveVehicle> = {};
          for (const v of e.data.vehicles) {
            next[v.vehicle_id] = {
              vehicle_id: v.vehicle_id,
              route_id: v.route_id,
              lat: v.latitude,
              lon: v.longitude,
              speed_kmh: v.speed_kmh,
              current_stop_sequence: v.current_stop_sequence,
              order_id: v.order_id,
            };
          }
          setPositions(next);
        }
        break;

      case "VEHICLE_LOCATION_UPDATED":
        setPositions((p) => ({
          ...p,
          [e.data.vehicle_id]: {
            vehicle_id: e.data.vehicle_id,
            route_id: e.data.route_id,
            lat: e.data.latitude,
            lon: e.data.longitude,
            speed_kmh: e.data.speed_kmh,
            current_stop_sequence: e.data.current_stop_sequence,
            order_id: e.data.order_id,
          },
        }));
        break;

      case "ORDER_STATUS_UPDATED":
        pushFeed("ORDER_STATUS_UPDATED",
          `Order ${e.data.order_number ?? `#${e.data.order_id}`} → ${e.data.status}`,
          "delivery"
        );
        qc.invalidateQueries({ queryKey: ["active-routes"] });
        qc.invalidateQueries({ queryKey: ["dash-summary-live"] });
        break;

      case "DELIVERY_COMPLETED":
        pushFeed("DELIVERY_COMPLETED",
          `Delivered: Order #${e.data.order_id}${e.data.stop_sequence != null ? ` (stop ${e.data.stop_sequence})` : ""}`,
          "delivery"
        );
        qc.invalidateQueries({ queryKey: ["active-routes"] });
        qc.invalidateQueries({ queryKey: ["dash-summary-live"] });
        break;

      case "ROUTE_STATUS_UPDATED":
        pushFeed("ROUTE_STATUS_UPDATED",
          `Route ${e.data.route_code ?? `#${e.data.route_id}`} → ${e.data.status}`,
          "route"
        );
        qc.invalidateQueries({ queryKey: ["active-routes"] });
        break;

      case "ROUTE_DELAYED":
        setWarning(
          `Route ${e.data.route_id}: +${e.data.added_delay_minutes} min delay (${e.data.severity})` +
          (e.data.late_orders?.length ? ` — ${e.data.late_orders.length} deliveries at risk` : "")
        );
        pushFeed("ROUTE_DELAYED",
          `Traffic incident on route ${e.data.route_id}: +${e.data.added_delay_minutes} min (${e.data.severity})`,
          "traffic"
        );
        break;

      case "ROUTE_REOPTIMIZED":
        pushFeed("ROUTE_REOPTIMIZED",
          `Route ${e.data.route_id} re-optimized — ${e.data.remaining_distance_km} km remaining`,
          "route"
        );
        setWarning(null);
        qc.invalidateQueries({ queryKey: ["active-routes"] });
        break;

      case "SIMULATION_STARTED":
        pushFeed("SIMULATION_STARTED", `Simulation started @ ${e.data?.speed_multiplier ?? speed}x speed`, "sim");
        qc.invalidateQueries({ queryKey: ["sim-status"] });
        break;

      case "SIMULATION_STOPPED":
        pushFeed("SIMULATION_STOPPED", "Simulation stopped — vehicles halted.", "sim");
        qc.invalidateQueries({ queryKey: ["sim-status"] });
        setPositions({});
        break;
    }
  };

  const { connected } = useFleetSocket(onEvent);

  // ------ Mutations ------
  const startMut = useMutation({
    mutationFn: () => simulationApi.start(speed),
    onSuccess: (r) => {
      if (r.started === false) {
        push(r.reason ?? "No planned/active routes to simulate", "error");
      } else {
        push(`Simulation active at ${speed}x speed`, "success");
        qc.invalidateQueries({ queryKey: ["sim-status"] });
      }
    },
    onError: (e: any) => push(e.message ?? "Failed to start simulation", "error"),
  });

  const stopMut = useMutation({
    mutationFn: () => simulationApi.stop(),
    onSuccess: () => {
      push("Simulation stopped", "info");
      qc.invalidateQueries({ queryKey: ["sim-status"] });
    },
    onError: (e: any) => push(e.message ?? "Failed to stop simulation", "error"),
  });

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (simStatus.data?.running && canControl) {
      simulationApi.speed(newSpeed).catch(() => {});
      push(`Speed changed to ${newSpeed}x`, "info");
    }
  };

  const trafficMut = useMutation({
    mutationFn: (sev: string) => simulationApi.traffic(selectedRouteId!, sev),
    onSuccess: (r) =>
      push(`Traffic condition applied: +${r.added_delay_minutes} min delay`, "info"),
    onError: (e: any) => push(e.message ?? "Failed to apply traffic", "error"),
  });

  const reoptMut = useMutation({
    mutationFn: () => simulationApi.reoptimize(selectedRouteId!),
    onSuccess: (r) => {
      push(r.reoptimized ? "Route re-optimized" : r.reason, r.reoptimized ? "success" : "info");
      qc.invalidateQueries({ queryKey: ["active-routes"] });
    },
    onError: (e: any) => push(e.message ?? "Reoptimize failed", "error"),
  });

  // ------ Derived data ------
  const depotMap = useMemo(
    () => new Map((depots.data ?? []).map((d) => [d.id, d])),
    [depots.data]
  );
  const vehicleMap = useMemo(
    () => new Map((vehicles.data ?? []).map((v) => [v.id, v])),
    [vehicles.data]
  );
  const routeMap = useMemo(
    () => new Map((routes.data ?? []).map((r) => [r.id, r])),
    [routes.data]
  );

  const defaultDepot = depots.data?.[0];

  const routePolylines = useMemo(() => {
    if (!depots.data?.length) return [];
    return (routes.data ?? []).map((r, i) => {
      const rDepot = (r.depot_id && depotMap.get(r.depot_id)) || defaultDepot;
      const anchor: [number, number] = rDepot
        ? [rDepot.latitude, rDepot.longitude]
        : DEFAULT_CENTER;
      return {
        id: r.id,
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
        depot: rDepot,
        positions: [
          anchor,
          ...[...r.stops]
            .sort((a, b) => a.stop_sequence - b.stop_sequence)
            .map((s) => [s.latitude, s.longitude] as [number, number]),
          anchor,
        ] as [number, number][],
      };
    });
  }, [routes.data, depots.data, depotMap, defaultDepot]);

  const mapPoints = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    for (const d of depots.data ?? []) pts.push([d.latitude, d.longitude]);
    for (const r of routes.data ?? []) {
      for (const s of r.stops) pts.push([s.latitude, s.longitude]);
    }
    for (const v of Object.values(positions)) pts.push([v.lat, v.lon]);
    return pts;
  }, [depots.data, routes.data, positions]);

  const isSimRunning = Boolean(simStatus.data?.running);
  const simSpeed = simStatus.data?.speed_multiplier ?? speed;

  // Selected objects
  const selectedRoute: Route | undefined = selectedRouteId ? routeMap.get(selectedRouteId) : undefined;
  const selectedVehicle: Vehicle | undefined = selectedVehicleId ? vehicleMap.get(selectedVehicleId) : undefined;
  const selectedLiveVehicle: LiveVehicle | undefined = selectedVehicleId ? positions[selectedVehicleId] : undefined;
  const vehicleForRoute: Vehicle | undefined = selectedRoute?.vehicle_id
    ? vehicleMap.get(selectedRoute.vehicle_id)
    : undefined;

  // Live KPIs from dashboard + sim status
  const ds = dashSummary.data;
  const liveActiveVehicles = simStatus.data?.active_vehicles ?? ds?.active_vehicles ?? 0;

  return (
    <div className="flex h-full flex-col font-sans">
      {/* ===================== HEADER ===================== */}
      <PageHeader
        title="Live Operations"
        subtitle="Real-Time Fleet Intelligence & Simulation Console"
        actions={
          <div className="flex items-center gap-2">
            {/* WS indicator */}
            <div className="flex items-center gap-1.5 rounded border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium shadow-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}
              />
              <span className={connected ? "text-emerald-700" : "text-red-600"}>
                {connected ? "WS Connected" : "Reconnecting…"}
              </span>
            </div>

            {/* Speed selector */}
            <label className="text-xs font-semibold text-ink-600">Speed:</label>
            <select
              className="input py-1 text-xs font-medium"
              value={speed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
            >
              <option value={1}>1× Real-time</option>
              <option value={5}>5× Speed</option>
              <option value={10}>10× Speed</option>
              <option value={20}>20× Speed</option>
            </select>

            {/* Start / Stop */}
            {!isSimRunning ? (
              <button
                className="btn-primary text-xs shadow-xs py-1.5 px-4"
                disabled={startMut.isPending}
                onClick={() => startMut.mutate()}
              >
                {startMut.isPending ? "Starting…" : "▶ Start Simulation"}
              </button>
            ) : (
              <>
                <button
                  className="btn-primary text-xs py-1.5 px-4 opacity-80 cursor-not-allowed"
                  disabled
                >
                  ● Simulating {simSpeed}×
                </button>
                <button
                  className="btn-secondary text-xs py-1.5 px-3 text-red-600 border-red-200 hover:bg-red-50"
                  disabled={stopMut.isPending}
                  onClick={() => stopMut.mutate()}
                >
                  ■ Stop
                </button>
              </>
            )}
          </div>
        }
      />

      {/* ===================== LIVE KPI STRIP ===================== */}
      <div className="flex items-center gap-0 border-b border-ink-200 bg-slate-900 px-6 py-1.5 text-xs">
        <KpiChip
          label="Active Routes"
          value={routes.data?.length ?? ds?.active_routes ?? 0}
          color="text-blue-400"
          loading={routes.isLoading}
        />
        <KpiDivider />
        <KpiChip
          label="Vehicles In Transit"
          value={liveActiveVehicles}
          color="text-emerald-400"
          loading={simStatus.isLoading}
        />
        <KpiDivider />
        <KpiChip
          label="Available Vehicles"
          value={ds?.available_vehicles ?? 0}
          color="text-slate-300"
          loading={dashSummary.isLoading}
        />
        <KpiDivider />
        <KpiChip
          label="Delivered Today"
          value={ds?.delivered_today ?? 0}
          color="text-emerald-400"
          loading={dashSummary.isLoading}
        />
        <KpiDivider />
        <KpiChip
          label="Out for Delivery"
          value={ds?.out_for_delivery ?? 0}
          color="text-amber-400"
          loading={dashSummary.isLoading}
        />
        <KpiDivider />
        <KpiChip
          label="Distance Today"
          value={`${ds?.total_distance_today_km ?? 0} km`}
          color="text-slate-300"
          loading={dashSummary.isLoading}
        />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
          <span>On-time Rate:</span>
          <span className="font-bold text-slate-200">{ds?.on_time_delivery_rate ?? 0}%</span>
        </div>
      </div>

      {/* ===================== TRAFFIC ALERT BANNER ===================== */}
      {warning && (
        <div className="flex items-center justify-between border-b border-amber-300 bg-amber-50 px-5 py-2 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="font-semibold">Traffic Incident:</span>
            <span>{warning}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary text-xs py-1 px-3"
              disabled={!selectedRouteId || reoptMut.isPending}
              onClick={() => reoptMut.mutate()}
            >
              {reoptMut.isPending ? "Re-optimizing…" : "⚡ Reoptimize Route"}
            </button>
            <button className="text-amber-700 hover:text-amber-950 px-1" onClick={() => setWarning(null)}>✕</button>
          </div>
        </div>
      )}

      {/* ===================== 12-COL WORKSPACE ===================== */}
      <div className="grid flex-1 grid-cols-12 overflow-hidden">
        {/* MAP: 8 cols */}
        <div className="col-span-8 relative bg-slate-100">
          <MapContainer center={DEFAULT_CENTER} zoom={11} className="h-full w-full">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap"
            />
            <MapAutoBounds points={mapPoints} initialOnly={true} />

            {/* Depot markers */}
            {(depots.data ?? []).map((d) => (
              <Marker key={d.id} position={[d.latitude, d.longitude]} icon={depotIcon}>
                <Popup>
                  <div className="font-bold text-sm">{d.name}</div>
                  <div className="text-xs text-ink-500">{d.address}</div>
                </Popup>
              </Marker>
            ))}

            {/* Route polylines */}
            {routePolylines.map((p) => (
              <Polyline
                key={p.id}
                positions={p.positions}
                pathOptions={{
                  color: p.color,
                  weight: selectedRouteId === p.id ? 6 : 3.5,
                  opacity: selectedRouteId === p.id ? 0.97 : 0.55,
                }}
                eventHandlers={{ click: () => setSelectedRouteId(p.id) }}
              />
            ))}

            {/* Live vehicle markers (WS positions) */}
            {Object.values(positions).map((lv) => {
              const pIdx = routePolylines.findIndex((p) => p.id === lv.route_id);
              const color = ROUTE_COLORS[(pIdx < 0 ? 0 : pIdx) % ROUTE_COLORS.length];
              const vehInfo = vehicleMap.get(lv.vehicle_id);
              const routeInfo = routeMap.get(lv.route_id);
              const prog = routeInfo ? routeProgress(routeInfo) : null;

              return (
                <Marker
                  key={lv.vehicle_id}
                  position={[lv.lat, lv.lon]}
                  icon={vehicleIcon(color)}
                  eventHandlers={{
                    click: () => {
                      setSelectedVehicleId(lv.vehicle_id);
                      if (routeInfo) setSelectedRouteId(routeInfo.id);
                    },
                  }}
                >
                  <Popup>
                    <div className="min-w-[180px] p-1 text-xs font-sans space-y-1">
                      <div className="flex items-center justify-between border-b border-ink-100 pb-1.5 mb-1">
                        <span className="font-bold text-ink-900 text-sm">
                          {vehInfo?.registration_number ?? `Vehicle #${lv.vehicle_id}`}
                        </span>
                        <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                          {routeInfo?.route_code ?? `Route #${lv.route_id}`}
                        </span>
                      </div>
                      <div className="space-y-0.5 text-ink-700">
                        {vehInfo?.driver_name && (
                          <div><span className="text-ink-400">Driver:</span> {vehInfo.driver_name}</div>
                        )}
                        {vehInfo?.vehicle_type && (
                          <div><span className="text-ink-400">Type:</span> {vehInfo.vehicle_type}</div>
                        )}
                        <div>
                          <span className="text-ink-400">Status:</span>{" "}
                          <span className="font-semibold text-emerald-700">In Transit</span>
                        </div>
                        {prog && (
                          <div>
                            <span className="text-ink-400">Progress:</span>{" "}
                            {prog.completed} / {prog.total} stops ({prog.pct}%)
                          </div>
                        )}
                        <div className="text-[11px] text-ink-500 pt-0.5">
                          {lv.lat.toFixed(5)}, {lv.lon.toFixed(5)}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Completed stop dots for selected route */}
            {selectedRoute &&
              selectedRoute.stops.map((s) => {
                const isDone = s.status === "COMPLETED";
                return (
                  <Marker
                    key={s.id}
                    position={[s.latitude, s.longitude]}
                    icon={coloredDot(isDone ? "#22c55e" : "#94a3b8", isDone ? 10 : 8)}
                  >
                    <Popup>
                      <div className="text-xs">
                        <div className="font-bold">Stop #{s.stop_sequence}</div>
                        <div className="text-ink-500 capitalize">{s.status.toLowerCase()}</div>
                        {s.actual_arrival && (
                          <div className="text-ink-400 text-[11px]">
                            Arrived: {new Date(s.actual_arrival).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
          </MapContainer>
        </div>

        {/* ===================== RIGHT PANEL: 4 cols ===================== */}
        <div className="col-span-4 flex flex-col overflow-hidden border-l border-ink-200 bg-white">
          {/* --- ACTIVE ROUTES LIST --- */}
          <div className="border-b border-ink-200 bg-white">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-700">
                Active Routes
              </h3>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                {routes.data?.length ?? 0}
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto px-2 pb-2 space-y-1">
              {routes.isLoading ? (
                <div className="space-y-1.5 px-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (routes.data ?? []).length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-ink-400">
                  No active routes. Accept an optimization plan to begin.
                </div>
              ) : (
                (routes.data ?? []).map((r) => {
                  const prog = routeProgress(r);
                  const isSelected = selectedRouteId === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRouteId(isSelected ? null : r.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors border ${
                        isSelected
                          ? "border-brand-400 bg-brand-50 shadow-xs"
                          : "border-transparent hover:bg-ink-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink-900">{r.route_code}</span>
                        <StatusBadge value={r.status} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full transition-all duration-500"
                            style={{ width: `${prog.pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-ink-600 whitespace-nowrap">
                          {prog.completed}/{prog.total} stops
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Route detail + incident panel */}
            {selectedRoute && (
              <div className="mx-2 mb-2 rounded-lg border border-ink-200 bg-slate-50 p-3 space-y-2.5 text-xs">
                {/* Route Progress Detail */}
                <div className="space-y-1">
                  <div className="font-bold text-ink-800">{selectedRoute.route_code} — Progress</div>
                  {(() => {
                    const prog = routeProgress(selectedRoute);
                    return (
                      <>
                        <div className="flex justify-between text-ink-600">
                          <span>Completed: <strong>{prog.completed}</strong></span>
                          <span>Remaining: <strong>{prog.remaining}</strong></span>
                          <span>Total: <strong>{prog.total}</strong></span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full"
                            style={{ width: `${prog.pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-ink-500 text-[11px]">
                          <span>{prog.pct}% complete</span>
                          <span>{selectedRoute.total_distance_km} km total</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {vehicleForRoute && (
                  <div className="rounded bg-white p-2 border border-ink-100 space-y-0.5">
                    <div className="font-semibold text-ink-800">{vehicleForRoute.registration_number}</div>
                    <div className="text-ink-500">{vehicleForRoute.driver_name} · {vehicleForRoute.vehicle_type}</div>
                    <div className="text-ink-500">Load: {selectedRoute.total_load_kg} / {vehicleForRoute.capacity_kg} kg</div>
                  </div>
                )}

                {/* Incident Controls (Dispatcher only) */}
                {canControl && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-ink-600 uppercase tracking-wider">Simulate Incident</div>
                    <div className="flex flex-wrap gap-1">
                      {["moderate", "severe", "breakdown"].map((sev) => (
                        <button
                          key={sev}
                          className="rounded border border-ink-200 bg-white px-2 py-0.5 text-[11px] hover:bg-amber-50 hover:border-amber-300 capitalize"
                          onClick={() => trafficMut.mutate(sev)}
                        >
                          +{sev}
                        </button>
                      ))}
                      <button
                        className="rounded border border-ink-200 bg-white px-2 py-0.5 text-[11px] hover:bg-emerald-50 hover:border-emerald-300"
                        onClick={() => trafficMut.mutate("clear")}
                      >
                        Clear
                      </button>
                    </div>
                    <button
                      className="btn-primary w-full text-xs py-1.5 shadow-xs"
                      disabled={reoptMut.isPending}
                      onClick={() => reoptMut.mutate()}
                    >
                      {reoptMut.isPending ? "Re-optimizing…" : "⚡ Reoptimize Remaining Stops"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* --- VEHICLE TELEMETRY PANEL (when selected) --- */}
          {(selectedVehicle || selectedLiveVehicle) && (
            <div className="border-b border-ink-200 bg-white px-4 py-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-700">Vehicle Telemetry</h3>
                <button className="text-ink-400 hover:text-ink-700 text-[11px]" onClick={() => setSelectedVehicleId(null)}>✕ Clear</button>
              </div>
              <div className="rounded-lg border border-ink-200 bg-slate-50 p-3 space-y-1.5">
                {selectedVehicle && (
                  <>
                    <TRow label="Registration" value={selectedVehicle.registration_number} />
                    <TRow label="Driver" value={selectedVehicle.driver_name} />
                    <TRow label="Type" value={selectedVehicle.vehicle_type} />
                    <TRow label="Status" value={<StatusBadge value={selectedVehicle.status} />} />
                    <TRow label="Capacity" value={`${selectedVehicle.capacity_kg} kg`} />
                  </>
                )}
                {selectedLiveVehicle && (
                  <>
                    <TRow
                      label="Live Position"
                      value={`${selectedLiveVehicle.lat.toFixed(5)}, ${selectedLiveVehicle.lon.toFixed(5)}`}
                    />
                    {selectedLiveVehicle.current_stop_sequence != null && (
                      <TRow label="Heading to Stop" value={`#${selectedLiveVehicle.current_stop_sequence}`} />
                    )}
                  </>
                )}
                {selectedRoute && selectedLiveVehicle?.route_id === selectedRoute.id && (() => {
                  const prog = routeProgress(selectedRoute);
                  return (
                    <>
                      <TRow label="Route" value={selectedRoute.route_code} />
                      <TRow label="Stops Done" value={`${prog.completed} / ${prog.total}`} />
                      <TRow label="Stops Left" value={prog.remaining} />
                      <TRow label="Progress" value={`${prog.pct}%`} />
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* --- LIVE EVENT FEED --- */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-700">Live Event Feed</h3>
                <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
                  {feed.length} / {MAX_FEED}
                </span>
              </div>
              <button
                className="text-[10px] text-ink-400 hover:text-ink-700"
                onClick={() => {
                  feedRef.current = [];
                  setFeed([]);
                }}
              >
                Clear
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {feed.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 text-xs text-ink-400 text-center">
                  <span className="text-lg mb-1">📡</span>
                  Waiting for telemetry events…<br />
                  <span className="text-[11px] mt-0.5">Start simulation or dispatch routes.</span>
                </div>
              ) : (
                feed.map((f) => (
                  <div key={f.id} className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-ink-50 transition-colors">
                    <div className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${categoryDot(f.category)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${categoryColor(f.category)}`}>
                          {eventTypeLabel(f.type)}
                        </span>
                        <span className="font-mono text-[10px] text-ink-400">{f.ts}</span>
                      </div>
                      <div className="text-[11px] text-ink-700 leading-snug break-words">{f.message}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* --- STATUS FOOTER --- */}
          <div className="flex items-center justify-between border-t border-ink-200 bg-slate-50 px-4 py-2 text-[11px]">
            <div className="flex items-center gap-2 text-ink-600">
              <span
                className={`h-2 w-2 rounded-full ${
                  isSimRunning ? "bg-emerald-500 animate-ping" : "bg-ink-300"
                }`}
              />
              {isSimRunning
                ? `Sim running @ ${simSpeed}× · ${liveActiveVehicles} vehicles active`
                : "Simulation idle"}
            </div>
            <div className="flex items-center gap-1.5 text-ink-400">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? "bg-emerald-500" : "bg-red-400"
                }`}
              />
              <span>{connected ? "WS OK" : "WS Reconnecting"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------
function KpiChip({
  label,
  value,
  color,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-4 text-[11px]">
      <span className="uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
      {loading ? (
        <span className="font-bold text-slate-600">—</span>
      ) : (
        <span className={`font-bold ${color}`}>{value}</span>
      )}
    </div>
  );
}

function KpiDivider() {
  return <span className="h-4 border-l border-slate-700" />;
}

function TRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-400 shrink-0">{label}:</span>
      <span className="font-semibold text-ink-900 text-right">{value}</span>
    </div>
  );
}
