"""Idempotent demo seed: users, primary AP central hub + 10 regional depots, fleet, ~170 Pan-India orders.

Run:  python -m scripts.seed_data
Safe to run repeatedly — it no-ops if depots already exist.
"""
from __future__ import annotations

import asyncio
import random

from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.geospatial.queries import make_point
from app.models.depot import Depot
from app.models.enums import UserRole, VehicleStatus
from app.models.user import User
from app.models.vehicle import Vehicle
from scripts.demo_geo import ALL_DEPOTS, PRIMARY_DEPOT, REGIONAL_DEPOTS
from scripts.generate_demo_orders import generate_historical_delivery_orders, generate_pan_india_orders

# Vehicle specifications: (type, capacity_kg, volume_m3, max_route_distance_km)
VEHICLE_CONFIGS = [
    # Two-wheelers: Rapid urban last-mile delivery
    ("BIKE", 40.0, 0.35, 100.0),
    ("BIKE", 50.0, 0.45, 120.0),
    # Mini Vans (Tata Ace / Mahindra Bolero Maxi Truck)
    ("MINI_VAN", 350.0, 3.2, 180.0),
    ("MINI_VAN", 450.0, 4.0, 200.0),
    ("MINI_VAN", 500.0, 4.5, 220.0),
    # Standard Vans (Eicher / Force Traveller / Tata 407)
    ("VAN", 750.0, 6.5, 240.0),
    ("VAN", 850.0, 7.5, 260.0),
    ("VAN", 1000.0, 9.0, 280.0),
    # Heavy Cargo Trucks (Tata LPT / Ashok Leyland 1616)
    ("TRUCK", 1800.0, 16.0, 400.0),
    ("TRUCK", 2500.0, 22.0, 450.0),
    ("TRUCK", 3500.0, 30.0, 500.0),
]

INDIAN_STATE_CODES = [
    "AP", "TG", "KA", "TN", "OD", "MH", "KL", "GJ", "RJ", "UP", "MP", "WB", "HR", "PB", "GA", "DL"
]

DRIVERS = [
    # Andhra Pradesh & Telangana
    "Venkatesh Rao", "Sai Krishna Reddy", "Ramesh Chowdary", "Suresh Naidu",
    "Prasad Goud", "Naveen Varma", "Kiran Kolisetty", "Chaitanya Raju",
    "Ramana Garlapati", "Sravan Yalamanchili", "Teja Konidela", "Raghu Varma",
    # Karnataka, Tamil Nadu, Kerala
    "Karthik Iyer", "Anand Murthy", "Srinivasan Pillai", "Rajesh Nair",
    "Biju Kurup", "Praveen Gowda", "Manjunath Shetty", "Dhanush Balakrishnan",
    "Gautham Swaminathan", "Manoj Hegde", "Sivaram Bhat",
    # North & Central India
    "Ravi Kumar", "Sunil Yadav", "Amit Chauhan", "Deepak Rana", "Manoj Bisht",
    "Rakesh Jha", "Vinod Negi", "Ashok Mehta", "Pawan Saini", "Gopal Das",
    "Naveen Rawat", "Harish Goel", "Sanjay Dutt", "Mohan Lal", "Imran Khan",
    # West & East India
    "Kunal Sethi", "Anil Kapadia", "Yogesh Tomar", "Sachin Deshmukh",
    "Amol Shinde", "Santosh Patil", "Nilesh Kulkarni", "Tushar Joshi",
    "Bhavesh Patel", "Jignesh Shah", "Sourav Banerjee", "Debasish Das",
    "Pradip Mukherjee", "Bikram Mahapatra", "Jagannath Panda",
]


def _generate_reg_number(rng: random.Random, preferred_state: str | None, used_regs: set[str]) -> str:
    """Generate a realistic, unique Indian vehicle registration number."""
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    state = preferred_state if (preferred_state and rng.random() < 0.7) else rng.choice(INDIAN_STATE_CODES)
    rto = rng.randint(1, 38)
    for _ in range(200):
        series = f"{rng.choice(letters)}{rng.choice(letters)}"
        num = rng.randint(1000, 9999)
        reg = f"{state} {rto:02d} {series} {num}"
        if reg not in used_regs:
            used_regs.add(reg)
            return reg
    fallback = f"{state} {rng.randint(1,99):02d} XX {rng.randint(1000,9999)}"
    used_regs.add(fallback)
    return fallback


async def _seed_users(db) -> None:
    accounts = [
        (settings.demo_admin_email, "Ava Admin", settings.demo_admin_password, UserRole.ADMIN),
        (settings.demo_dispatcher_email, "Dev Dispatcher", settings.demo_dispatcher_password, UserRole.DISPATCHER),
        (settings.demo_viewer_email, "Vic Viewer", settings.demo_viewer_password, UserRole.VIEWER),
    ]
    for email, name, pw, role in accounts:
        exists = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if not exists:
            db.add(User(name=name, email=email, password_hash=hash_password(pw), role=role))
    await db.commit()


