"""
Database connection, session management, and table initializer.
Supports PostgreSQL (asyncpg) with automated fallback to SQLite (aiosqlite)
for zero-friction local development and testing.
"""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from backend.database.models import Base, MarketInstrument, Setting, User

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./optionpulse.db")

# Ensure PostgreSQL URLs use asyncpg driver if standard postgresql:// is provided
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables and seed initial instruments and default settings."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Seed default user if none exists
        existing_user = await session.get(User, 1)
        if not existing_user:
            user = User(
                id=1,
                username="trader",
                initial_capital=100000.0,
                current_capital=100000.0,
                max_risk_per_trade_pct=1.0
            )
            session.add(user)

        # Seed instruments: NIFTY, BANKNIFTY, FINNIFTY
        instruments = [
            {"symbol": "NIFTY", "name": "NIFTY 50", "segment": "INDEX", "lot_size": 25, "tick_size": 0.05, "strike_step": 50.0},
            {"symbol": "BANKNIFTY", "name": "NIFTY BANK", "segment": "INDEX", "lot_size": 15, "tick_size": 0.05, "strike_step": 100.0},
            {"symbol": "FINNIFTY", "name": "NIFTY FINANCIAL SERVICES", "segment": "INDEX", "lot_size": 25, "tick_size": 0.05, "strike_step": 50.0},
        ]
        for inst_data in instruments:
            from sqlalchemy import select
            stmt = select(MarketInstrument).where(MarketInstrument.symbol == inst_data["symbol"])
            res = await session.execute(stmt)
            if not res.scalar_one_or_none():
                inst = MarketInstrument(**inst_data)
                session.add(inst)

        # Seed default scoring weights and parameters
        default_settings = [
            ("min_signal_score", "70", "Minimum score required to issue a trading signal"),
            ("min_risk_reward", "1.5", "Minimum Risk to Reward ratio required"),
            ("risk_per_trade_pct", "1.0", "Maximum risk per trade percentage"),
            ("default_index", "NIFTY", "Default active index on dashboard"),
            ("default_timeframe", "5m", "Default chart timeframe"),
            ("data_refresh_interval_sec", "5", "Live data polling and evaluation interval in seconds"),
            ("weight_trend", "20", "Scoring weight for Trend"),
            ("weight_momentum", "15", "Scoring weight for Momentum"),
            ("weight_vwap", "10", "Scoring weight for VWAP"),
            ("weight_price_action", "15", "Scoring weight for Price Action"),
            ("weight_volume", "10", "Scoring weight for Volume"),
            ("weight_option_chain", "20", "Scoring weight for Option Chain & OI"),
            ("weight_volatility", "5", "Scoring weight for Volatility"),
            ("weight_risk_reward", "5", "Scoring weight for Risk/Reward"),
        ]
        for key, val, desc in default_settings:
            stmt = select(Setting).where(Setting.key == key)
            res = await session.execute(stmt)
            if not res.scalar_one_or_none():
                setting = Setting(key=key, value=val, description=desc)
                session.add(setting)

        await session.commit()
