"""
NSE Indian Stock Market Holidays Calendar (2024 - 2026).
Covers Equities & F&O (Derivatives) Segment.
"""

from datetime import datetime, date
import pytz

IST = pytz.timezone("Asia/Kolkata")

NSE_HOLIDAYS = {
    # 2024
    "2024-01-22": "Special Holiday (Ayodhya Pran Pratishtha)",
    "2024-01-26": "Republic Day",
    "2024-03-08": "Mahashivratri",
    "2024-03-25": "Holi",
    "2024-03-29": "Good Friday",
    "2024-04-11": "Id-Ul-Fitr (Ramzan Id)",
    "2024-04-17": "Ram Navami",
    "2024-05-01": "Maharashtra Day",
    "2024-05-20": "General Parliamentary Elections (Mumbai)",
    "2024-06-17": "Bakri Id / Eid-ul-Adha",
    "2024-07-17": "Muharram",
    "2024-08-15": "Independence Day",
    "2024-10-02": "Mahatma Gandhi Jayanti",
    "2024-11-01": "Diwali (Laxmi Pujan)*",
    "2024-11-15": "Guru Nanak Jayanti",
    "2024-11-20": "Maharashtra Assembly Elections",
    "2024-12-25": "Christmas",

    # 2025
    "2025-01-26": "Republic Day",
    "2025-02-26": "Mahashivratri",
    "2025-03-14": "Holi",
    "2025-03-31": "Id-Ul-Fitr",
    "2025-04-10": "Mahavir Jayanti",
    "2025-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2025-04-18": "Good Friday",
    "2025-05-01": "Maharashtra Day",
    "2025-06-07": "Bakri Id",
    "2025-08-15": "Independence Day",
    "2025-08-27": "Ganesh Chaturthi",
    "2025-10-02": "Mahatma Gandhi Jayanti",
    "2025-10-21": "Diwali Balipratipada",
    "2025-11-05": "Guru Nanak Jayanti",
    "2025-12-25": "Christmas",

    # 2026
    "2026-01-26": "Republic Day",
    "2026-03-03": "Holi",
    "2026-03-17": "Mahashivratri",
    "2026-03-20": "Id-Ul-Fitr",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-27": "Bakri Id",
    "2026-06-25": "Muharram",
    "2026-08-15": "Independence Day",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-08": "Diwali (Laxmi Pujan)",
    "2026-11-09": "Diwali Balipratipada",
    "2026-11-24": "Guru Nanak Jayanti",
    "2026-12-25": "Christmas",
}


def get_nse_holiday(dt: datetime = None) -> tuple[bool, str | None]:
    """Returns (is_holiday, holiday_name) for a given datetime or current time in IST."""
    if dt is None:
        dt = datetime.now(IST)
    elif dt.tzinfo is None:
        dt = IST.localize(dt)
    else:
        dt = dt.astimezone(IST)

    date_str = dt.strftime("%Y-%m-%d")
    holiday_name = NSE_HOLIDAYS.get(date_str)
    return (holiday_name is not None, holiday_name)


def get_market_session_ist(dt: datetime = None) -> dict:
    """Returns detailed market session dict in IST."""
    if dt is None:
        dt = datetime.now(IST)
    elif dt.tzinfo is None:
        dt = IST.localize(dt)
    else:
        dt = dt.astimezone(IST)

    weekday = dt.weekday()  # 0=Mon, 5=Sat, 6=Sun
    if weekday in (5, 6):
        return {
            "is_open": False,
            "session": "CLOSED_WEEKEND",
            "reason": "Weekend",
            "timestamp": dt.isoformat(),
        }

    is_holiday, holiday_name = get_nse_holiday(dt)
    if is_holiday:
        return {
            "is_open": False,
            "session": "CLOSED_HOLIDAY",
            "reason": f"NSE Holiday: {holiday_name}",
            "holiday_name": holiday_name,
            "timestamp": dt.isoformat(),
        }

    total_minutes = dt.hour * 60 + dt.minute

    # Pre-open: 09:00 - 09:15 IST
    if 540 <= total_minutes < 555:
        return {
            "is_open": False,
            "session": "PRE_OPEN",
            "reason": "Pre-open session (09:00-09:15 IST)",
            "timestamp": dt.isoformat(),
        }

    # Regular session: 09:15 - 15:30 IST
    if 555 <= total_minutes < 930:
        return {
            "is_open": True,
            "session": "OPEN",
            "reason": "Regular market session",
            "timestamp": dt.isoformat(),
        }

    # Post close: after 15:30 IST or before 09:00
    return {
        "is_open": False,
        "session": "POST_CLOSE",
        "reason": "Outside trading hours (09:15-15:30 IST)",
        "timestamp": dt.isoformat(),
    }
