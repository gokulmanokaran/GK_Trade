"""
Monitoring Market Session & Holiday Checker (IST = UTC+5:30).
"""

from datetime import datetime
import pytz
from backend.analysis_engine.market_holidays import get_market_session_ist, get_nse_holiday

IST = pytz.timezone("Asia/Kolkata")


class MarketSessionManager:
    @staticmethod
    def now_ist() -> datetime:
        return datetime.now(IST)

    @staticmethod
    def get_session_status() -> dict:
        return get_market_session_ist()

    @staticmethod
    def is_market_open() -> bool:
        session = get_market_session_ist()
        return session.get("is_open", False)

    @staticmethod
    def is_trading_day() -> bool:
        now = datetime.now(IST)
        if now.weekday() in (5, 6):
            return False
        is_holiday, _ = get_nse_holiday(now)
        return not is_holiday
