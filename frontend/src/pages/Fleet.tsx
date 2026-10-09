import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../components/Layout";
import { EmptyState, Modal, Skeleton, StatusBadge } from "../components/ui";
import { depotApi, vehicleApi } from "../api/endpoints";
import { useToast } from "../stores/toast";
import { useAuth, canManage } from "../stores/auth";
import type { Vehicle, VehicleStatus } from "../types";

// ── Real backend statuses from VehicleStatus enum ─────────────────────
const ALL_STATUSES: VehicleStatus[] = [
  "AVAILABLE", "ASSIGNED", "IN_TRANSIT", "MAINTENANCE", "OFFLINE",
];

const VEHICLE_TYPES = ["BIKE", "MINI_VAN", "VAN", "TRUCK"];

// ── Status visual config ───────────────────────────────────────────────
function statusConfig(s: VehicleStatus): { dot: string; ring: string } {
  switch (s) {
    case "AVAILABLE":  return { dot: "bg-emerald-500", ring: "border-emerald-200" };
    case "ASSIGNED":   return { dot: "bg-blue-500",    ring: "border-blue-200"    };
    case "IN_TRANSIT": return { dot: "bg-amber-500 animate-pulse", ring: "border-amber-200" };
    case "MAINTENANCE":return { dot: "bg-orange-500",  ring: "border-orange-200"  };
    case "OFFLINE":    return { dot: "bg-slate-400",   ring: "border-slate-200"   };
    default:           return { dot: "bg-ink-300",     ring: "border-ink-200"     };
  }
}

// ── Utilization color ──────────────────────────────────────────────────
function utilColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  if (pct >= 40) return "bg-brand-500";
  return "bg-emerald-500";
}

