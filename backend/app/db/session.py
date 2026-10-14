from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import settings
from app.db.base import Base

engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    echo=settings.DB_ECHO,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    # Auto-create tables on startup (convenient for initial setup and prototyping)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed initial petrol pump data if empty
    from app.db.seed import seed_initial_data
    async with AsyncSessionLocal() as session:
        try:
            await seed_initial_data(session)
        except Exception as exc:
            print(f"Seed note: {exc}")
