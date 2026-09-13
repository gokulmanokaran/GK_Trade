"""
OptionPulse Persistent Monitoring Service Main Entrypoint.
FastAPI wrapper running background market monitoring worker.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from monitoring.service import MarketMonitoringService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("optionpulse.monitoring.main")

monitoring_service = MarketMonitoringService()
background_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global background_task
    logger.info("Booting OptionPulse Persistent Monitoring Worker...")
    background_task = asyncio.create_task(monitoring_service.start())
    yield
    logger.info("Stopping OptionPulse Persistent Monitoring Worker...")
    await monitoring_service.stop()
    if background_task:
        background_task.cancel()
        try:
            await background_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="OptionPulse Persistent Monitoring Service",
    description="Dedicated real-time market data monitoring and deterministic signal processing daemon.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
@app.get("/api/monitor/status")
async def get_monitor_status():
    """Returns monitoring health, provider status, data age, and latency."""
    return monitoring_service.get_status()


@app.post("/api/monitor/trigger")
async def trigger_cycle(authorization: str = Header(None)):
    """
    Manual/Watchdog trigger endpoint.
    Protected by CRON_SECRET.
    """
    cron_secret = os.getenv("CRON_SECRET", "")
    if cron_secret and authorization != f"Bearer {cron_secret}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing CRON_SECRET")

    cycle_result = await monitoring_service.run_monitoring_cycle()
    return cycle_result


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run("monitoring.main:app", host="0.0.0.0", port=port, reload=False)
