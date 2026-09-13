import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.database import init_db


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    await init_db()


@pytest.mark.asyncio
async def test_api_system_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/system/status")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "HEALTHY"
        assert "disclaimer" in data
        assert "market" in data


@pytest.mark.asyncio
async def test_api_market_indices():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/market/indices")
        assert res.status_code == 200
        data = res.json()
        assert "indices" in data
        assert len(data["indices"]) == 3
        nifty = next((i for i in data["indices"] if i["symbol"] == "NIFTY"), None)
        assert nifty is not None
        assert nifty["ltp"] > 0


@pytest.mark.asyncio
async def test_api_options_chain():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/options/chain/NIFTY")
        assert res.status_code == 200
        data = res.json()
        assert data["symbol"] == "NIFTY"
        assert len(data["strikes"]) > 0
        assert data["pcr"] > 0
        first_strike = data["strikes"][0]
        assert "ce" in first_strike and "pe" in first_strike
        assert "greeks" in first_strike["ce"]


@pytest.mark.asyncio
async def test_api_signals_latest():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/signals/latest?symbol=NIFTY")
        assert res.status_code == 200
        data = res.json()
        assert "trade" in data
        assert "score_breakdown" in data
        assert "ai_explanation" in data
        trade = data["trade"]
        assert trade["signal"] in ["CALL BUY", "PUT BUY", "NO TRADE"]
        assert 0 <= trade["signal_score"] <= 100


@pytest.mark.asyncio
async def test_api_trading_and_paper_trade():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        trade_payload = {
            "symbol": "NIFTY",
            "instrument": "NIFTY 25400 CE",
            "direction": "BUY",
            "entry_price": 185.0,
            "quantity": 50,
            "lots": 2,
            "stop_loss": 145.0,
            "target_1": 225.0,
            "target_2": 270.0
        }
        res = await client.post("/api/paper-trade", json=trade_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        trade_id = data["trade_id"]

        # Check paper trades list
        list_res = await client.get("/api/paper-trades")
        assert list_res.status_code == 200
        trades_data = list_res.json()
        assert trades_data["open_positions"] >= 1

        # Close trade
        close_res = await client.post(f"/api/paper-trades/{trade_id}/close", json={"exit_price": 230.0})
        assert close_res.status_code == 200
        assert close_res.json()["status"] == "success"


@pytest.mark.asyncio
async def test_api_backtest():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "symbol": "NIFTY",
            "timeframe": "5m",
            "min_score": 70.0,
            "target_multiplier": 1.5,
            "sl_multiplier": 1.0
        }
        res = await client.post("/api/backtest", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "win_rate" in data["summary"]
        assert "equity_curve" in data["summary"]
