from __future__ import annotations

import asyncio
import os

import pytest

# Make sure test environment has DB settings
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://routeos:routeos_dev_password@localhost:5432/routeos")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql+psycopg://routeos:routeos_dev_password@localhost:5432/routeos")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def db_session():
    """Provide a real async DB session that rolls back after each test."""
    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        async with session.begin():
            yield session
            await session.rollback()
