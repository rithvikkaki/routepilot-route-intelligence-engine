"""Central domain lifecycle state machine for orders, vehicles, and routes."""
from __future__ import annotations

from app.core.errors import APIError
from app.models.enums import OrderStatus, RouteStatus, VehicleStatus


ALLOWED_ORDER_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PENDING: {OrderStatus.ASSIGNED, OrderStatus.CANCELLED},
    OrderStatus.ASSIGNED: {OrderStatus.OUT_FOR_DELIVERY, OrderStatus.PENDING, OrderStatus.CANCELLED},
    OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.DELIVERED, OrderStatus.FAILED},
    OrderStatus.FAILED: {OrderStatus.PENDING, OrderStatus.CANCELLED},
    OrderStatus.DELIVERED: set(),  # Terminal state
    OrderStatus.CANCELLED: set(),  # Terminal state
}

ALLOWED_VEHICLE_TRANSITIONS: dict[VehicleStatus, set[VehicleStatus]] = {
    VehicleStatus.AVAILABLE: {VehicleStatus.ASSIGNED, VehicleStatus.MAINTENANCE, VehicleStatus.OFFLINE},
    VehicleStatus.ASSIGNED: {VehicleStatus.IN_TRANSIT, VehicleStatus.AVAILABLE, VehicleStatus.MAINTENANCE, VehicleStatus.OFFLINE},
    VehicleStatus.IN_TRANSIT: {VehicleStatus.AVAILABLE, VehicleStatus.MAINTENANCE, VehicleStatus.OFFLINE},
    VehicleStatus.MAINTENANCE: {VehicleStatus.AVAILABLE, VehicleStatus.OFFLINE},
    VehicleStatus.OFFLINE: {VehicleStatus.AVAILABLE, VehicleStatus.MAINTENANCE},
}

ALLOWED_ROUTE_TRANSITIONS: dict[RouteStatus, set[RouteStatus]] = {
    RouteStatus.PLANNED: {RouteStatus.ACTIVE, RouteStatus.CANCELLED},
    RouteStatus.ACTIVE: {RouteStatus.COMPLETED, RouteStatus.CANCELLED},
    RouteStatus.COMPLETED: set(),  # Terminal state
    RouteStatus.CANCELLED: set(),  # Terminal state
}


def validate_order_transition(current: OrderStatus, target: OrderStatus) -> None:
    if current == target:
        return
    allowed = ALLOWED_ORDER_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise APIError(
            "INVALID_STATUS_TRANSITION",
            f"Invalid order status transition from {current.value} to {target.value}. Allowed: {[s.value for s in allowed]}",
            status_code=400,
        )


def validate_vehicle_transition(current: VehicleStatus, target: VehicleStatus) -> None:
    if current == target:
        return
    allowed = ALLOWED_VEHICLE_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise APIError(
            "INVALID_VEHICLE_STATUS_TRANSITION",
            f"Invalid vehicle status transition from {current.value} to {target.value}. Allowed: {[s.value for s in allowed]}",
            status_code=400,
        )


def validate_route_transition(current: RouteStatus, target: RouteStatus) -> None:
    if current == target:
        return
    allowed = ALLOWED_ROUTE_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise APIError(
            "INVALID_ROUTE_STATUS_TRANSITION",
            f"Invalid route status transition from {current.value} to {target.value}. Allowed: {[s.value for s in allowed]}",
            status_code=400,
        )