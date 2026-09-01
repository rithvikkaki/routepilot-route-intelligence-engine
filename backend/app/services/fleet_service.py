from __future__ import annotations

from geoalchemy2 import Geography
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError, not_found
from app.models.depot import Depot
from app.models.enums import VehicleStatus
from app.models.vehicle import Vehicle
from app.schemas.vehicle import VehicleCreate, VehicleUpdate
from app.services.state_machine import validate_vehicle_transition


async def list_vehicles(
    db: AsyncSession, *, status: VehicleStatus | None = None, depot_id: int | None = None
) -> list[Vehicle]:
    stmt = select(Vehicle).order_by(Vehicle.id)
    if status is not None:
        stmt = stmt.where(Vehicle.status == status)
    if depot_id is not None:
        stmt = stmt.where(Vehicle.home_depot_id == depot_id)
    return list((await db.execute(stmt)).scalars().all())


async def get_vehicle(db: AsyncSession, vehicle_id: int) -> Vehicle:
    v = (await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))).scalar_one_or_none()
    if v is None:
        raise not_found("vehicle", vehicle_id)
    return v


async def create_vehicle(db: AsyncSession, data: VehicleCreate) -> Vehicle:
    depot = (await db.execute(select(Depot).where(Depot.id == data.home_depot_id))).scalar_one_or_none()
    if depot is None:
        raise APIError("INVALID_DEPOT", f"Depot with id {data.home_depot_id} does not exist", status_code=400)

    v = Vehicle(**data.model_dump())
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v


async def update_vehicle(db: AsyncSession, vehicle_id: int, data: VehicleUpdate) -> Vehicle:
    v = await get_vehicle(db, vehicle_id)
    payload = data.model_dump(exclude_unset=True)

    if "home_depot_id" in payload and payload["home_depot_id"] is not None:
        depot = (await db.execute(select(Depot).where(Depot.id == payload["home_depot_id"]))).scalar_one_or_none()
        if depot is None:
            raise APIError("INVALID_DEPOT", f"Depot with id {payload['home_depot_id']} does not exist", status_code=400)

    if "status" in payload and payload["status"] is not None:
        target_status = payload["status"]
        if isinstance(target_status, str):
            target_status = VehicleStatus(target_status)
        validate_vehicle_transition(v.status, target_status)

    for key, value in payload.items():
        setattr(v, key, value)
    await db.commit()
    await db.refresh(v)
    return v


async def delete_vehicle(db: AsyncSession, vehicle_id: int) -> None:
    v = await get_vehicle(db, vehicle_id)
    await db.delete(v)
    await db.commit()


async def vehicles_nearby(
    db: AsyncSession,
    latitude: float,
    longitude: float,
    radius_km: float,
    *,
    only_available: bool = False,
    limit: int = 50,
) -> list[tuple[Vehicle, float]]:
    # Vehicles keep plain lat/lng; build a geography point on the fly for PostGIS.
    veh_point = func.cast(
        func.ST_SetSRID(func.ST_MakePoint(Vehicle.current_longitude, Vehicle.current_latitude), 4326),
        Geography(),
    )
    target = func.cast(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326), Geography())
    dist = func.ST_Distance(veh_point, target)
    stmt = (
        select(Vehicle, dist.label("dist_m"))
        .where(Vehicle.current_latitude.is_not(None))
        .where(func.ST_DWithin(veh_point, target, radius_km * 1000.0))
        .order_by(dist)
        .limit(limit)
    )
    if only_available:
        stmt = stmt.where(Vehicle.status == VehicleStatus.AVAILABLE)
    rows = (await db.execute(stmt)).all()
    return [(row[0], row[1] / 1000.0) for row in rows]
