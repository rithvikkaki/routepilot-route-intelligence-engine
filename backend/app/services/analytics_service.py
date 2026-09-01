"""Analytics via SQL aggregation (not Python-side row crunching), cached in Redis."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import cache_get_json, cache_set_json
from app.models.enums import OrderPriority, OrderStatus, RouteStatus, VehicleStatus
from app.models.optimization import OptimizationRun
from app.models.order import Order
from app.models.route import Route
from app.models.telemetry import DeliveryEvent
from app.models.vehicle import Vehicle

ANALYTICS_TTL = 30


def _cache_key(prefix: str, start: date | None, end: date | None) -> str:
    return f"routeos:analytics:{prefix}:{start}:{end}"


def _range(start: date | None, end: date | None):
    conds = []
    if start:
        conds.append(datetime.combine(start, time.min, tzinfo=timezone.utc))
    if end:
        conds.append(datetime.combine(end, time.max, tzinfo=timezone.utc))
    return conds


async def summary_metrics(db: AsyncSession, start: date | None = None, end: date | None = None) -> dict:
    key = _cache_key("summary", start, end)
    cached = await cache_get_json(key)
    if cached is not None:
        return cached

    route_filter = []
    if start:
        route_filter.append(Route.created_at >= datetime.combine(start, time.min, tzinfo=timezone.utc))
    if end:
        route_filter.append(Route.created_at <= datetime.combine(end, time.max, tzinfo=timezone.utc))

    completed_routes = select(Route).where(Route.status == RouteStatus.COMPLETED)
    for f in route_filter:
        completed_routes = completed_routes.where(f)
    completed_sub = completed_routes.subquery()

    avg_route_distance = float(
        (await db.execute(select(func.coalesce(func.avg(completed_sub.c.total_distance_km), 0.0)))).scalar_one()
    )
    avg_route_duration = float(
        (await db.execute(select(func.coalesce(func.avg(completed_sub.c.actual_duration_minutes), 0.0)))).scalar_one()
    )
    total_completed = int(
        (await db.execute(select(func.count(completed_sub.c.id)))).scalar_one() or 0
    )

    delivered = int(
        (await db.execute(select(func.count(Order.id)).where(Order.status == OrderStatus.DELIVERED))).scalar_one() or 0
    )
    total_orders = int((await db.execute(select(func.count(Order.id)))).scalar_one() or 0)
    unassigned = int(
        (await db.execute(select(func.count(Order.id)).where(Order.status == OrderStatus.PENDING))).scalar_one() or 0
    )

    # Vehicle & capacity utilisation
    fleet_size = int((await db.execute(select(func.count(Vehicle.id)))).scalar_one() or 0)
    busy = int(
        (
            await db.execute(
                select(func.count(Vehicle.id)).where(
                    Vehicle.status.in_([VehicleStatus.IN_TRANSIT, VehicleStatus.ASSIGNED])
                )
            )
        ).scalar_one()
        or 0
    )
    cap_used, cap_total = (
        await db.execute(
            select(func.coalesce(func.sum(Vehicle.current_load_kg), 0.0), func.coalesce(func.sum(Vehicle.capacity_kg), 0.0))
        )
    ).one()

    # Optimization improvement (avg over completed runs)
    avg_improvement = float(
        (
            await db.execute(
                select(func.coalesce(func.avg(OptimizationRun.improvement_percentage), 0.0))
            )
        ).scalar_one()
    )

    result = {
        "avg_route_distance_km": round(avg_route_distance, 2),
        "avg_route_duration_minutes": round(avg_route_duration, 1),
        "completed_routes": total_completed,
        "deliveries_per_vehicle": round(delivered / fleet_size, 2) if fleet_size else 0.0,
        "distance_per_delivery_km": round(avg_route_distance / max(1, delivered) * total_completed, 2)
        if delivered
        else 0.0,
        "vehicle_utilisation_pct": round(busy / fleet_size * 100.0, 1) if fleet_size else 0.0,
        "capacity_utilisation_pct": round(float(cap_used) / float(cap_total) * 100.0, 1) if cap_total else 0.0,
        "delivered_orders": delivered,
        "unassigned_order_rate_pct": round(unassigned / total_orders * 100.0, 1) if total_orders else 0.0,
        "avg_optimization_improvement_pct": round(avg_improvement, 1),
    }
    await cache_set_json(key, result, ANALYTICS_TTL)
    return result


async def orders_by_status(db: AsyncSession) -> list[dict]:
    rows = (
        await db.execute(select(Order.status, func.count(Order.id)).group_by(Order.status))
    ).all()
    return [{"status": s.value, "count": int(c)} for s, c in rows]


async def orders_ops_summary(db: AsyncSession) -> dict:
    """Return specific operational metrics for order management."""
    now = datetime.now(timezone.utc)
    today_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    today_end = datetime.combine(now.date(), time.max, tzinfo=timezone.utc)

    total = int((await db.execute(select(func.count(Order.id)))).scalar_one() or 0)

    high_priority = int(
        (
            await db.execute(
                select(func.count(Order.id)).where(
                    Order.priority.in_([OrderPriority.HIGH, OrderPriority.URGENT])
                )
            )
        ).scalar_one()
        or 0
    )

    unassigned = int(
        (
            await db.execute(
                select(func.count(Order.id)).where(Order.status == OrderStatus.PENDING)
            )
        ).scalar_one()
        or 0
    )

    due_today = int(
        (
            await db.execute(
                select(func.count(Order.id)).where(
                    Order.delivery_window_end >= today_start,
                    Order.delivery_window_end <= today_end,
                )
            )
        ).scalar_one()
        or 0
    )

    at_risk = int(
        (
            await db.execute(
                select(func.count(Order.id)).where(
                    Order.status.in_([OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.OUT_FOR_DELIVERY]),
                    Order.delivery_window_end.is_not(None),
                    Order.delivery_window_end < now,
                )
            )
        ).scalar_one()
        or 0
    )

    return {
        "total_orders": total,
        "high_priority_orders": high_priority,
        "unassigned_orders": unassigned,
        "due_today_orders": due_today,
        "at_risk_orders": at_risk,
    }


async def distance_by_vehicle(db: AsyncSession, limit: int = 20) -> list[dict]:
    rows = (
        await db.execute(
            select(
                Vehicle.registration_number,
                func.coalesce(func.sum(Route.total_distance_km), 0.0).label("dist"),
                func.count(Route.id),
            )
            .join(Route, Route.vehicle_id == Vehicle.id, isouter=True)
            .group_by(Vehicle.id)
            .order_by(func.coalesce(func.sum(Route.total_distance_km), 0.0).desc())
            .limit(limit)
        )
    ).all()
    return [
        {"vehicle": reg, "distance_km": round(float(dist), 1), "routes": int(routes)}
        for reg, dist, routes in rows
    ]


async def deliveries_over_time(db: AsyncSession, days: int = 14) -> list[dict]:
    """Return daily counts of created orders and completed deliveries over the last `days` days.

    Ensures all consecutive dates within the range [today - (days - 1), today] are present,
    providing an unbroken time series visualization with Orders Created vs Orders Delivered.
    """
    today = datetime.now(timezone.utc).date()
    start_date = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start_date, time.min, tzinfo=timezone.utc)

    # 1. Orders created per day
    order_day = func.date_trunc("day", Order.created_at)
    created_rows = (
        await db.execute(
            select(
                order_day.label("day"),
                func.count(Order.id).label("total"),
            )
            .where(Order.created_at >= start_dt)
            .group_by(order_day)
        )
    ).all()
    created_map: dict[str, int] = {}
    for d, t in created_rows:
        if d is not None:
            created_map[d.date().isoformat()] = int(t)

    # 2. Orders delivered per day via DeliveryEvent
    event_day = func.date_trunc("day", DeliveryEvent.created_at)
    event_rows = (
        await db.execute(
            select(
                event_day.label("day"),
                func.count(func.distinct(DeliveryEvent.order_id)).label("delivered"),
            )
            .where(
                DeliveryEvent.event_type == "DELIVERY_COMPLETED",
                DeliveryEvent.created_at >= start_dt,
            )
            .group_by(event_day)
        )
    ).all()
    delivered_map: dict[str, int] = {}
    for d, dv in event_rows:
        if d is not None:
            delivered_map[d.date().isoformat()] = int(dv)

    # 3. Fallback check for DELIVERED orders without explicit DeliveryEvent
    if not event_rows:
        order_day_fallback = func.date_trunc("day", Order.created_at)
        fallback_rows = (
            await db.execute(
                select(
                    order_day_fallback.label("day"),
                    func.count(Order.id).label("delivered"),
                )
                .where(
                    Order.status == OrderStatus.DELIVERED,
                    Order.created_at >= start_dt,
                )
                .group_by(order_day_fallback)
            )
        ).all()
        for d, dv in fallback_rows:
            if d is not None:
                d_str = d.date().isoformat()
                delivered_map[d_str] = max(delivered_map.get(d_str, 0), int(dv))

    # 4. Construct complete daily series from start_date to today
    result = []
    curr = start_date
    while curr <= today:
        d_str = curr.isoformat()
        result.append(
            {
                "day": d_str,
                "total": created_map.get(d_str, 0),
                "delivered": delivered_map.get(d_str, 0),
            }
        )
        curr += timedelta(days=1)

    return result


async def optimization_savings(db: AsyncSession, limit: int = 20) -> list[dict]:
    rows = (
        await db.execute(
            select(
                OptimizationRun.id,
                OptimizationRun.created_at,
                OptimizationRun.total_distance_before,
                OptimizationRun.total_distance_after,
                OptimizationRun.improvement_percentage,
            )
            .where(OptimizationRun.improvement_percentage.is_not(None))
            .order_by(OptimizationRun.created_at.desc())
            .limit(limit)
        )
    ).all()
    out = [
        {
            "run_id": rid,
            "created_at": created.isoformat(),
            "before_km": round(float(b or 0), 1),
            "after_km": round(float(a or 0), 1),
            "improvement_pct": round(float(imp or 0), 1),
        }
        for rid, created, b, a, imp in rows
    ]
    return list(reversed(out))
