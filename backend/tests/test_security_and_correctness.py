"""Targeted security and correctness tests for RoutePilot API and services."""
from __future__ import annotations

import uuid
import pytest
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.depot import Depot
from app.models.enums import OptimizationStatus, OrderPriority, OrderStatus, RouteStatus, RouteStopStatus, UserRole, VehicleStatus
from app.models.optimization import OptimizationRun
from app.models.order import Order
from app.models.route import Route, RouteStop
from app.models.telemetry import DeliveryEvent
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.dashboard_service import get_summary
from app.services.optimization_service import accept_plan


@pytest.mark.asyncio
async def test_public_registration_forces_viewer_role():
    """Registering with role=ADMIN must be ignored and assigned VIEWER."""
    uid = uuid.uuid4().hex[:6]
    test_email = f"attacker_{uid}@evil.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/register",
            json={
                "name": "Security Attacker",
                "email": test_email,
                "password": "Password123!",
                "role": "ADMIN",  # Attempting privilege escalation
            },
        )
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["role"] == "VIEWER", f"Expected VIEWER role, got: {data['role']}"

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == test_email))).scalar_one()
        assert user.role == UserRole.VIEWER


@pytest.mark.asyncio
async def test_websocket_auth_helper_rejects_invalid_token():
    """get_ws_user rejects missing, invalid, or expired tokens."""
    from app.api.dependencies.auth import get_ws_user

    async with AsyncSessionLocal() as db:
        # None / empty token
        assert await get_ws_user(None, db) is None
        assert await get_ws_user("", db) is None
        assert await get_ws_user("invalid.jwt.token", db) is None

        # Token for non-existent user
        fake_token = create_access_token(999999, "VIEWER")
        assert await get_ws_user(fake_token, db) is None