async def _seed_all_depots(db) -> list[Depot]:
    """Seed the primary AP Central hub and all 10 regional depots."""
    depots = []
    for d in ALL_DEPOTS:
        depot = Depot(
            name=d["name"],
            address=d["address"],
            latitude=d["latitude"],
            longitude=d["longitude"],
            location=make_point(d["latitude"], d["longitude"]),
        )
        db.add(depot)
        depots.append(depot)
    await db.commit()
    for depot in depots:
        await db.refresh(depot)
    return depots


async def _seed_vehicles(db, depots: list[Depot], rng: random.Random) -> None:
    """Seed vehicles across primary hub (18 vehicles) and regional depots (3 vehicles each)."""
    used_regs: set[str] = set()
    driver_idx = 0

    state_map = {
        "Guntur": "AP",
        "Vijayawada": "AP",
        "Hyderabad": "TG",
        "Bengaluru": "KA",
        "Chennai": "TN",
        "Mumbai": "MH",
        "Pune": "MH",
        "Delhi": "DL",
        "Kolkata": "WB",
        "Ahmedabad": "GJ",
        "Kochi": "KL",
    }

    primary_depot = depots[0]
    regional_depots = depots[1:]

    # 1. Primary AP Central Hub Fleet (18 vehicles with rich capacity spectrum)
    primary_fleet_mix = [
        ("BIKE", 40.0, 0.35, 100.0),
        ("BIKE", 40.0, 0.35, 100.0),
        ("BIKE", 50.0, 0.45, 120.0),
        ("BIKE", 50.0, 0.45, 120.0),
        ("MINI_VAN", 350.0, 3.2, 180.0),
        ("MINI_VAN", 400.0, 3.8, 190.0),
        ("MINI_VAN", 450.0, 4.0, 200.0),
        ("MINI_VAN", 500.0, 4.5, 220.0),
        ("VAN", 750.0, 6.5, 240.0),
        ("VAN", 800.0, 7.0, 250.0),
        ("VAN", 850.0, 7.5, 260.0),
        ("VAN", 900.0, 8.0, 270.0),
        ("VAN", 950.0, 8.5, 275.0),
        ("VAN", 1000.0, 9.0, 280.0),
        ("TRUCK", 1800.0, 16.0, 400.0),
        ("TRUCK", 2200.0, 20.0, 420.0),
        ("TRUCK", 2800.0, 25.0, 460.0),
        ("TRUCK", 3500.0, 32.0, 500.0),
    ]

    for vtype, cap, vol, max_dist in primary_fleet_mix:
        driver = DRIVERS[driver_idx % len(DRIVERS)]
        driver_idx += 1
        reg = _generate_reg_number(rng, "AP", used_regs)
        db.add(
            Vehicle(
                registration_number=reg,
                driver_name=driver,
                vehicle_type=vtype,
                capacity_kg=float(cap),
                capacity_volume=float(vol),
                current_load_kg=0.0,
                status=VehicleStatus.AVAILABLE,
                current_latitude=primary_depot.latitude,
                current_longitude=primary_depot.longitude,
                home_depot_id=primary_depot.id,
                max_route_distance_km=float(max_dist),
            )
        )

    # 2. Regional Depots (3 vehicles each: MINI_VAN, VAN, TRUCK)
    for depot in regional_depots:
        pref_state = "AP"
        for city_key, code in state_map.items():
            if city_key in depot.name:
                pref_state = code
                break

        regional_mix = [
            ("MINI_VAN", 400.0, 3.8, 200.0),
            ("VAN", 850.0, 7.5, 260.0),
            ("TRUCK", 2500.0, 22.0, 450.0),
        ]

        for vtype, cap, vol, max_dist in regional_mix:
            driver = DRIVERS[driver_idx % len(DRIVERS)]
            driver_idx += 1
            reg = _generate_reg_number(rng, pref_state, used_regs)
            db.add(
                Vehicle(
                    registration_number=reg,
                    driver_name=driver,
                    vehicle_type=vtype,
                    capacity_kg=float(cap),
                    capacity_volume=float(vol),
                    current_load_kg=0.0,
                    status=VehicleStatus.AVAILABLE,
                    current_latitude=depot.latitude,
                    current_longitude=depot.longitude,
                    home_depot_id=depot.id,
                    max_route_distance_km=float(max_dist),
                )
            )

    await db.commit()


async def seed() -> None:
    rng = random.Random(42)
    async with AsyncSessionLocal() as db:
        await _seed_users(db)
        existing_depot_count = (await db.execute(select(func.count(Depot.id)))).scalar_one()
        if existing_depot_count > 0:
            print("[seed] Depots already present — skipping fleet/order seed (idempotent).")
            return
        depots = await _seed_all_depots(db)
        await _seed_vehicles(db, depots, rng)

    total_orders = await generate_pan_india_orders(seed=7)
    hist_orders = await generate_historical_delivery_orders(seed=7)
    print(f"[seed] Seeded users, {len(ALL_DEPOTS)} depots, 48 vehicles, {total_orders} Pan-India orders, {hist_orders} historical delivery records.")


if __name__ == "__main__":
    asyncio.run(seed())

