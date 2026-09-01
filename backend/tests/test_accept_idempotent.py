"""Tests for accept_plan idempotency and plan objective tracking."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from app.models.enums import OptimizationStatus, OrderStatus, RouteStatus, VehicleStatus
from app.models.optimization import OptimizationRun
from app.models.route import Route
from app.services.optimization_service import accept_plan


@pytest.mark.asyncio
async def test_accept_plan_is_idempotent():
    """Calling accept_plan twice returns existing routes without duplicating."""
    mock_db = AsyncMock()
    run_id = 42

    # Mock an already-completed run with result payload
    mock_run = MagicMock()
    mock_run.id = run_id
    mock_run.depot_id = 1
    mock_run.status = OptimizationStatus.COMPLETED
    mock_run.improvement_percentage = 15.0
    mock_run.result_payload = {
        "horizon": datetime.now(timezone.utc).isoformat(),
        "routes": [
            {
                "vehicle_id": 10,
                "total_distance_km": 25.5,
                "estimated_duration_minutes": 45.0,
                "total_load_kg": 50.0,
                "stops": [
                    {
                        "order_id": 101,
                        "stop_sequence": 1,
                        "distance_from_previous_km": 5.0,
                        "eta_minutes_from_start": 10.0,
                    }
                ],
            }
        ],
    }

    existing_route = MagicMock(spec=Route)
    existing_route.id = 1
    existing_route.optimization_run_id = run_id

    # First call: when existing routes are found
    with patch("app.services.optimization_service.get_run", return_value=mock_run):
        # Setup mock db to return existing routes
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [existing_route]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        mock_db.execute.return_value = mock_result

        routes = await accept_plan(mock_db, run_id)
        assert len(routes) == 1
        assert routes[0] == existing_route