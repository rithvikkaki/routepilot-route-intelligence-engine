import { useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../components/Layout";
import { EmptyState, Modal, Skeleton, StatusBadge } from "../components/ui";
import { depotApi, vehicleApi, routeApi } from "../api/endpoints";
import { useToast } from "../stores/toast";
import { useAuth, canManage } from "../stores/auth";
import { DEFAULT_CENTER, PRIMARY_HUB_CENTER, depotIcon, MapAutoBounds } from "../utils/map";
import type { Depot, Vehicle, Route } from "../types";

export default function Depots() {
  const qc = useQueryClient();
  const push = useToast((s) => s.push);
  const editable = canManage(useAuth((s) => s.user?.role));
  const [open, setOpen] = useState(false);
  const [selectedDepotId, setSelectedDepotId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const depots = useQuery({ queryKey: ["depots"], queryFn: depotApi.list, refetchInterval: 10000 });
  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: () => vehicleApi.list(), refetchInterval: 8000 });
  const routes = useQuery({ queryKey: ["routes"], queryFn: () => routeApi.list(), refetchInterval: 8000 });

  const [form, setForm] = useState({
    name: "",
    address: "",
    latitude: PRIMARY_HUB_CENTER[0],
    longitude: PRIMARY_HUB_CENTER[1],
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  
  const mut = useMutation({
    mutationFn: () => depotApi.create(form as any),
    onSuccess: () => {
      push("Depot created", "success");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["depots"] });
    },
    onError: (e: any) => push(e.message || "Error creating depot", "error"),
  });

  // Filter depots
  const filteredDepots = useMemo(() => {
    return (depots.data || []).filter((d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.address || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [depots.data, search]);

  const mapPoints = useMemo<[number, number][]>(() => {
    if (selectedDepotId) {
      const d = (depots.data || []).find((x) => x.id === selectedDepotId);
      if (d) return [[d.latitude, d.longitude]];
    }
    return (filteredDepots || []).map((d) => [d.latitude, d.longitude]);
  }, [filteredDepots, depots.data, selectedDepotId]);

  const selectedDepot = useMemo(() => {
    return (depots.data || []).find((d) => d.id === selectedDepotId);
  }, [depots.data, selectedDepotId]);

  // Calculations for selected depot
  const selectedDepotStats = useMemo(() => {
    if (!selectedDepotId) return null;
    const dvs = (vehicles.data || []).filter((v) => v.home_depot_id === selectedDepotId);
    const drs = (routes.data || []).filter((r) => r.depot_id === selectedDepotId);
    
    const available = dvs.filter((v) => v.status === "AVAILABLE").length;
    const inTransit = dvs.filter((v) => v.status === "IN_TRANSIT").length;
    const totalCapacity = dvs.reduce((sum, v) => sum + v.capacity_kg, 0);
    const totalLoad = dvs.reduce((sum, v) => sum + v.current_load_kg, 0);

    return {
      vehicles: dvs,
      routes: drs,
      available,
      inTransit,
      totalCapacity,
      totalLoad,
    };
  }, [selectedDepotId, vehicles.data, routes.data]);

  // Overall KPIs
  const totalDepots = depots.data?.length || 0;
  const totalVehicles = vehicles.data?.length || 0;
  const totalAvailableVehicles = vehicles.data?.filter((v) => v.status === "AVAILABLE").length || 0;
  const totalInTransitVehicles = vehicles.data?.filter((v) => v.status === "IN_TRANSIT").length || 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Depot Intelligence"
        subtitle="Warehouses, dispatch hubs, and workload monitoring"
        actions={
          editable && (
            <button className="btn-primary shadow-xs" onClick={() => setOpen(true)}>
              + Add Depot
            </button>
          )
        }
      />

      {/* KPI summary strip */}
      <div className="border-b border-ink-200 bg-ink-50 px-4 sm:px-6 py-3 sm:py-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-2.5 sm:gap-4 items-center">
        <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-xs">
          <span className="text-lg sm:text-xl font-bold tabular-nums text-ink-900">{totalDepots}</span>
          <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-ink-500">Total Depots</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-xs">
          <span className="text-lg sm:text-xl font-bold tabular-nums text-ink-900">{totalVehicles}</span>
          <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-ink-500">Fleet Vehicles</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-xs">
          <span className="text-lg sm:text-xl font-bold tabular-nums text-emerald-600">{totalAvailableVehicles}</span>
          <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-ink-500">Available Fleet</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-xs">
          <span className="text-lg sm:text-xl font-bold tabular-nums text-amber-600">{totalInTransitVehicles}</span>
          <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-ink-500">In Transit Fleet</span>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 gap-4 sm:gap-6 p-3 sm:p-6 md:grid-cols-2 overflow-y-auto">
        {/* Left Side: Depot List & Map */}
        <div className="flex flex-col gap-4 min-h-[350px] sm:min-h-[500px]">
          <div className="flex items-center gap-2">
            <input
              className="input text-xs py-1.5 px-3 flex-1"
              placeholder="Search depots by name or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="text-xs text-brand-600 underline" onClick={() => setSearch("")}>
                Clear
              </button>
            )}
          </div>

          <div className="card overflow-hidden h-[300px] border border-ink-200 relative z-10">
            <MapContainer center={DEFAULT_CENTER} zoom={10} className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
              <MapAutoBounds points={mapPoints} />
              {(filteredDepots || []).map((d) => (
                <Marker
                  key={d.id}
                  position={[d.latitude, d.longitude]}
                  icon={depotIcon}
                  eventHandlers={{
                    click: () => setSelectedDepotId(d.id),
                  }}
                >
                  <Popup>
                    <div className="font-semibold text-sm">{d.name}</div>
                    <div className="text-xs text-ink-500">{d.address}</div>
                    <div className="text-xs text-ink-400 mt-1">Hours: {d.operating_start} – {d.operating_end}</div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {depots.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : filteredDepots.length === 0 ? (
              <EmptyState title="No depots found" hint="Try adjusting your search query or add a new depot." />
            ) : (
              filteredDepots.map((d: Depot) => {
                const isSelected = d.id === selectedDepotId;
                const depotVehicles = (vehicles.data || []).filter((v) => v.home_depot_id === d.id);
                const activeRoutesCount = (routes.data || []).filter((r) => r.depot_id === d.id && r.status === "ACTIVE").length;

                return (
                  <div
                    key={d.id}
                    className={`card p-4 cursor-pointer border transition-all hover:border-brand-500 hover:shadow-xs ${
                      isSelected ? "border-brand-500 bg-brand-50/20 shadow-xs" : "border-ink-200"
                    }`}
                    onClick={() => setSelectedDepotId(isSelected ? null : d.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-semibold text-ink-900 text-sm">{d.name}</div>
                      <span className="text-[10px] bg-ink-100 text-ink-600 px-2 py-0.5 rounded-full font-medium">
                        ID: #{d.id}
                      </span>
                    </div>
                    <div className="text-xs text-ink-500 mt-1">{d.address}</div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
                      <span>📍 {d.latitude.toFixed(4)}, {d.longitude.toFixed(4)}</span>
                      <span>🚚 {depotVehicles.length} vehicles</span>
                      {activeRoutesCount > 0 && <span className="text-amber-600 font-medium">⚡ {activeRoutesCount} active routes</span>}
                      <span>🕒 {d.operating_start}–{d.operating_end}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Selected Depot details & Workload Intelligence */}
        <div className="flex flex-col">
          {selectedDepotId === null ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-ink-200 rounded-xl h-full p-8 text-center text-ink-400 bg-white">
              <span className="text-3xl mb-2">🏢</span>
              <p className="text-sm font-medium text-ink-600">No Depot Selected</p>
              <p className="text-xs text-ink-400 mt-1">Select a depot from the map or list to inspect its vehicles, active routes, and workload intelligence.</p>
            </div>
          ) : selectedDepot ? (
            <div className="card border border-ink-200 bg-white p-5 flex flex-col gap-5 h-full overflow-y-auto">
              <div className="border-b border-ink-100 pb-3 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-ink-900">{selectedDepot.name}</h3>
                  <p className="text-xs text-ink-500 mt-1">{selectedDepot.address}</p>
                </div>
                <button
                  className="text-xs text-ink-400 hover:text-ink-700 font-medium underline"
                  onClick={() => setSelectedDepotId(null)}
                >
                  Deselect
                </button>
              </div>

              {/* Workload / Capacity Info */}
              {selectedDepotStats && (
                <div className="bg-ink-50 rounded-lg p-4 border border-ink-200 space-y-3">
                  <h4 className="text-xs font-semibold text-ink-800 uppercase tracking-wider">Workload & Fleet Utilization</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-ink-500">Fleet Load</span>
                      <p className="font-bold text-ink-900 text-sm">
                        {selectedDepotStats.totalLoad.toFixed(1)} / {selectedDepotStats.totalCapacity.toFixed(1)} kg
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-ink-500">Utilization Rate</span>
                      <p className={`font-bold text-sm ${
                        selectedDepotStats.totalCapacity > 0 && (selectedDepotStats.totalLoad / selectedDepotStats.totalCapacity * 100) >= 80 ? "text-amber-600" : "text-brand-600"
                      }`}>
                        {selectedDepotStats.totalCapacity > 0
                          ? `${Math.round((selectedDepotStats.totalLoad / selectedDepotStats.totalCapacity) * 100)}%`
                          : "0%"}
                      </p>
                    </div>
                  </div>
                  {selectedDepotStats.totalCapacity > 0 && (
                    <div className="h-1.5 w-full rounded-full bg-ink-200 overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all"
                        style={{ width: `${Math.min((selectedDepotStats.totalLoad / selectedDepotStats.totalCapacity) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-ink-500 border-t border-ink-150 pt-2 mt-1">
                    <span>Available: <strong className="text-emerald-600 font-bold">{selectedDepotStats.available}</strong></span>
                    <span>In Transit: <strong className="text-amber-600 font-bold">{selectedDepotStats.inTransit}</strong></span>
                    <span>Total Fleet: <strong className="text-ink-800 font-bold">{selectedDepotStats.vehicles.length}</strong></span>
                  </div>
                </div>
              )}

              {/* Depot Vehicles List */}
              {selectedDepotStats && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-ink-700">Depot Fleet ({selectedDepotStats.vehicles.length})</h4>
                  {selectedDepotStats.vehicles.length === 0 ? (
                    <p className="text-xs text-ink-400 italic">No vehicles assigned to this home depot.</p>
                  ) : (
                    <div className="max-h-[160px] overflow-y-auto border border-ink-100 rounded-lg divide-y divide-ink-50">
                      {selectedDepotStats.vehicles.map((v) => (
                        <div key={v.id} className="flex justify-between items-center p-2 hover:bg-ink-50">
                          <div>
                            <div className="text-xs font-bold text-ink-800">{v.registration_number}</div>
                            <div className="text-[10px] text-ink-400">{v.driver_name} · {v.vehicle_type}</div>
                          </div>
                          <StatusBadge value={v.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Depot Routes List */}
              {selectedDepotStats && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-ink-700">Depot Routes ({selectedDepotStats.routes.length})</h4>
                  {selectedDepotStats.routes.length === 0 ? (
                    <p className="text-xs text-ink-400 italic">No routes scheduled or running from this depot.</p>
                  ) : (
                    <div className="max-h-[160px] overflow-y-auto border border-ink-100 rounded-lg divide-y divide-ink-50">
                      {selectedDepotStats.routes.map((r) => (
                        <div key={r.id} className="flex justify-between items-center p-2 hover:bg-ink-50">
                          <div>
                            <div className="text-xs font-bold text-ink-800">{r.route_code}</div>
                            <div className="text-[10px] text-ink-400">{r.stops.length} stops · {r.total_distance_km} km</div>
                          </div>
                          <StatusBadge value={r.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New Depot">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div>
            <label className="label">Latitude</label>
            <input
              className="input"
              type="number"
              step="0.0001"
              value={form.latitude}
              onChange={(e) => set("latitude", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Longitude</label>
            <input
              className="input"
              type="number"
              step="0.0001"
              value={form.longitude}
              onChange={(e) => set("longitude", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary shadow-sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Saving…" : "Save Depot"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
