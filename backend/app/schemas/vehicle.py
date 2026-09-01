from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import VehicleStatus


class VehicleBase(BaseModel):
    registration_number: str = Field(min_length=1, max_length=32)
    driver_name: str = Field(min_length=1, max_length=120)
    vehicle_type: str = "VAN"
    capacity_kg: float = Field(gt=0)
    capacity_volume: float | None = Field(default=None, gt=0)
    home_depot_id: int
    max_route_distance_km: float | None = Field(default=200.0, gt=0)


class VehicleCreate(VehicleBase):
    current_latitude: float | None = Field(default=None, ge=-90, le=90)
    current_longitude: float | None = Field(default=None, ge=-180, le=180)


class VehicleUpdate(BaseModel):
    registration_number: str | None = Field(default=None, min_length=1, max_length=32)
    driver_name: str | None = None
    vehicle_type: str | None = None
    capacity_kg: float | None = Field(default=None, gt=0)
    capacity_volume: float | None = Field(default=None, gt=0)
    status: VehicleStatus | None = None
    current_latitude: float | None = Field(default=None, ge=-90, le=90)
    current_longitude: float | None = Field(default=None, ge=-180, le=180)
    home_depot_id: int | None = None
    max_route_distance_km: float | None = Field(default=None, gt=0)


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    registration_number: str
    driver_name: str
    vehicle_type: str
    capacity_kg: float
    capacity_volume: float | None
    current_load_kg: float
    status: VehicleStatus
    current_latitude: float | None
    current_longitude: float | None
    home_depot_id: int
    max_route_distance_km: float | None


class NearbyVehicle(VehicleOut):
    distance_km: float
