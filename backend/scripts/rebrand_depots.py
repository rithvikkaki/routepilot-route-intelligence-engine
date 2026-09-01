import asyncio
from app.db.session import AsyncSessionLocal
from app.models.depot import Depot
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        depots = (await db.execute(select(Depot))).scalars().all()
        for d in depots:
            if "RouteOS" in d.name:
                d.name = d.name.replace("RouteOS", "RoutePilot")
        await db.commit()
        print(f"Updated {len(depots)} depots in database.")

if __name__ == "__main__":
    asyncio.run(main())
