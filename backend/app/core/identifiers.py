"""Concurrency-safe sequence-based identifier generation for orders and routes."""
from __future__ import annotations

import uuid
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession


async def generate_order_number(db: AsyncSession) -> str:
    """Generate a unique concurrency-safe order number."""
    try:
        val = (await db.execute(text("SELECT nextval('order_number_seq')"))).scalar_one()
        return f"ORD-{int(val):05d}"
    except Exception:
        from app.models.order import Order
        max_id = (await db.execute(select(func.coalesce(func.max(Order.id), 0)))).scalar_one()
        uid = uuid.uuid4().hex[:4].upper()
        return f"ORD-{int(max_id) + 1:05d}-{uid}"


async def generate_route_code(db: AsyncSession) -> str:
    """Generate a unique concurrency-safe route code."""
    try:
        val = (await db.execute(text("SELECT nextval('route_code_seq')"))).scalar_one()
        return f"RT-{int(val):04d}"
    except Exception:
        from app.models.route import Route
        max_id = (await db.execute(select(func.coalesce(func.max(Route.id), 0)))).scalar_one()
        uid = uuid.uuid4().hex[:4].upper()
        return f"RT-{int(max_id) + 1:04d}-{uid}"