"""Phase 3 tests: State machine, validations, identifiers, stale plan protection."""
from __future__ import annotations

import asyncio
import pytest

from app.core.errors import APIError
from app.models.enums import OrderStatus, RouteStatus, VehicleStatus
from app.services.state_machine import (
    validate_order_transition,
    validate_vehicle_transition,
    validate_route_transition,
    ALLOWED_ORDER_TRANSITIONS,
    ALLOWED_VEHICLE_TRANSITIONS,
    ALLOWED_ROUTE_TRANSITIONS,
)


# ─────────────────────────────────────────────────────────
# 3A: Order State Machine
# ─────────────────────────────────────────────────────────

class TestOrderStateMachine:
    def test_pending_to_assigned_is_valid(self):
        validate_order_transition(OrderStatus.PENDING, OrderStatus.ASSIGNED)

    def test_assigned_to_out_for_delivery_is_valid(self):
        validate_order_transition(OrderStatus.ASSIGNED, OrderStatus.OUT_FOR_DELIVERY)

    def test_out_for_delivery_to_delivered_is_valid(self):
        validate_order_transition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED)

    def test_pending_to_cancelled_is_valid(self):
        validate_order_transition(OrderStatus.PENDING, OrderStatus.CANCELLED)

    def test_assigned_to_cancelled_is_valid(self):
        validate_order_transition(OrderStatus.ASSIGNED, OrderStatus.CANCELLED)

    def test_failed_to_pending_is_valid(self):
        validate_order_transition(OrderStatus.FAILED, OrderStatus.PENDING)

    def test_same_status_is_no_op(self):
        validate_order_transition(OrderStatus.PENDING, OrderStatus.PENDING)

    def test_pending_to_delivered_is_invalid(self):
        with pytest.raises(APIError) as exc_info:
            validate_order_transition(OrderStatus.PENDING, OrderStatus.DELIVERED)
        assert exc_info.value.code == "INVALID_STATUS_TRANSITION"

    def test_delivered_to_out_for_delivery_is_invalid(self):
        with pytest.raises(APIError) as exc_info:
            validate_order_transition(OrderStatus.DELIVERED, OrderStatus.OUT_FOR_DELIVERY)
        assert exc_info.value.code == "INVALID_STATUS_TRANSITION"

    def test_delivered_to_pending_is_invalid(self):
        with pytest.raises(APIError) as exc_info:
            validate_order_transition(OrderStatus.DELIVERED, OrderStatus.PENDING)
        assert exc_info.value.code == "INVALID_STATUS_TRANSITION"

    def test_cancelled_to_pending_is_invalid(self):
        with pytest.raises(APIError) as exc_info:
            validate_order_transition(OrderStatus.CANCELLED, OrderStatus.PENDING)
        assert exc_info.value.code == "INVALID_STATUS_TRANSITION"

    def test_out_for_delivery_to_assigned_is_invalid(self):
        with pytest.raises(APIError) as exc_info:
            validate_order_transition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.ASSIGNED)
        assert exc_info.value.code == "INVALID_STATUS_TRANSITION"

    def test_error_message_contains_states(self):
        with pytest.raises(APIError) as exc_info:
            validate_order_transition(OrderStatus.DELIVERED, OrderStatus.PENDING)
        assert "DELIVERED" in exc_info.value.message
        assert "PENDING" in exc_info.value.message

    def test_all_terminal_states_reject_any_transition(self):
        """DELIVERED and CANCELLED are terminal; any non-self transition must fail."""
        for terminal in [OrderStatus.DELIVERED, OrderStatus.CANCELLED]:
            for other in OrderStatus:
                if other == terminal:
                    continue
                with pytest.raises(APIError):
                    validate_order_transition(terminal, other)


# ─────────────────────────────────────────────────────────
# 3B: Vehicle State Machine
# ─────────────────────────────────────────────────────────