// ── KPI chip ──────────────────────────────────────────────────────────
function KpiChip({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-ink-200 bg-white px-5 py-3 shadow-xs min-w-[100px]">
      <span className={`text-xl font-bold tabular-nums ${accent ?? "text-ink-900"}`}>{value}</span>
      <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">{label}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function Fleet() {
  const qc = useQueryClient();
  const push = useToast((s) => s.push);
  const editable = canManage(useAuth((s) => s.user?.role));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<VehicleStatus | "">("");
  const [filterType, setFilterType] = useState("");
  const [filterDepot, setFilterDepot] = useState<number | "">("");

  const vehicles = useQuery({
    queryKey: ["vehicles-fleet"],
    queryFn: () => vehicleApi.list(),
    refetchInterval: 8000,
  });
  const depots = useQuery({ queryKey: ["depots"], queryFn: depotApi.list });

  const depotMap = useMemo(
    () => new Map((depots.data ?? []).map((d) => [d.id, d])),
    [depots.data]
  );

  // ── KPI calculations (from real loaded data) ─────────────────────────
  const kpis = useMemo(() => {
    const vs = vehicles.data ?? [];
    const total = vs.length;
    const available = vs.filter((v) => v.status === "AVAILABLE").length;
    const assigned = vs.filter((v) => v.status === "ASSIGNED").length;
    const inTransit = vs.filter((v) => v.status === "IN_TRANSIT").length;
    const maintenance = vs.filter((v) => v.status === "MAINTENANCE").length;
    const offline = vs.filter((v) => v.status === "OFFLINE").length;
    const totalCapacity = vs.reduce((s, v) => s + v.capacity_kg, 0);
    const totalLoad = vs.reduce((s, v) => s + v.current_load_kg, 0);
    return { total, available, assigned, inTransit, maintenance, offline, totalCapacity, totalLoad };
  }, [vehicles.data]);

  // ── Unique depot options from loaded vehicles ─────────────────────────
  const depotOptions = useMemo(() => {
    const ids = [...new Set((vehicles.data ?? []).map((v) => v.home_depot_id))];
    return ids.map((id) => ({ id, name: depotMap.get(id)?.name ?? `Depot #${id}` }));
  }, [vehicles.data, depotMap]);

  // ── Unique vehicle types from loaded data ─────────────────────────────
  const typeOptions = useMemo(() => {
    return [...new Set((vehicles.data ?? []).map((v) => v.vehicle_type))].sort();
  }, [vehicles.data]);

  // ── Filtering ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return (vehicles.data ?? []).filter((v) => {
      if (filterStatus && v.status !== filterStatus) return false;
      if (filterType && v.vehicle_type !== filterType) return false;
      if (filterDepot !== "" && v.home_depot_id !== Number(filterDepot)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !v.registration_number.toLowerCase().includes(q) &&
          !v.driver_name.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [vehicles.data, search, filterStatus, filterType, filterDepot]);

  const hasFilters = !!search || !!filterStatus || !!filterType || filterDepot !== "";

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      vehicleApi.update(id, { status } as any),
    onSuccess: () => {
      push("Vehicle status updated", "success");
      qc.invalidateQueries({ queryKey: ["vehicles-fleet"] });
    },
    onError: (e: any) => push(e.message ?? "Update failed", "error"),
  });

  function openEdit(v: Vehicle) {
    setEditing(v);
    setModalOpen(true);
  }
  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Fleet Management"
        subtitle="ROUTE INTELLIGENCE ENGINE — Fleet Operations"
        actions={
          editable && (
            <button className="btn-primary shadow-xs" onClick={openAdd}>
              + Add Vehicle
            </button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* ── FLEET SUMMARY STRIP ─────────────────────────────────────── */}
        <div className="border-b border-ink-200 bg-ink-50 px-4 sm:px-6 py-3 sm:py-4">
          {vehicles.isLoading ? (
            <div className="flex gap-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-28 rounded-lg" />)}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5 sm:gap-3 items-center">
              <KpiChip label="Total" value={kpis.total} />
              <KpiChip label="Available" value={kpis.available} accent="text-emerald-600" />
              <KpiChip label="Assigned" value={kpis.assigned} accent="text-blue-600" />
              <KpiChip label="In Transit" value={kpis.inTransit} accent="text-amber-600" />
              {kpis.maintenance > 0 && (
                <KpiChip label="Maintenance" value={kpis.maintenance} accent="text-orange-600" />
              )}
              {kpis.offline > 0 && (
                <KpiChip label="Offline" value={kpis.offline} accent="text-slate-500" />
              )}
              {kpis.totalCapacity > 0 && (
                <div className="w-full sm:w-auto sm:ml-auto flex flex-col items-start sm:items-end justify-center rounded-lg border border-ink-200 bg-white px-4 sm:px-5 py-2.5 sm:py-3 shadow-xs min-w-[180px]">
                  <span className="text-sm font-bold text-ink-900">
                    {kpis.totalLoad.toFixed(0)} / {kpis.totalCapacity.toFixed(0)} kg
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">
                    Fleet Load / Capacity
                  </span>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${utilColor(kpis.totalCapacity > 0 ? (kpis.totalLoad / kpis.totalCapacity) * 100 : 0)}`}
                      style={{ width: `${Math.min(kpis.totalCapacity > 0 ? (kpis.totalLoad / kpis.totalCapacity) * 100 : 0, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FILTERS ─────────────────────────────────────────────────── */}
        <div className="border-b border-ink-200 bg-white px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap gap-2.5 sm:gap-3 items-center">
          {/* Search */}
          <div className="relative w-full sm:w-auto">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="input pl-8 py-1.5 text-xs w-full sm:w-52"
              placeholder="Search registration or driver…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status filter */}
          <select
            className="input py-1.5 text-xs"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as VehicleStatus | "")}
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>

          {/* Type filter (from real data) */}
          {typeOptions.length > 0 && (
            <select
              className="input py-1.5 text-xs"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {/* Depot filter (from real data) */}
          {depotOptions.length > 1 && (
            <select
              className="input py-1.5 text-xs"
              value={filterDepot}
              onChange={(e) => setFilterDepot(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">All Depots</option>
              {depotOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}

          {/* Clear filters */}
          {hasFilters && (
            <button
              className="text-xs text-ink-500 hover:text-ink-800 underline"
              onClick={() => { setSearch(""); setFilterStatus(""); setFilterType(""); setFilterDepot(""); }}
            >
              Clear filters
            </button>
          )}

          {/* Result count */}
          {!vehicles.isLoading && (
            <span className="ml-auto text-xs text-ink-400 tabular-nums">
              {filtered.length} of {vehicles.data?.length ?? 0} vehicles
            </span>
          )}
        </div>

        {/* ── VEHICLE CARDS ────────────────────────────────────────────── */}
        <div className="p-3 sm:p-6">
          {vehicles.isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
            </div>
          ) : vehicles.isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-3xl mb-3">⚠️</div>
              <div className="font-semibold text-ink-700 mb-1">Failed to load fleet data</div>
              <div className="text-xs text-ink-500 mb-4">Check your connection and try again.</div>
              <button
                className="btn-primary text-sm py-1.5 px-4"
                onClick={() => qc.invalidateQueries({ queryKey: ["vehicles-fleet"] })}
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            hasFilters ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-3xl mb-3">🔍</div>
                <div className="font-semibold text-ink-700 mb-1">No vehicles match your filters</div>
                <div className="text-xs text-ink-500 mb-4">Try adjusting your search or filter criteria.</div>
                <button
                  className="btn-ghost text-sm border border-ink-200"
                  onClick={() => { setSearch(""); setFilterStatus(""); setFilterType(""); setFilterDepot(""); }}
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <EmptyState title="No vehicles in fleet" hint="Add a vehicle to get started." />
            )
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((v) => {
                const util = v.capacity_kg > 0 ? Math.round((v.current_load_kg / v.capacity_kg) * 100) : 0;
                const sc = statusConfig(v.status as VehicleStatus);
                const depot = depotMap.get(v.home_depot_id);
                return (
                  <VehicleCard
                    key={v.id}
                    vehicle={v}
                    util={util}
                    sc={sc}
                    depot={depot}
                    editable={editable}
                    onStatusChange={(status) => statusMut.mutate({ id: v.id, status })}
                    onEdit={() => openEdit(v)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL ─────────────────────────────────────────────────────── */}
      {modalOpen && (
        <VehicleForm
          vehicle={editing}
          depots={depots.data ?? []}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            qc.invalidateQueries({ queryKey: ["vehicles-fleet"] });
          }}
        />
      )}
    </div>
  );
}

// ── Vehicle Card ───────────────────────────────────────────────────────
function VehicleCard({
  vehicle: v,
  util,
  sc,
  depot,
  editable,
  onStatusChange,
  onEdit,
}: {
  vehicle: Vehicle;
  util: number;
  sc: { dot: string; ring: string };
  depot?: { name: string } | undefined;
  editable: boolean;
  onStatusChange: (s: string) => void;
  onEdit: () => void;
}) {
  return (
    <div className={`card p-4 flex flex-col gap-3 border ${sc.ring} hover:shadow-md transition-shadow`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-ink-900 text-sm truncate" title={v.registration_number}>
            {v.registration_number}
          </div>
          <div className="text-xs text-ink-500 truncate mt-0.5">{v.driver_name}</div>
        </div>
        <StatusBadge value={v.status} />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <InfoRow label="Type" value={v.vehicle_type} />
        <InfoRow label="Capacity" value={`${v.capacity_kg} kg`} />
        {depot && <InfoRow label="Depot" value={depot.name} span />}
        {v.max_route_distance_km != null && (
          <InfoRow label="Max range" value={`${v.max_route_distance_km} km`} />
        )}
      </div>

      {/* Load / utilization */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-500">
            Load: <strong className="text-ink-800">{v.current_load_kg} / {v.capacity_kg} kg</strong>
          </span>
          <span className={`font-bold tabular-nums ${util >= 90 ? "text-red-600" : util >= 70 ? "text-amber-600" : "text-ink-700"}`}>
            {util}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${utilColor(util)}`}
            style={{ width: `${Math.min(util, 100)}%` }}
          />
        </div>
      </div>

      {/* Status selector + edit — dispatcher only */}
      {editable && (
        <div className="flex items-center gap-2 pt-1 border-t border-ink-100">
          <select
            className="input py-1 text-xs flex-1"
            value={v.status}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <button
            className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline whitespace-nowrap"
            onClick={onEdit}
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tiny info row ──────────────────────────────────────────────────────
function InfoRow({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <span className="text-ink-400">{label}: </span>
      <span className="font-medium text-ink-700 break-all">{value}</span>
    </div>
  );
}

// ── Vehicle Form Modal ─────────────────────────────────────────────────
function VehicleForm({
  vehicle,
  depots,
  onClose,
  onSaved,
}: {
  vehicle: Vehicle | null;
  depots: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const push = useToast((s) => s.push);
  const [form, setForm] = useState({
    registration_number: vehicle?.registration_number ?? "",
    driver_name: vehicle?.driver_name ?? "",
    vehicle_type: vehicle?.vehicle_type ?? "VAN",
    capacity_kg: vehicle?.capacity_kg ?? 600,
    home_depot_id: vehicle?.home_depot_id ?? depots[0]?.id ?? 1,
    max_route_distance_km: vehicle?.max_route_distance_km ?? 200,
  });
  const set = (k: string, val: any) => setForm((f) => ({ ...f, [k]: val }));

  const mut = useMutation({
    mutationFn: () =>
      vehicle
        ? vehicleApi.update(vehicle.id, form as any)
        : vehicleApi.create(form as any),
    onSuccess: () => {
      push(vehicle ? "Vehicle updated" : "Vehicle added", "success");
      onSaved();
    },
    onError: (e: any) => push(e.message ?? "Save failed", "error"),
  });

  return (
    <Modal open onClose={onClose} title={vehicle ? "Edit Vehicle" : "Add Vehicle"}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Registration Number</label>
            <input
              className="input"
              value={form.registration_number}
              onChange={(e) => set("registration_number", e.target.value)}
              placeholder="e.g. AP 16 AB 1234"
            />
          </div>
          <div>
            <label className="label">Driver Name</label>
            <input
              className="input"
              value={form.driver_name}
              onChange={(e) => set("driver_name", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Vehicle Type</label>
            <select className="input" value={form.vehicle_type} onChange={(e) => set("vehicle_type", e.target.value)}>
              {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Capacity (kg)</label>
            <input
              className="input"
              type="number"
              min="1"
              value={form.capacity_kg}
              onChange={(e) => set("capacity_kg", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Home Depot</label>
            <select
              className="input"
              value={form.home_depot_id}
              onChange={(e) => set("home_depot_id", Number(e.target.value))}
            >
              {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Max Route Distance (km)</label>
            <input
              className="input"
              type="number"
              min="1"
              value={form.max_route_distance_km ?? ""}
              onChange={(e) => set("max_route_distance_km", Number(e.target.value))}
            />
          </div>
        </div>

        {/* Show current status info on edit (read-only — status changed from fleet card) */}
        {vehicle && (
          <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-xs text-ink-600">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink-700">Current Status:</span>
              <StatusBadge value={vehicle.status} />
            </div>
            <div className="mt-1 text-ink-500">
              Load: {vehicle.current_load_kg} / {vehicle.capacity_kg} kg
              {vehicle.current_latitude != null && vehicle.current_longitude != null && (
                <span className="ml-3">
                  GPS: {vehicle.current_latitude.toFixed(5)}, {vehicle.current_longitude.toFixed(5)}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Saving…" : vehicle ? "Save Changes" : "Add Vehicle"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
