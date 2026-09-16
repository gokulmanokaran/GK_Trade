"""
OptionPulse FastAPI Main Application.
Indian Stock-Options Market Analysis & Manual Trading Assistant Backend.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.database import init_db
from backend.routers.market import router as market_router, provider as market_provider
from backend.routers.options import router as options_router
from backend.routers.signals import router as signals_router
from backend.routers.trading import router as trading_router
from backend.routers.websocket_manager import manager as ws_manager
from monitoring.service import MarketMonitoringService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("optionpulse.main")

monitoring_service = MarketMonitoringService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing OptionPulse database and seeding default tables...")
    await init_db()
    logger.info("OptionPulse Database successfully initialized.")

    # Start persistent background market monitoring daemon and WebSocket tick broadcasting
    logger.info("Starting background MarketMonitoringService...")
    monitoring_task = asyncio.create_task(monitoring_service.start())
    tick_task = asyncio.create_task(periodic_tick_broadcast())
    yield
    logger.info("Shutting down background tasks...")
    await monitoring_service.stop()
    monitoring_task.cancel()
    tick_task.cancel()
    try:
        await asyncio.gather(monitoring_task, tick_task, return_exceptions=True)
    except asyncio.CancelledError:
        pass
    logger.info("OptionPulse backend shutting down.")


app = FastAPI(
    title="OptionPulse API",
    description="Indian Stock-Options Market Analysis and Manual Trading Assistant API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration allowing local Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(market_router)
app.include_router(options_router)
app.include_router(signals_router)
app.include_router(trading_router)


@app.get("/health")
@app.get("/api/system/status")
async def get_system_status():
    """System health check and market status endpoint."""
    status = market_provider.get_market_status()
    return {
        "status": "HEALTHY",
        "service": "OptionPulse API",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "market": status.model_dump(),
        "disclaimer": (
            "This application provides market analysis and decision-support information only. "
            "It does not provide guaranteed returns and does not execute trades. "
            "Trading derivatives involves substantial risk. Users are responsible for their own trading decisions."
        )
    }


@app.websocket("/ws/market/{symbol}")
async def websocket_market_feed(websocket: WebSocket, symbol: str):
    """
    WebSocket endpoint streaming live/near-live ticks, price updates,
    and market status to connected frontend clients.
    """
    sym = symbol.upper()
    await ws_manager.connect(websocket, sym)
    try:
        # Send initial quote immediately
        q = await market_provider.get_index_quote(sym)
        await websocket.send_json({
            "type": "INITIAL_QUOTE",
            "symbol": sym,
            "ltp": q.ltp,
            "change": q.change,
            "p_change": q.p_change,
            "vwap": q.vwap,
            "timestamp": q.timestamp,
            "data_source": q.data_source,
            "is_delayed": q.is_delayed
        })

        while True:
            # Client can ping or send requests
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong", "time": datetime.utcnow().isoformat()})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, sym)
    except Exception as e:
        logger.error(f"WebSocket error for {sym}: {e}")
        ws_manager.disconnect(websocket, sym)


async def periodic_tick_broadcast():
    """Periodically streams ticks to connected WebSocket clients every 3 seconds."""
    while True:
        try:
            await asyncio.sleep(3.0)
            symbols = list(ws_manager.active_connections.keys())
            for sym in symbols:
                if ws_manager.active_connections.get(sym):
                    q = await market_provider.get_index_quote(sym)
                    await ws_manager.broadcast_to_symbol(sym, {
                        "type": "TICK_UPDATE",
                        "symbol": sym,
                        "ltp": q.ltp,
                        "change": q.change,
                        "p_change": q.p_change,
                        "vwap": q.vwap,
                        "timestamp": q.timestamp,
                        "data_source": q.data_source,
                        "is_delayed": q.is_delayed
                    })
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug(f"Tick broadcast error: {e}")
