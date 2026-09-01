"""Generate realistic Pan-India demo orders with rich clustering around primary AP hub and regional depots.

Usage:
    python -m scripts.generate_demo_orders --pan-india
    python -m scripts.generate_demo_orders --count 100 --depot 1
"""
from __future__ import annotations

import argparse
import asyncio
import random
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.geospatial.queries import make_point
from app.models.depot import Depot
from app.models.enums import OrderPriority, OrderStatus
from app.models.order import Order
from app.models.telemetry import DeliveryEvent
from scripts.demo_geo import (
    PRIMARY_AP_ZONES,
    REGIONAL_DEPOTS,
    REGIONAL_ZONES,
    random_address,
    random_customer,
    random_primary_point,
)

PRIORITY_WEIGHTS = [
    (OrderPriority.LOW, 0.20),
    (OrderPriority.NORMAL, 0.45),
    (OrderPriority.HIGH, 0.25),
    (OrderPriority.URGENT, 0.10),
]


def _pick_priority(rng: random.Random) -> OrderPriority:
    r = rng.random()
    cum = 0.0
    for pr, w in PRIORITY_WEIGHTS:
        cum += w
        if r <= cum:
            return pr
    return OrderPriority.NORMAL


def _window(rng: random.Random) -> tuple[datetime, datetime]:
    today = datetime.now(timezone.utc).date()
    start_hour = rng.choice([8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
    start = datetime.combine(today, time(start_hour, 0), tzinfo=timezone.utc)
    end = start + timedelta(hours=rng.choice([2, 3, 4]))
    return start, end


def _generate_weight_and_volume(rng: random.Random) -> tuple[float, float]:
    """Generate realistic correlated weight (1-100 kg) and volume (0.01 - 1.2 m3)."""
    tier = rng.random()
    if tier < 0.60:
        # Small / medium parcel (e-commerce, documents, groceries)
        weight = round(rng.uniform(1.0, 15.0), 1)
        volume = round(weight * rng.uniform(0.005, 0.015), 3)
    elif tier < 0.85:
        # Carton / appliance / bulk groceries
        weight = round(rng.uniform(15.0, 45.0), 1)
        volume = round(weight * rng.uniform(0.008, 0.018), 3)
    else:
        # Heavy cargo / machinery / industrial goods
        weight = round(rng.uniform(45.0, 100.0), 1)
        volume = round(rng.uniform(0.40, 1.20), 3)
    return weight, max(0.01, min(1.5, volume))


async def generate_orders(count: int, depot_id: int, seed: int | None = None) -> int:
    """Generate `count` orders specifically tied to `depot_id`."""
    rng = random.Random(seed)
    async with AsyncSessionLocal() as db:
        depot = (await db.execute(select(Depot).where(Depot.id == depot_id))).scalar_one_or_none()
        base = (await db.execute(select(func.coalesce(func.max(Order.id), 0)))).scalar_one()

        objs = []
        for i in range(count):
            if depot and (abs(depot.latitude - 16.309485) < 0.1):
                # Primary AP central depot
                lat, lon, zone_name = random_primary_point(rng)
            elif depot:
                # Jitter around target depot
                spread = 0.05
                lat = round(depot.latitude + rng.uniform(-spread, spread), 6)
                lon = round(depot.longitude + rng.uniform(-spread, spread), 6)
                zone_name = depot.name
            else:
                lat, lon, zone_name = random_primary_point(rng)

            address, _ = random_address(rng, zone_name=zone_name)
            has_window = rng.random() < 0.65
            ws, we = _window(rng) if has_window else (None, None)
            weight, volume = _generate_weight_and_volume(rng)

            objs.append(
                Order(
                    order_number=f"ORD-{base + i + 1:05d}",
                    customer_name=random_customer(rng),
                    customer_phone=f"+9198{rng.randint(10000000, 99999999)}",
                    delivery_address=address,
                    latitude=lat,
                    longitude=lon,
                    location=make_point(lat, lon),
                    weight_kg=weight,
                    volume=volume,
                    priority=_pick_priority(rng),
                    delivery_window_start=ws,
                    delivery_window_end=we,
                    service_time_minutes=rng.choice([5, 8, 10, 12, 15, 20]),
                    depot_id=depot_id,
                )
            )
        db.add_all(objs)
        await db.commit()
    return count


async def generate_pan_india_orders(seed: int | None = 42) -> int:
    """Generate 160-180 Pan-India demo orders.

    - 70-75 orders clustered around the primary Guntur/AP Central hub for local routing.
    - 9-11 orders clustered around each of the 10 regional hubs.
    Total: ~170 realistic orders.
    """
    rng = random.Random(seed)
    async with AsyncSessionLocal() as db:
        depots = (await db.execute(select(Depot).order_by(Depot.id))).scalars().all()
        if not depots:
            print("[generate_demo_orders] No depots found. Seed depots first.")
            return 0

        base = (await db.execute(select(func.coalesce(func.max(Order.id), 0)))).scalar_one()
        objs = []
        order_idx = base + 1

        primary_depot = depots[0]
        regional_depots = depots[1:]

        # 1. Primary Hub Orders: 72 orders in Guntur - Vijayawada - Amaravati corridor
        primary_order_count = 72
        for _ in range(primary_order_count):
            zone = rng.choice(PRIMARY_AP_ZONES)
            name, zlat, zlon, spread, _ = zone
            lat = round(zlat + rng.uniform(-spread, spread), 6)
            lon = round(zlon + rng.uniform(-spread, spread), 6)
            address, _ = random_address(rng, zone_name=name)
            has_window = rng.random() < 0.65
            ws, we = _window(rng) if has_window else (None, None)
            weight, volume = _generate_weight_and_volume(rng)

            objs.append(
                Order(
                    order_number=f"ORD-{order_idx:05d}",
                    customer_name=random_customer(rng),
                    customer_phone=f"+9198{rng.randint(10000000, 99999999)}",
                    delivery_address=address,
                    latitude=lat,
                    longitude=lon,
                    location=make_point(lat, lon),
                    weight_kg=weight,
                    volume=volume,
                    priority=_pick_priority(rng),
                    delivery_window_start=ws,
                    delivery_window_end=we,
                    service_time_minutes=rng.choice([5, 8, 10, 12, 15, 20]),
                    depot_id=primary_depot.id,
                )
            )
            order_idx += 1

        # 2. Regional Hub Orders: 10 orders per regional depot (~100 orders across 10 hubs)
        for rdepot in regional_depots:
            reg_count = 10
            for _ in range(reg_count):
                spread = 0.055
                lat = round(rdepot.latitude + rng.uniform(-spread, spread), 6)
                lon = round(rdepot.longitude + rng.uniform(-spread, spread), 6)
                address, _ = random_address(rng, zone_name=rdepot.name)
                has_window = rng.random() < 0.60
                ws, we = _window(rng) if has_window else (None, None)
                weight, volume = _generate_weight_and_volume(rng)

                objs.append(
                    Order(
                        order_number=f"ORD-{order_idx:05d}",
                        customer_name=random_customer(rng),
                        customer_phone=f"+9198{rng.randint(10000000, 99999999)}",
                        delivery_address=address,
                        latitude=lat,
                        longitude=lon,
                        location=make_point(lat, lon),
                        weight_kg=weight,
                        volume=volume,
                        priority=_pick_priority(rng),
                        delivery_window_start=ws,
                        delivery_window_end=we,
                        service_time_minutes=rng.choice([5, 8, 10, 12, 15, 20]),
                        depot_id=rdepot.id,
                    )
                )
                order_idx += 1

        db.add_all(objs)
        await db.commit()
        return len(objs)


async def generate_historical_delivery_orders(seed: int | None = 42, days: int = 14) -> int:
    """Generate realistic historical delivered orders and DeliveryEvents spanning the last `days` days.

    For each past day (from today - 13 days to today - 1 day), creates 14-24 completed
    orders with realistic delivery timestamps and matching DeliveryEvent records.
    """
    rng = random.Random(seed)
    async with AsyncSessionLocal() as db:
        depots = (await db.execute(select(Depot).order_by(Depot.id))).scalars().all()
        if not depots:
            print("[generate_historical_delivery_orders] No depots found. Seed depots first.")
            return 0

        base = (await db.execute(select(func.coalesce(func.max(Order.id), 0)))).scalar_one()
        today = datetime.now(timezone.utc).date()

        total_created = 0
        order_idx = base + 1

        for day_offset in range(days - 1, 0, -1):
            hist_date = today - timedelta(days=day_offset)
            daily_count = rng.randint(14, 24)
            daily_orders: list[Order] = []

            for _ in range(daily_count):
                depot = rng.choice(depots)
                if abs(depot.latitude - 16.309485) < 0.1:
                    lat, lon, zone_name = random_primary_point(rng)
                else:
                    spread = 0.05
                    lat = round(depot.latitude + rng.uniform(-spread, spread), 6)
                    lon = round(depot.longitude + rng.uniform(-spread, spread), 6)
                    zone_name = depot.name

                address, _ = random_address(rng, zone_name=zone_name)
                weight, volume = _generate_weight_and_volume(rng)

                # Created in the morning
                created_hour = rng.randint(6, 9)
                created_min = rng.randint(0, 59)
                created_dt = datetime.combine(hist_date, time(created_hour, created_min), tzinfo=timezone.utc)

                # Delivered in the afternoon / evening
                deliv_hour = rng.randint(11, 18)
                deliv_min = rng.randint(0, 59)
                deliv_dt = datetime.combine(hist_date, time(deliv_hour, deliv_min), tzinfo=timezone.utc)

                ws = datetime.combine(hist_date, time(created_hour + 2, 0), tzinfo=timezone.utc)
                we = ws + timedelta(hours=rng.choice([3, 4, 5]))

                order = Order(
                    order_number=f"ORD-HIST-{order_idx:05d}",
                    customer_name=random_customer(rng),
                    customer_phone=f"+9198{rng.randint(10000000, 99999999)}",
                    delivery_address=address,
                    latitude=lat,
                    longitude=lon,
                    location=make_point(lat, lon),
                    weight_kg=weight,
                    volume=volume,
                    priority=_pick_priority(rng),
                    status=OrderStatus.DELIVERED,
                    delivery_window_start=ws,
                    delivery_window_end=we,
                    service_time_minutes=rng.choice([5, 8, 10, 12, 15, 20]),
                    depot_id=depot.id,
                    created_at=created_dt,
                )
                daily_orders.append(order)
                order_idx += 1

            db.add_all(daily_orders)
            await db.flush()

            # Create corresponding DELIVERY_COMPLETED events
            daily_events = [
                DeliveryEvent(
                    order_id=o.id,
                    event_type="DELIVERY_COMPLETED",
                    event_metadata={"historical": True, "delivered_at": deliv_dt.isoformat()},
                    created_at=deliv_dt,
                )
                for o in daily_orders
            ]
            db.add_all(daily_events)
            total_created += len(daily_orders)

        await db.commit()
        return total_created


async def _main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pan-india", action="store_true", help="Generate 170+ Pan-India distributed orders across all depots")
    parser.add_argument("--historical", action="store_true", help="Generate historical delivery orders for the last 14 days")
    parser.add_argument("--count", type=int, default=100, help="Order count for a single depot")
    parser.add_argument("--depot", type=int, default=1, help="Depot ID for single depot order generation")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.historical:
        h = await generate_historical_delivery_orders(seed=args.seed)
        print(f"Generated {h} historical delivery orders spanning the last 14 days.")
    elif args.pan_india:
        n = await generate_pan_india_orders(seed=args.seed)
        h = await generate_historical_delivery_orders(seed=args.seed)
        print(f"Generated {n} Pan-India demo orders + {h} historical delivery records across all depots.")
    else:
        n = await generate_orders(args.count, args.depot, args.seed)
        print(f"Generated {n} demo orders for depot {args.depot}.")


if __name__ == "__main__":
    asyncio.run(_main())


