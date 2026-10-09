import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { PageHeader } from "../components/Layout";
import { EmptyState, Modal, Skeleton, StatusBadge } from "../components/ui";
import { analyticsApi, depotApi, orderApi, routeApi, vehicleApi } from "../api/endpoints";
import { useToast } from "../stores/toast";
import { useAuth, canManage } from "../stores/auth";
import { coloredDot, depotIcon, MapAutoBounds } from "../utils/map";
import type { Order, Route, Vehicle, Depot } from "../types";

const STATUSES = ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return dateStr;
  }
}

function formatWindow(start?: string | null, end?: string | null): string {
  if (!start && !end) return "Not specified";
  if (start && end) {
    try {
      const s = new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      const e = new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      return `${s} - ${e}`;
    } catch {
      return `${start} - ${end}`;
    }
  }
  return formatDate(start || end);
}

function toLocalDatetimeString(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export default function Orders() {
  const qc = useQueryClient();
  const push = useToast((s) => s.push);
  const role = useAuth((s) => s.user?.role);
  const editable = canManage(role);

  // States
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [depotId, setDepotId] = useState<number | "">("");
  const [onDate, setOnDate] = useState<string>("");
  const [assigned, setAssigned] = useState<string>("ALL"); // "ALL", "ASSIGNED", "UNASSIGNED"

  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState<Order | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);

  // Map assigned string filter to boolean parameter
  const assignedParam = useMemo(() => {
    if (assigned === "ASSIGNED") return true;
    if (assigned === "UNASSIGNED") return false;
    return undefined;
  }, [assigned]);

  // Queries
  const depotsQuery = useQuery({ queryKey: ["depots"], queryFn: depotApi.list });
  const opsSummaryQuery = useQuery({
    queryKey: ["orders-ops-summary"],
    queryFn: analyticsApi.ordersOpsSummary,
    refetchInterval: 5000,
  });

  const ordersQuery = useQuery({
    queryKey: ["orders", page, status, priority, search, depotId, onDate, assigned],
    queryFn: () =>
      orderApi.list({
        page,
        page_size: 15,
        status: status || undefined,
        priority: priority || undefined,
        search: search || undefined,
        depot_id: depotId || undefined,
        on_date: onDate || undefined,
        assigned: assignedParam,
      }),
  });

  const routesQuery = useQuery({
    queryKey: ["all-routes"],
    queryFn: () => routeApi.list(),
    refetchInterval: 8000,
  });

  const vehiclesQuery = useQuery({
    queryKey: ["all-vehicles"],
    queryFn: () => vehicleApi.list(),
    refetchInterval: 8000,
  });

  // Mutations
  const cancelMut = useMutation({
    mutationFn: (id: number) => orderApi.cancel(id),
    onSuccess: () => {
      push("Order cancelled successfully", "success");
      setCancelingOrder(null);
      if (selectedOrder && selectedOrder.id === cancelingOrder?.id) {
        setSelectedOrder((prev) => (prev ? { ...prev, status: "CANCELLED" } : null));
      }
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-ops-summary"] });
    },
    onError: (e: any) => push(e.message || "Failed to cancel order", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => orderApi.remove(id),
    onSuccess: () => {
      push("Order deleted successfully", "success");
      setDeletingOrder(null);
      setSelectedOrder(null);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-ops-summary"] });
    },
    onError: (e: any) => push(e.message || "Failed to delete order", "error"),
  });

  // Cross-reference lookup maps
  const depotsMap = useMemo(() => {
    const m = new Map<number, Depot>();
    if (depotsQuery.data) {
      for (const d of depotsQuery.data) {
        m.set(d.id, d);
      }
    }
    return m;
  }, [depotsQuery.data]);

  const vehiclesMap = useMemo(() => {
    const m = new Map<number, Vehicle>();
    if (vehiclesQuery.data) {
      for (const v of vehiclesQuery.data) {
        m.set(v.id, v);
      }
    }
    return m;
  }, [vehiclesQuery.data]);

  const orderRouteMap = useMemo(() => {
    const map = new Map<number, { route: Route; stop: any; vehicle?: Vehicle }>();
    if (routesQuery.data) {
      for (const r of routesQuery.data) {
        if (r.stops) {
          for (const s of r.stops) {
            if (s.order_id) {
              const vehicle = r.vehicle_id ? vehiclesMap.get(r.vehicle_id) : undefined;
              map.set(s.order_id, { route: r, stop: s, vehicle });
            }
          }
        }
      }
    }
    return map;
  }, [routesQuery.data, vehiclesMap]);

  const openCreate = () => {
    setEditingOrder(null);
    setModalOpen(true);
  };

  const openEdit = (o: Order, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingOrder(o);
    setModalOpen(true);
  };

  const openCancelConfirm = (o: Order, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCancelingOrder(o);
  };

  const openDeleteConfirm = (o: Order, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeletingOrder(o);
  };

  const handleResetFilters = () => {
    setSearch("");
    setStatus("");
    setPriority("");
    setDepotId("");
    setOnDate("");
    setAssigned("ALL");
    setPage(1);
  };

  const isFiltered = search !== "" || status !== "" || priority !== "" || depotId !== "" || onDate !== "" || assigned !== "ALL";

  const opsData = opsSummaryQuery.data || {
    total_orders: 0,
    high_priority_orders: 0,
    unassigned_orders: 0,
    due_today_orders: 0,
    at_risk_orders: 0,
  };

  const pageData = ordersQuery.data;
  const items = pageData?.items || [];
  const totalOrders = pageData?.total || 0;
  const totalPages = pageData?.pages || 1;
  const startItem = (page - 1) * 15 + 1;
  const endItem = Math.min(page * 15, totalOrders);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Orders Dispatcher"
        subtitle="ROUTE INTELLIGENCE ENGINE — Operations & Lifecycle Workspace"
        actions={
          editable && (
            <button className="btn-primary flex items-center gap-1.5 shadow-xs text-xs font-semibold px-3 py-2 animate-fade-in" onClick={openCreate}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Order
            </button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto space-y-4 sm:space-y-6 p-3 sm:p-6">
        
        {/* Compact Operational KPI Cards Row */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCardCompact label="Total Orders" value={opsData.total_orders} icon="cube" color="slate" />
          <KpiCardCompact label="High Priority" value={opsData.high_priority_orders} icon="flame" color="red" />
          <KpiCardCompact label="Unassigned Orders" value={opsData.unassigned_orders} icon="clock" color="amber" />
          <KpiCardCompact label="Due Today" value={opsData.due_today_orders} icon="calendar" color="indigo" />
          <KpiCardCompact label="At Risk / Overdue" value={opsData.at_risk_orders} icon="alert" color="amber-alert" />
        </div>

        {/* Advanced Filters Block */}
        <div className="flex flex-wrap gap-3 sm:gap-4 items-center justify-between card p-3 sm:p-4">
          <div className="flex flex-wrap gap-2.5 sm:gap-3 items-center flex-1 w-full sm:w-auto">
            
            {/* Search Input */}
            <div className="relative w-full sm:w-auto sm:min-w-[200px] sm:flex-1 sm:max-w-sm">
              <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="input pl-8 w-full text-xs py-1.5"
                placeholder="Search order #, customer..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              {search && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 text-xs px-1"
                  onClick={() => { setSearch(""); setPage(1); }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Selector */}
            <select
              className="input text-xs py-1.5 min-w-[130px]"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>

            {/* Priority Selector */}
            <select
              className="input text-xs py-1.5 min-w-[120px]"
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1); }}
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Home Depot Selector */}
            <select
              className="input text-xs py-1.5 min-w-[150px]"
              value={depotId}
              onChange={(e) => {
                setDepotId(e.target.value === "" ? "" : Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="">All Depots</option>
              {(depotsQuery.data || []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            {/* Assignment filter */}
            <select
              className="input text-xs py-1.5 min-w-[130px]"
              value={assigned}
              onChange={(e) => { setAssigned(e.target.value); setPage(1); }}
            >
              <option value="ALL">All Assignments</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="UNASSIGNED">Unassigned</option>
            </select>

            {/* Date Input */}
            <input
              type="date"
              className="input text-xs py-1 px-2.5 max-w-[140px]"
              value={onDate}
              onChange={(e) => { setOnDate(e.target.value); setPage(1); }}
            />

          </div>

          {/* Reset Filters */}
          {isFiltered && (
            <button
              className="text-xs font-semibold text-brand-600 hover:text-brand-800 hover:underline flex items-center gap-1.5"
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Orders Table Area */}
        <div className="card overflow-hidden shadow-xs border border-slate-200">
          {ordersQuery.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : ordersQuery.isError ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-red-500">
              <span className="text-2xl mb-1">⚠️</span>
              <p className="font-semibold text-sm">Failed to load orders</p>
              <button className="btn-primary text-xs mt-3 py-1.5 px-4" onClick={() => ordersQuery.refetch()}>
                Retry Load
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              {isFiltered ? (
                <div className="flex flex-col items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                    <span className="text-xl">🔍</span>
                  </div>
                  <h4 className="text-sm font-semibold text-ink-800">No matching orders found</h4>
                  <p className="text-xs text-ink-400 mt-1">Try clearing your filters or adjusting search queries.</p>
                  <button className="btn-secondary text-xs mt-4" onClick={handleResetFilters}>
                    Clear Filters
                  </button>
                </div>
              ) : (
                <EmptyState title="No orders in system" hint="Create your first delivery order to get started." />
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-ink-100 text-[11px] font-bold uppercase tracking-wider text-ink-400 select-none">
                  <tr>
                    <th className="px-4 py-3">Order Code</th>
                    <th className="px-4 py-3">Customer Info</th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3 text-center">Payload Weight</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Hub Depot</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Window Timeframes</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {items.map((o) => {
                    const isSelected = selectedOrder?.id === o.id;
                    const depot = depotsMap.get(o.depot_id);
                    return (
                      <tr
                        key={o.id}
                        className={`transition-colors cursor-pointer hover:bg-slate-50/70 ${
                          isSelected ? "bg-brand-50/50 font-medium" : ""
                        }`}
                        onClick={() => setSelectedOrder(o)}
                      >
                        <td className="px-4 py-3 font-semibold text-brand-700">
                          <div>{o.order_number}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink-900">{o.customer_name}</div>
                          {o.customer_phone && <div className="text-xs text-ink-400">{o.customer_phone}</div>}
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="truncate text-ink-700" title={o.delivery_address}>{o.delivery_address}</div>
                        </td>
                        <td className="px-4 py-3 text-center text-ink-750 font-semibold tabular-nums">
                          {o.weight_kg} kg
                          {o.volume ? <span className="text-[10px] text-ink-400 block font-normal">{o.volume} m³</span> : null}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge value={o.priority} />
                        </td>
                        <td className="px-4 py-3 text-ink-600 font-medium truncate max-w-[140px]">
                          {depot ? depot.name : `Depot #${o.depot_id}`}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge value={o.status} />
                        </td>
                        <td className="px-4 py-3 text-[11px] text-ink-500 whitespace-nowrap leading-relaxed">
                          <div>Created: {formatDate(o.created_at)}</div>
                          <div className="text-[10px] text-brand-600 font-mono mt-0.5">
                            Window: {formatWindow(o.delivery_window_start, o.delivery_window_end)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            
                            <button
                              className="rounded p-1.5 text-brand-600 hover:bg-brand-50 transition-colors"
                              title="Edit Order"
                              onClick={(e) => openEdit(o, e)}
                            >
                              Edit
                            </button>

                            {o.status === "PENDING" ? (
                              <button
                                className="rounded p-1.5 text-red-600 hover:bg-red-50 transition-colors"
                                title="Cancel Order"
                                onClick={(e) => openCancelConfirm(o, e)}
                              >
                                Cancel
                              </button>
                            ) : null}

                            {editable && (
                              <button
                                className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-700 transition-colors"
                                title="Delete Order"
                                onClick={(e) => openDeleteConfirm(o, e)}
                              >
                                Delete
                              </button>
                            )}
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

        {/* Pagination Footer */}
        {pageData && totalOrders > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500 pt-1">
            <span className="font-semibold text-ink-500">
              Showing <strong className="text-ink-800">{startItem}–{endItem}</strong> of <strong className="text-ink-800">{totalOrders}</strong> orders
            </span>

            <div className="flex items-center gap-1.5">
              <button
                className="btn-ghost text-xs px-2.5 py-1.5 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Previous
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                  let pNum = page;
                  if (totalPages <= 5) {
                    pNum = idx + 1;
                  } else if (page <= 3) {
                    pNum = idx + 1;
                  } else if (page >= totalPages - 2) {
                    pNum = totalPages - 4 + idx;
                  } else {
                    pNum = page - 2 + idx;
                  }
                  const isCurrent = pNum === page;
                  return (
                    <button
                      key={pNum}
                      className={`h-7 w-7 rounded text-xs font-semibold transition-colors ${
                        isCurrent
                          ? "bg-brand-600 text-white"
                          : "text-ink-600 hover:bg-slate-100"
                      }`}
                      onClick={() => setPage(pNum)}
                    >
                      {pNum}
                    </button>
                  );
                })}
              </div>

              <button
                className="btn-ghost text-xs px-2.5 py-1.5 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Side Panel: Order Details Drawer */}
      {selectedOrder && (
        <OrderDetailsDrawer
          order={selectedOrder}
          depot={depotsMap.get(selectedOrder.depot_id)}
          routeAssignment={orderRouteMap.get(selectedOrder.id)}
          editable={editable}
          onClose={() => setSelectedOrder(null)}
          onEdit={() => openEdit(selectedOrder)}
          onCancel={() => openCancelConfirm(selectedOrder)}
          onDelete={() => openDeleteConfirm(selectedOrder)}
        />
      )}

      {/* Order Form Modal (Create / Edit) */}
      {modalOpen && (
        <OrderForm
          order={editingOrder}
          depots={depotsQuery.data || []}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            qc.invalidateQueries({ queryKey: ["orders"] });
            qc.invalidateQueries({ queryKey: ["orders-ops-summary"] });
          }}
        />
      )}

      {/* Cancel Confirmation Modal */}
      {cancelingOrder && (
        <Modal open title="Cancel Order Confirmation" onClose={() => setCancelingOrder(null)}>
          <div className="space-y-4 text-xs text-ink-700">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3.5 text-amber-800">
              Are you sure you want to cancel order <strong className="font-bold">{cancelingOrder.order_number}</strong>? This cancels vehicle dispatch assignments.
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCancelingOrder(null)}>Abort</button>
              <button
                className="btn-danger"
                disabled={cancelMut.isPending}
                onClick={() => cancelMut.mutate(cancelingOrder.id)}
              >
                Cancel Order
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingOrder && (
        <Modal open title="Delete Order Permanently" onClose={() => setDeletingOrder(null)}>
          <div className="space-y-4 text-xs text-ink-700">
            <div className="rounded-lg bg-red-50 border border-red-200 p-3.5 text-red-800">
              🚨 <strong>CRITICAL WARNING:</strong> This action will permanently remove order <strong className="font-bold">{deletingOrder.order_number}</strong> from the database. This cannot be undone.
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDeletingOrder(null)}>Abort</button>
              <button
                className="btn-danger"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(deletingOrder.id)}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Compact KPI Card Component
function KpiCardCompact({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: "slate" | "red" | "amber" | "indigo" | "amber-alert";
  icon: "cube" | "flame" | "clock" | "calendar" | "alert";
}) {
  const badgeColorMap = {
    slate: "bg-slate-100 text-slate-600",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    indigo: "bg-indigo-100 text-indigo-800",
    "amber-alert": "bg-orange-100 text-orange-800",
  };

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink-900 tabular-nums">{value}</div>
      </div>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${badgeColorMap[color]}`}>
        {icon === "cube" && <span>📦</span>}
        {icon === "flame" && <span>🔥</span>}
        {icon === "clock" && <span>⏳</span>}
        {icon === "calendar" && <span>📅</span>}
        {icon === "alert" && <span>🚨</span>}
      </div>
    </div>
  );
}

// Drawer details component
function OrderDetailsDrawer({
  order,
  depot,
  routeAssignment,
  editable,
  onClose,
  onEdit,
  onCancel,
  onDelete,
}: {
  order: Order;
  depot?: Depot;
  routeAssignment?: { route: Route; stop: any; vehicle?: Vehicle };
  editable: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const hasCoords = Boolean(order.latitude && order.longitude && (order.latitude !== 0 || order.longitude !== 0));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const isAssigned = order.status !== "PENDING" && order.status !== "CANCELLED";
  const isOutForDelivery = order.status === "OUT_FOR_DELIVERY" || order.status === "DELIVERED";
  const isDelivered = order.status === "DELIVERED";
  const isCancelled = order.status === "CANCELLED";
  const isFailed = order.status === "FAILED";

  return (
    <div className="fixed inset-0 z-[950] overflow-hidden">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[951] flex w-full max-w-lg flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200 border-l border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/80">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-base font-bold text-slate-900">{order.order_number}</h3>
              <StatusBadge value={order.status} />
              <StatusBadge value={order.priority} />
            </div>
            <p className="text-[10px] text-ink-400 mt-1">Dispatched from: <strong>{depot?.name || `Depot #${order.depot_id}`}</strong></p>
          </div>
          <div className="flex items-center gap-1.5">
            {editable && order.status === "PENDING" && (
              <button className="btn-secondary text-[11px] px-2.5 py-1 text-red-600 hover:bg-red-50" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button className="btn-secondary text-[11px] px-2.5 py-1" onClick={onEdit}>
              Edit
            </button>
            {editable && (
              <button className="btn-secondary text-[11px] px-2.5 py-1 text-red-600 hover:bg-red-50" onClick={onDelete}>
                Delete
              </button>
            )}
            <button className="text-ink-400 hover:text-ink-700 text-sm px-2 py-1" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-ink-700">
          
          {/* Customer & address details */}
          <div className="card p-4 space-y-2 border border-slate-200">
            <h4 className="font-bold text-[10px] uppercase text-ink-400 border-b pb-1.5">Delivery Details</h4>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
              <div>
                <span className="text-ink-400 block text-[10px] uppercase">Customer Name</span>
                <span className="font-bold text-ink-900">{order.customer_name}</span>
              </div>
              <div>
                <span className="text-ink-400 block text-[10px] uppercase">Phone</span>
                <span className="font-bold text-ink-900">{order.customer_phone || "N/A"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-ink-400 block text-[10px] uppercase">Address</span>
                <span className="font-medium text-ink-800">{order.delivery_address}</span>
              </div>
              <div>
                <span className="text-ink-400 block text-[10px] uppercase">Payload</span>
                <span className="font-bold text-ink-900">{order.weight_kg} kg {order.volume ? `· ${order.volume} m³` : ""}</span>
              </div>
              <div>
                <span className="text-ink-400 block text-[10px] uppercase">Service Window</span>
                <span className="font-mono font-semibold text-brand-600">{formatWindow(order.delivery_window_start, order.delivery_window_end)}</span>
              </div>
            </div>
          </div>

          {/* Leaflet Map Context */}
          {hasCoords && (
            <div className="card overflow-hidden border border-slate-200 h-40 relative z-0">
              <MapContainer center={[order.latitude, order.longitude]} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
                <Marker position={[order.latitude, order.longitude]} icon={coloredDot("#ef4444", 16)}>
                  <Popup>
                    <div className="text-xs">
                      <strong>{order.order_number}</strong>
                      <div>{order.delivery_address}</div>
                    </div>
                  </Popup>
                </Marker>
                {depot && (
                  <Marker position={[depot.latitude, depot.longitude]} icon={depotIcon}>
                    <Popup>
                      <strong>{depot.name}</strong>
                      <div>Home Hub</div>
                    </Popup>
                  </Marker>
                )}
                <MapAutoBounds points={[[order.latitude, order.longitude], ...(depot ? [[depot.latitude, depot.longitude] as [number, number]] : [])]} padding={[25, 25]} />
              </MapContainer>
            </div>
          )}

          {/* Route Assignment Info */}
          <div className="card p-4 space-y-2.5 border border-slate-200">
            <h4 className="font-bold text-[10px] uppercase text-ink-400 border-b pb-1.5">Route & Dispatch Info</h4>
            {routeAssignment ? (
              <div className="bg-brand-50/30 border border-brand-200 rounded-lg p-3 space-y-2 text-brand-950">
                <div className="flex justify-between items-center font-bold">
                  <span>{routeAssignment.route.route_code}</span>
                  <StatusBadge value={routeAssignment.route.status} />
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-[11px]">
                  <div>
                    <span className="text-ink-400 block text-[10px]">VEHICLE</span>
                    <span className="font-semibold text-slate-800">{routeAssignment.vehicle?.registration_number || "Unassigned"}</span>
                  </div>
                  <div>
                    <span className="text-ink-400 block text-[10px]">DRIVER</span>
                    <span className="font-semibold text-slate-800">{routeAssignment.vehicle?.driver_name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-ink-400 block text-[10px]">STOP SEQUENCE</span>
                    <span className="font-semibold text-slate-800">Stop #{routeAssignment.stop.stop_sequence}</span>
                  </div>
                  <div>
                    <span className="text-ink-400 block text-[10px]">SEGMENT DISTANCE</span>
                    <span className="font-semibold text-slate-800">{routeAssignment.stop.distance_from_previous_km} km</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-slate-200 rounded-lg p-4 text-center bg-slate-50/50">
                <div className="text-amber-500 text-lg">⏳</div>
                <div className="font-bold text-slate-700 mt-1">Pending Route Optimization</div>
                <div className="text-[10px] text-slate-500 mt-0.5">This order is awaiting planning in the optimization workspace.</div>
              </div>
            )}
          </div>

          {/* Order Timeline */}
          <div className="card p-4 border border-slate-200 space-y-3">
            <h4 className="font-bold text-[10px] uppercase text-ink-400 border-b pb-1.5">Fulfillment Timeline</h4>
            <div className="pl-2 pt-1">
              <TimelineStep
                title="Order Logged"
                subtitle={`Logged on ${formatDate(order.created_at)}`}
                isCompleted={true}
                isCurrent={order.status === "PENDING"}
              />

              {isCancelled ? (
                <TimelineStep title="Cancelled" subtitle="Cancelled by dispatcher before routing" isCompleted={true} isError={true} />
              ) : isFailed ? (
                <TimelineStep title="Delivery Attempt Failed" subtitle="Driver recorded delivery failure" isCompleted={true} isError={true} />
              ) : (
                <>
                  <TimelineStep
                    title="Routed"
                    subtitle={isAssigned ? (routeAssignment ? `Assigned to route ${routeAssignment.route.route_code}` : "Assigned to route plan") : "Awaiting solver sequence"}
                    isCompleted={isAssigned}
                    isCurrent={order.status === "ASSIGNED"}
                  />
                  <TimelineStep
                    title="Out for Delivery"
                    subtitle={isOutForDelivery ? "Driver has departed hub with this package" : "Package at hub warehouse"}
                    isCompleted={isOutForDelivery}
                    isCurrent={order.status === "OUT_FOR_DELIVERY"}
                  />
                  <TimelineStep
                    title="Delivered"
                    subtitle={isDelivered ? (routeAssignment?.stop?.actual_arrival ? `Successfully delivered at ${formatDate(routeAssignment.stop.actual_arrival)}` : "Successfully delivered to customer") : "Awaiting drop-off confirmation"}
                    isCompleted={isDelivered}
                    isCurrent={order.status === "DELIVERED"}
                    isLast={true}
                  />
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Timeline Step Component
function TimelineStep({
  title,
  subtitle,
  isCompleted,
  isCurrent,
  isError,
  isLast = false,
}: {
  title: string;
  subtitle: string;
  isCompleted: boolean;
  isCurrent?: boolean;
  isError?: boolean;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-3 relative pb-5">
      {!isLast && (
        <span className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${isCompleted && !isError ? "bg-emerald-500" : "bg-slate-200"}`} />
      )}
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold z-10 ${
          isError ? "bg-red-500 text-white" : isCompleted ? "bg-emerald-500 text-white" : isCurrent ? "bg-brand-600 text-white ring-4 ring-brand-100" : "bg-slate-200 text-slate-400"
        }`}
      >
        {isError ? "✕" : isCompleted ? "✓" : "•"}
      </div>
      <div>
        <p className={`text-[11px] font-bold ${isCompleted ? "text-ink-900" : "text-ink-400"}`}>{title}</p>
        <p className="text-[10px] text-ink-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// Order Form Modal Component
function OrderForm({
  order,
  depots,
  onClose,
  onSaved,
}: {
  order: Order | null;
  depots: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const push = useToast((s) => s.push);
  const [form, setForm] = useState({
    customer_name: order?.customer_name || "",
    customer_phone: order?.customer_phone || "",
    delivery_address: order?.delivery_address || "",
    latitude: order?.latitude ?? 16.309485,
    longitude: order?.longitude ?? 80.425991,
    weight_kg: order?.weight_kg ?? 5,
    priority: order?.priority || "NORMAL",
    service_time_minutes: order?.service_time_minutes ?? 10,
    depot_id: order?.depot_id ?? depots[0]?.id ?? 1,
    delivery_window_start: toLocalDatetimeString(order?.delivery_window_start),
    delivery_window_end: toLocalDatetimeString(order?.delivery_window_end),
  });

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        delivery_window_start: form.delivery_window_start ? new Date(form.delivery_window_start).toISOString() : null,
        delivery_window_end: form.delivery_window_end ? new Date(form.delivery_window_end).toISOString() : null,
      };
      return order ? orderApi.update(order.id, payload as any) : orderApi.create(payload as any);
    },
    onSuccess: () => {
      push(order ? "Order updated" : "Order created", "success");
      onSaved();
    },
    onError: (e: any) => push(e.message || "Operation failed", "error"),
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open onClose={onClose} title={order ? `Edit ${order.order_number}` : "Create New Order"}>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="col-span-2">
          <label className="label">Customer Name</label>
          <input className="input" value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.customer_phone} onChange={(e) => set("customer_phone", e.target.value)} />
        </div>
        <div>
          <label className="label">Depot</label>
          <select className="input" value={form.depot_id} onChange={(e) => set("depot_id", Number(e.target.value))}>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Delivery Address</label>
          <input className="input" value={form.delivery_address} onChange={(e) => set("delivery_address", e.target.value)} />
        </div>
        <div>
          <label className="label">Latitude</label>
          <input className="input" type="number" step="0.0001" value={form.latitude} onChange={(e) => set("latitude", Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input className="input" type="number" step="0.0001" value={form.longitude} onChange={(e) => set("longitude", Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Weight (kg)</label>
          <input className="input" type="number" step="0.1" value={form.weight_kg} onChange={(e) => set("weight_kg", Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="input" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Service Time (min)</label>
          <input className="input" type="number" value={form.service_time_minutes} onChange={(e) => set("service_time_minutes", Number(e.target.value))} />
        </div>
        <div className="col-span-2 border-t border-slate-100 pt-2.5 mt-1 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Delivery Window Start</label>
            <input type="datetime-local" className="input" value={form.delivery_window_start} onChange={(e) => set("delivery_window_start", e.target.value)} />
          </div>
          <div>
            <label className="label">Delivery Window End</label>
            <input type="datetime-local" className="input" value={form.delivery_window_end} onChange={(e) => set("delivery_window_end", e.target.value)} />
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost text-xs font-semibold" onClick={onClose}>Cancel</button>
        <button className="btn-primary text-xs font-semibold" disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "Saving…" : "Save Order"}
        </button>
      </div>
    </Modal>
  );
}
