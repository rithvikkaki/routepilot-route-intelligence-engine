import asyncio
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.enums import UserRole
from app.models.user import User
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        accounts = [
            ("admin@routepilot.dev", "Ava Admin", "admin12345", UserRole.ADMIN),
            ("dispatcher@routepilot.dev", "Dev Dispatcher", "dispatch12345", UserRole.DISPATCHER),
            ("viewer@routepilot.dev", "Vic Viewer", "viewer12345", UserRole.VIEWER),
            ("admin@routeos.dev", "Ava Admin", "admin12345", UserRole.ADMIN),
            ("dispatcher@routeos.dev", "Dev Dispatcher", "dispatch12345", UserRole.DISPATCHER),
            ("viewer@routeos.dev", "Vic Viewer", "viewer12345", UserRole.VIEWER),
        ]
        added = 0
        for email, name, pw, role in accounts:
            exists = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if not exists:
                db.add(User(name=name, email=email, password_hash=hash_password(pw), role=role))
                added += 1
        await db.commit()
        print(f"Provisioned {added} users; all RoutePilot & legacy accounts verified.")

if __name__ == "__main__":
    asyncio.run(main())