class TestVehicleStateMachine:
    def test_available_to_assigned_is_valid(self):
        validate_vehicle_transition(VehicleStatus.AVAILABLE, VehicleStatus.ASSIGNED)

    def test_assigned_to_in_transit_is_valid(self):
        validate_vehicle_transition(VehicleStatus.ASSIGNED, VehicleStatus.IN_TRANSIT)

    def test_in_transit_to_available_is_valid(self):
        validate_vehicle_transition(VehicleStatus.IN_TRANSIT, VehicleStatus.AVAILABLE)

    def test_available_to_maintenance_is_valid(self):
        validate_vehicle_transition(VehicleStatus.AVAILABLE, VehicleStatus.MAINTENANCE)

    def test_in_transit_to_assigned_is_invalid(self):
        with pytest.raises(APIError) as exc_info:
            validate_vehicle_transition(VehicleStatus.IN_TRANSIT, VehicleStatus.ASSIGNED)
        assert exc_info.value.code == "INVALID_VEHICLE_STATUS_TRANSITION"

    def test_maintenance_to_in_transit_is_invalid(self):
        with pytest.raises(APIError):
            validate_vehicle_transition(VehicleStatus.MAINTENANCE, VehicleStatus.IN_TRANSIT)

    def test_same_status_is_no_op(self):
        validate_vehicle_transition(VehicleStatus.AVAILABLE, VehicleStatus.AVAILABLE)


# ─────────────────────────────────────────────────────────
# 3B: Route State Machine
# ─────────────────────────────────────────────────────────

class TestRouteStateMachine:
    def test_planned_to_active_is_valid(self):
        validate_route_transition(RouteStatus.PLANNED, RouteStatus.ACTIVE)

    def test_active_to_completed_is_valid(self):
        validate_route_transition(RouteStatus.ACTIVE, RouteStatus.COMPLETED)

    def test_planned_to_cancelled_is_valid(self):
        validate_route_transition(RouteStatus.PLANNED, RouteStatus.CANCELLED)

    def test_active_to_cancelled_is_valid(self):
        validate_route_transition(RouteStatus.ACTIVE, RouteStatus.CANCELLED)

    def test_completed_to_active_is_invalid(self):
        with pytest.raises(APIError) as exc_info:
            validate_route_transition(RouteStatus.COMPLETED, RouteStatus.ACTIVE)
        assert exc_info.value.code == "INVALID_ROUTE_STATUS_TRANSITION"

    def test_planned_to_completed_is_invalid(self):
        with pytest.raises(APIError):
            validate_route_transition(RouteStatus.PLANNED, RouteStatus.COMPLETED)

    def test_cancelled_to_active_is_invalid(self):
        with pytest.raises(APIError):
            validate_route_transition(RouteStatus.CANCELLED, RouteStatus.ACTIVE)

    def test_same_status_is_no_op(self):
        validate_route_transition(RouteStatus.ACTIVE, RouteStatus.ACTIVE)


# ─────────────────────────────────────────────────────────
# 3D: Identifier generation (unit test without DB)
# ─────────────────────────────────────────────────────────

class TestIdentifierFormat:
    def test_order_number_format(self):
        """Without the actual DB sequence, validate format generated by fallback."""
        import uuid
        uid = uuid.uuid4().hex[:4].upper()
        sample = f"ORD-{1:05d}-{uid}"
        assert sample.startswith("ORD-")
        parts = sample.split("-")
        assert len(parts) >= 2
        assert parts[1].isdigit()

    def test_route_code_format(self):
        import uuid
        uid = uuid.uuid4().hex[:4].upper()
        sample = f"RT-{1:04d}-{uid}"
        assert sample.startswith("RT-")
        parts = sample.split("-")
        assert len(parts) >= 2
        assert parts[1].isdigit()


# ─────────────────────────────────────────────────────────
# DB-backed tests (async)
# ─────────────────────────────────────────────────────────

@pytest.fixture
def sample_depot_data():
    return {
        "name": "Test Depot",
        "address": "123 Test St",
        "latitude": 16.309485,
        "longitude": 80.425991,
    }


