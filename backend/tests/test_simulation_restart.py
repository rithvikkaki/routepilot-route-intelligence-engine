"""Tests for simulation stop/start and route resumption."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from app.models.enums import OrderStatus, RouteStatus, RouteStopStatus, VehicleStatus
from app.simulation.engine import SimulationEngine, Waypoint, VehicleSim


@pytest.mark.asyncio
async def test_simulation_start_stop_clears_vehicles():
    engine = SimulationEngine()
    engine._vehicles[1] = VehicleSim(
        route_id=1,
        vehicle_id=1,
        route_code="RT-0001",
        waypoints=[Waypoint(16.3, 80.4, None, None)],
    )
    engine.running = True

    with patch("app.websocket.manager.manager.broadcast", new_callable=AsyncMock):
        await engine.stop()
        assert not engine.running
        assert len(engine._vehicles) == 0


@pytest.mark.asyncio
async def test_build_sim_filters_completed_stops():
    """When resuming a route, completed stops must not be in waypoints."""
    engine = SimulationEngine()
    mock_db = AsyncMock()

    mock_depot = MagicMock()
    mock_depot.latitude = 16.309485
    mock_depot.longitude = 80.425991

    # Stop 1 is COMPLETED, Stop 2 is PENDING
    stop1 = MagicMock()
    stop1.id = 1
    stop1.order_id = 101
    stop1.stop_sequence = 1
    stop1.status = RouteStopStatus.COMPLETED
    stop1.latitude = 16.35
    stop1.longitude = 80.45

    stop2 = MagicMock()
    stop2.id = 2
    stop2.order_id = 102
    stop2.stop_sequence = 2
    stop2.status = RouteStopStatus.PENDING
    stop2.latitude = 16.40
    stop2.longitude = 80.50

    mock_route = MagicMock()
    mock_route.id = 1
    mock_route.vehicle_id = 10
    mock_route.route_code = "RT-0001"
    mock_route.depot = mock_depot
    mock_route.stops = [stop1, stop2]

    mock_vehicle = MagicMock()
    mock_vehicle.id = 10
    mock_vehicle.current_latitude = 16.35
    mock_vehicle.current_longitude = 80.45

    # Mock DB query results: first for route, second for vehicle
    mock_db_res1 = MagicMock()
    mock_db_res1.scalar_one_or_none.return_value = mock_route
    mock_db_res2 = MagicMock()
    mock_db_res2.scalar_one_or_none.return_value = mock_vehicle

    mock_db.execute.side_effect = [mock_db_res1, mock_db_res2]

    sim = await engine._build_sim(mock_db, route_id=1, only_remaining=True)
    assert sim is not None
    # Waypoints should be: [vehicle_current_pos, stop2, depot]
    # Total 3 waypoints, stop1 must be excluded
    assert len(sim.waypoints) == 3
    assert sim.waypoints[0].latitude == 16.35
    assert sim.waypoints[0].longitude == 80.45
    assert sim.waypoints[1].stop_id == 2
    assert sim.waypoints[1].order_id == 102
    assert sim.waypoints[2].order_id is None  # return to depot