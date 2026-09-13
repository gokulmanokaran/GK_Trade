"""
WebSocket Connection Manager for OptionPulse.
Maintains active client connections per symbol and broadcasts live market ticks and signal updates.
"""

from typing import Dict, List
from fastapi import WebSocket
import logging

logger = logging.getLogger("optionpulse.websocket")


class ConnectionManager:
    def __init__(self):
        # symbol -> list of active websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, symbol: str):
        await websocket.accept()
        sym = symbol.upper()
        if sym not in self.active_connections:
            self.active_connections[sym] = []
        self.active_connections[sym].append(websocket)
        logger.info(f"WebSocket client connected to {sym}. Total: {len(self.active_connections[sym])}")

    def disconnect(self, websocket: WebSocket, symbol: str):
        sym = symbol.upper()
        if sym in self.active_connections and websocket in self.active_connections[sym]:
            self.active_connections[sym].remove(websocket)
            logger.info(f"WebSocket client disconnected from {sym}. Remaining: {len(self.active_connections[sym])}")

    async def broadcast_to_symbol(self, symbol: str, message: dict):
        sym = symbol.upper()
        if sym in self.active_connections:
            disconnected = []
            for ws in self.active_connections[sym]:
                try:
                    await ws.send_json(message)
                except Exception:
                    disconnected.append(ws)
            for ws in disconnected:
                self.disconnect(ws, sym)


manager = ConnectionManager()