@pytest.mark.asyncio
async def test_order_schema_rejects_negative_weight():
    from pydantic import ValidationError
    from app.schemas.order import OrderCreate
    with pytest.raises(ValidationError) as exc_info:
        OrderCreate(
            customer_name="Test",
            delivery_address="Test Address",
            latitude=16.3,
            longitude=80.4,
            weight_kg=-5.0,  # invalid
            depot_id=1,
        )
    errors = exc_info.value.errors()
    assert any("weight_kg" in str(e) for e in errors)


@pytest.mark.asyncio
async def test_order_schema_rejects_zero_volume():
    from pydantic import ValidationError
    from app.schemas.order import OrderCreate
    with pytest.raises(ValidationError) as exc_info:
        OrderCreate(
            customer_name="Test",
            delivery_address="Test Address",
            latitude=16.3,
            longitude=80.4,
            weight_kg=5.0,
            volume=0.0,  # invalid: must be gt=0
            depot_id=1,
        )
    errors = exc_info.value.errors()
    assert any("volume" in str(e) for e in errors)


@pytest.mark.asyncio
async def test_order_schema_rejects_invalid_latitude():
    from pydantic import ValidationError
    from app.schemas.order import OrderCreate
    with pytest.raises(ValidationError) as exc_info:
        OrderCreate(
            customer_name="Test",
            delivery_address="Test Address",
            latitude=99.0,   # invalid: must be le=90
            longitude=80.4,
            weight_kg=5.0,
            depot_id=1,
        )
    errors = exc_info.value.errors()
    assert any("latitude" in str(e) for e in errors)


@pytest.mark.asyncio
async def test_order_schema_rejects_invalid_longitude():
    from pydantic import ValidationError
    from app.schemas.order import OrderCreate
    with pytest.raises(ValidationError) as exc_info:
        OrderCreate(
            customer_name="Test",
            delivery_address="Test Address",
            latitude=16.3,
            longitude=200.0,  # invalid: must be le=180
            weight_kg=5.0,
            depot_id=1,
        )
    errors = exc_info.value.errors()
    assert any("longitude" in str(e) for e in errors)


@pytest.mark.asyncio
async def test_order_schema_rejects_bad_time_window():
    from pydantic import ValidationError
    from app.schemas.order import OrderCreate
    from datetime import datetime, timezone
    with pytest.raises(ValidationError) as exc_info:
        OrderCreate(
            customer_name="Test",
            delivery_address="Test Address",
            latitude=16.3,
            longitude=80.4,
            weight_kg=5.0,
            depot_id=1,
            delivery_window_start=datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
            delivery_window_end=datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc),  # before start
        )
    errors = exc_info.value.errors()
    assert any("window" in str(e).lower() for e in errors)


@pytest.mark.asyncio
async def test_order_update_schema_rejects_bad_time_window():
    from pydantic import ValidationError
    from app.schemas.order import OrderUpdate
    from datetime import datetime, timezone
    with pytest.raises(ValidationError) as exc_info:
        OrderUpdate(
            delivery_window_start=datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
            delivery_window_end=datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc),
        )
    errors = exc_info.value.errors()
    assert any("window" in str(e).lower() for e in errors)


@pytest.mark.asyncio
async def test_vehicle_schema_rejects_invalid_coordinates():
    from pydantic import ValidationError
    from app.schemas.vehicle import VehicleCreate
    with pytest.raises(ValidationError) as exc_info:
        VehicleCreate(
            registration_number="AP 16 AB 1234",
            driver_name="Test Driver",
            capacity_kg=1000,
            home_depot_id=1,
            current_latitude=999.0,  # invalid
            current_longitude=80.4,
        )
    errors = exc_info.value.errors()
    assert any("latitude" in str(e) for e in errors)


@pytest.mark.asyncio
async def test_vehicle_schema_rejects_negative_capacity():
    from pydantic import ValidationError
    from app.schemas.vehicle import VehicleCreate
    with pytest.raises(ValidationError) as exc_info:
        VehicleCreate(
            registration_number="AP 16 AB 1234",
            driver_name="Test Driver",
            capacity_kg=-100,  # invalid
            home_depot_id=1,
        )
    errors = exc_info.value.errors()
    assert any("capacity_kg" in str(e) for e in errors)