@pytest.mark.asyncio
async def test_dashboard_delivered_today_uses_delivery_events():
    """Delivered Today metric must only count DeliveryEvent.DELIVERY_COMPLETED today."""
    async with AsyncSessionLocal() as db:
        summary_before = await get_summary(db, use_cache=False)
        delivered_before = summary_before["delivered_today"]

        # Ensure a route exists for FK
        route = (await db.execute(select(Route).limit(1))).scalar_one_or_none()
        if not route:
            depot = (await db.execute(select(Depot).limit(1))).scalar_one()
            route = Route(
                route_code=f"RT-METRIC-{uuid.uuid4().hex[:4].upper()}",
                depot_id=depot.id,
                status=RouteStatus.ACTIVE,
                total_distance_km=10.0,
                estimated_duration_minutes=20.0,
            )
            db.add(route)
            await db.commit()
            await db.refresh(route)

        # Create an order created today but NOT delivered
        order = Order(
            order_number=f"ORD-DELIV-{uuid.uuid4().hex[:6].upper()}",
            customer_name="Test Cust",
            delivery_address="123 Road",
            latitude=16.3,
            longitude=80.4,
            weight_kg=5.0,
            status=OrderStatus.PENDING,
            depot_id=route.depot_id,
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        # summary should not count this new order in delivered_today
        summary_after_create = await get_summary(db, use_cache=False)
        assert summary_after_create["delivered_today"] == delivered_before

        # Now add a DeliveryEvent
        event = DeliveryEvent(
            order_id=order.id,
            route_id=route.id,
            event_type="DELIVERY_COMPLETED",
            created_at=datetime.now(timezone.utc),
        )
        db.add(event)
        await db.commit()

        summary_after_event = await get_summary(db, use_cache=False)
        assert summary_after_event["delivered_today"] == delivered_before + 1


@pytest.mark.asyncio
async def test_accept_plan_double_call_idempotency_live_db():
    """Calling accept_plan twice for the same OptimizationRun on live DB returns existing routes without duplication."""
    uid = uuid.uuid4().hex[:4].upper()
    async with AsyncSessionLocal() as db:
        depot = (await db.execute(select(Depot).limit(1))).scalar_one_or_none()
        if not depot:
            depot = Depot(name="Test Idempotent Hub", address="Guntur", latitude=16.3, longitude=80.4)
            db.add(depot)
            await db.commit()
            await db.refresh(depot)

        # Create test vehicle with unique reg
        veh = Vehicle(
            registration_number=f"AP 16 ZZ {uid}",
            driver_name="Test Driver",
            capacity_kg=1000,
            status=VehicleStatus.AVAILABLE,
            home_depot_id=depot.id,
            current_latitude=depot.latitude,
            current_longitude=depot.longitude,
        )
        db.add(veh)
        await db.commit()
        await db.refresh(veh)

        # Create test order with unique order number
        order = Order(
            order_number=f"ORD-IDEMP-{uid}",
            customer_name="Idempotency Test",
            delivery_address="AP High Court",
            latitude=16.35,
            longitude=80.45,
            weight_kg=15.0,
            status=OrderStatus.PENDING,
            depot_id=depot.id,
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        run = OptimizationRun(
            status=OptimizationStatus.COMPLETED,
            algorithm="OR-TOOLS",
            depot_id=depot.id,
            orders_count=1,
            vehicles_count=1,
            assigned_count=1,
            unassigned_count=0,
            result_payload={
                "horizon": datetime.now(timezone.utc).isoformat(),
                "routes": [
                    {
                        "vehicle_id": veh.id,
                        "total_distance_km": 12.0,
                        "estimated_duration_minutes": 25.0,
                        "total_load_kg": 15.0,
                        "stops": [
                            {
                                "order_id": order.id,
                                "stop_sequence": 1,
                                "latitude": 16.35,
                                "longitude": 80.45,
                                "distance_from_previous_km": 6.0,
                                "load_kg": 15.0,
                                "eta_minutes_from_start": 12.0,
                            }
                        ],
                    }
                ],
                "unassigned": [],
                "comparison": {
                    "baseline": {"total_distance_km": 15, "vehicles_used": 1, "estimated_duration_minutes": 30, "assigned_orders": 1, "unassigned_orders": 0},
                    "optimized": {"total_distance_km": 12, "vehicles_used": 1, "estimated_duration_minutes": 25, "assigned_orders": 1, "unassigned_orders": 0},
                    "distance_reduction_pct": 20.0,
                    "time_reduction_pct": 16.7,
                    "vehicles_reduction_pct": 0,
                },
                "objective_value": 12.0,
                "execution_time_ms": 500,
                "matrix_source": "haversine",
            },
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        # Call 1: creates routes
        routes_first = await accept_plan(db, run.id)
        assert len(routes_first) == 1
        first_route_id = routes_first[0].id

        # Verify order is ASSIGNED and vehicle is ASSIGNED
        await db.refresh(order)
        await db.refresh(veh)
        assert order.status == OrderStatus.ASSIGNED
        assert veh.status == VehicleStatus.ASSIGNED

        # Call 2: idempotent return
        routes_second = await accept_plan(db, run.id)
        assert len(routes_second) == 1
        assert routes_second[0].id == first_route_id

        # Verify route count in DB did not duplicate
        all_routes = (
            await db.execute(select(Route).where(Route.optimization_run_id == run.id))
        ).scalars().all()
        assert len(all_routes) == 1


@pytest.mark.asyncio
async def test_regional_depot_routes_anchor_to_own_depot():
    """A route for a regional depot must reference its own depot_id."""
    uid = uuid.uuid4().hex[:4].upper()
    async with AsyncSessionLocal() as db:
        hyd_depot = Depot(
            name=f"Hyderabad Hub {uid}",
            address="HITEC City, Hyderabad",
            latitude=17.3850,
            longitude=78.4867,
        )
        db.add(hyd_depot)
        await db.commit()
        await db.refresh(hyd_depot)

        route = Route(
            route_code=f"RT-HYD-{uid}",
            depot_id=hyd_depot.id,
            status=RouteStatus.PLANNED,
            total_distance_km=45.0,
            estimated_duration_minutes=90.0,
        )
        db.add(route)
        await db.commit()
        await db.refresh(route)

        fetched = (await db.execute(select(Route).where(Route.id == route.id))).scalar_one()
        assert fetched.depot_id == hyd_depot.id
        assert fetched.depot_id != 1 or hyd_depot.id == 1


@pytest.mark.asyncio
async def test_websocket_connection_security():
    """Verify WS route rejects missing/invalid tokens and sends SNAPSHOT to valid tokens.

    Uses AsyncMock on the WebSocket directly — avoids the asyncio loop
    mismatch that occurs when TestClient opens its own anyio loop while asyncpg
    connections are bound to the pytest session loop.
    """
    from unittest.mock import AsyncMock, patch
    from fastapi import WebSocketDisconnect
    from app.api.routes.ws import fleet_ws
    from app.core.security import create_access_token
    from app.models.enums import UserRole

    # ---- 1. No token → close(1008) ----
    mock_ws_no_token = AsyncMock()
    mock_ws_no_token.query_params = {}
    await fleet_ws(mock_ws_no_token)
    mock_ws_no_token.close.assert_called_once_with(code=1008)

    # ---- 2. Invalid token → close(1008) ----
    mock_ws_bad_token = AsyncMock()
    mock_ws_bad_token.query_params = {"token": "not.a.real.token"}
    await fleet_ws(mock_ws_bad_token)
    mock_ws_bad_token.close.assert_called_once_with(code=1008)

    # ---- 3. Valid token → connected, SNAPSHOT sent ----
    token = create_access_token(1, UserRole.DISPATCHER.value)
    mock_ws_ok = AsyncMock()
    mock_ws_ok.query_params = {"token": token}
    # Disconnect cleanly after the first receive_text so the loop exits
    mock_ws_ok.receive_text.side_effect = WebSocketDisconnect(code=1000)

    with patch("app.websocket.manager.manager.connect", new_callable=AsyncMock) as mock_connect, \
         patch("app.websocket.manager.manager.disconnect", new_callable=AsyncMock) as mock_disconnect:
        await fleet_ws(mock_ws_ok)
        mock_connect.assert_called_once_with(mock_ws_ok)
        mock_ws_ok.send_json.assert_called_once()
        sent = mock_ws_ok.send_json.call_args[0][0]
        assert sent["type"] == "SNAPSHOT", f"Expected SNAPSHOT, got: {sent['type']}"
        assert "data" in sent
        mock_disconnect.assert_called_once_with(mock_ws_ok)