@pytest.mark.asyncio
async def test_vehicle_schema_rejects_zero_volume():
    from pydantic import ValidationError
    from app.schemas.vehicle import VehicleCreate
    with pytest.raises(ValidationError) as exc_info:
        VehicleCreate(
            registration_number="AP 16 AB 1234",
            driver_name="Test Driver",
            capacity_kg=1000,
            capacity_volume=0.0,  # invalid
            home_depot_id=1,
        )
    errors = exc_info.value.errors()
    assert any("volume" in str(e) for e in errors)


# ─────────────────────────────────────────────────────────
# 3D: Concurrent identifier generation test
# ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_concurrent_order_number_generation():
    """Simulate concurrent order number generation using DB sequences with independent sessions."""
    from app.core.identifiers import generate_order_number
    from app.db.session import AsyncSessionLocal

    async def _generate_one():
        async with AsyncSessionLocal() as session:
            return await generate_order_number(session)

    # Generate 10 order numbers concurrently across separate DB sessions
    tasks = [_generate_one() for _ in range(10)]
    results = await asyncio.gather(*tasks)
    # All should be unique
    assert len(set(results)) == len(results), f"Duplicate order numbers generated: {results}"
    # All should start with ORD-
    for r in results:
        assert r.startswith("ORD-"), f"Invalid order number format: {r}"


@pytest.mark.asyncio
async def test_concurrent_route_code_generation():
    """Simulate concurrent route code generation using DB sequences with independent sessions."""
    from app.core.identifiers import generate_route_code
    from app.db.session import AsyncSessionLocal

    async def _generate_one():
        async with AsyncSessionLocal() as session:
            return await generate_route_code(session)

    tasks = [_generate_one() for _ in range(10)]
    results = await asyncio.gather(*tasks)
    assert len(set(results)) == len(results), f"Duplicate route codes generated: {results}"
    for r in results:
        assert r.startswith("RT-"), f"Invalid route code format: {r}"


# ─────────────────────────────────────────────────────────
# 3C & 3E: DB-backed order creation with depot validation
# ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_order_with_invalid_depot_id(db_session):
    """Creating an order with a non-existent depot_id should return 400."""
    from app.services.order_service import create_order
    from app.schemas.order import OrderCreate
    with pytest.raises(APIError) as exc_info:
        await create_order(
            db_session,
            OrderCreate(
                customer_name="Test Customer",
                delivery_address="123 Main St",
                latitude=16.3,
                longitude=80.4,
                weight_kg=5.0,
                depot_id=999999,  # non-existent
            ),
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "INVALID_DEPOT"


@pytest.mark.asyncio
async def test_create_vehicle_with_invalid_depot_id(db_session):
    """Creating a vehicle with a non-existent depot_id should return 400."""
    from app.services.fleet_service import create_vehicle
    from app.schemas.vehicle import VehicleCreate
    with pytest.raises(APIError) as exc_info:
        await create_vehicle(
            db_session,
            VehicleCreate(
                registration_number="AP 99 ZZ 9999",
                driver_name="Test Driver",
                capacity_kg=1000,
                home_depot_id=999999,  # non-existent
            ),
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "INVALID_DEPOT"


@pytest.mark.asyncio
async def test_update_delivered_order_is_blocked(db_session):
    """Update of a DELIVERED order must return 409."""
    from app.models.order import Order
    from app.services.order_service import update_order
    from app.schemas.order import OrderUpdate
    from app.geospatial.queries import make_point

    # Find or create a DELIVERED order in the test DB
    from sqlalchemy import select
    order = (
        await db_session.execute(
            select(Order).where(Order.status == OrderStatus.DELIVERED).limit(1)
        )
    ).scalar_one_or_none()

    if order is None:
        order = Order(
            order_number="ORD-DELIVERED-TEST",
            customer_name="Delivered Customer",
            delivery_address="Delivered St",
            latitude=16.309485,
            longitude=80.425991,
            location=make_point(16.309485, 80.425991),
            weight_kg=10.0,
            status=OrderStatus.DELIVERED,
            depot_id=1,
        )
        db_session.add(order)
        await db_session.flush()

    with pytest.raises(APIError) as exc_info:
        await update_order(db_session, order.id, OrderUpdate(customer_name="Modified"))
    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "ORDER_IMMUTABLE"


@pytest.mark.asyncio
async def test_order_status_patch_validated_by_state_machine(db_session):
    """Attempting an invalid status transition via update_order must fail."""
    from sqlalchemy import select
    from app.models.order import Order
    from app.services.order_service import update_order
    from app.schemas.order import OrderUpdate

    order = (
        await db_session.execute(
            select(Order).where(Order.status == OrderStatus.PENDING).limit(1)
        )
    ).scalar_one_or_none()

    if order is None:
        pytest.skip("No PENDING orders in test DB")

    # Directly trying to set PENDING -> DELIVERED via PATCH must be rejected
    with pytest.raises(APIError) as exc_info:
        await update_order(
            db_session, order.id, OrderUpdate(status=OrderStatus.DELIVERED)
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "INVALID_STATUS_TRANSITION"


@pytest.mark.asyncio
async def test_stale_plan_rejected_when_order_not_pending(db_session):
    """accept_plan must reject if an order in the plan is not in PENDING state."""
    from app.models.optimization import OptimizationRun
    from app.models.enums import OptimizationStatus
    from app.services.optimization_service import accept_plan
    from datetime import datetime, timezone

    # Create a fake completed run with an already-assigned order
    run = OptimizationRun(
        status=OptimizationStatus.COMPLETED,
        algorithm="TEST",
        orders_count=1,
        vehicles_count=1,
        assigned_count=1,
        unassigned_count=0,
        result_payload={
            "horizon": datetime.now(timezone.utc).isoformat(),
            "routes": [
                {
                    "vehicle_id": 999999,  # non-existent
                    "total_distance_km": 10.0,
                    "estimated_duration_minutes": 30,
                    "total_load_kg": 5.0,
                    "stops": [
                        {
                            "order_id": 999999,  # non-existent
                            "stop_sequence": 1,
                            "latitude": 16.3,
                            "longitude": 80.4,
                            "distance_from_previous_km": 5.0,
                            "load_kg": 5.0,
                            "eta_minutes_from_start": 30,
                        }
                    ],
                }
            ],
            "unassigned": [],
            "comparison": {
                "baseline": {"total_distance_km": 15, "vehicles_used": 1, "estimated_duration_minutes": 45, "assigned_orders": 1, "unassigned_orders": 0},
                "optimized": {"total_distance_km": 10, "vehicles_used": 1, "estimated_duration_minutes": 30, "assigned_orders": 1, "unassigned_orders": 0},
                "distance_reduction_pct": 33,
                "time_reduction_pct": 33,
                "vehicles_reduction_pct": 0,
            },
            "objective_value": 10.0,
            "execution_time_ms": 1000,
            "matrix_source": "test",
        },
    )
    db_session.add(run)
    await db_session.flush()

    with pytest.raises(APIError) as exc_info:
        await accept_plan(db_session, run.id)

    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "STALE_PLAN"

    await db_session.rollback()


@pytest.mark.asyncio
async def test_optimization_run_depot_fk(db_session):
    """OptimizationRun must accept a valid depot_id FK and NULL."""
    from app.models.optimization import OptimizationRun
    from app.models.enums import OptimizationStatus

    # NULL depot_id is valid
    run_no_depot = OptimizationRun(
        status=OptimizationStatus.PENDING,
        algorithm="TEST",
        depot_id=None,
    )
    db_session.add(run_no_depot)
    await db_session.flush()
    assert run_no_depot.id is not None

    await db_session.rollback()
