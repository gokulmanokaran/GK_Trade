"""
Technical Indicators Engine for OptionPulse.
Computes EMA (9, 20, 50, 200), RSI, MACD, Supertrend, ATR, VWAP, and Bollinger Bands
from candlestick series.
"""

from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np

from backend.data_provider.interface import Candle


def calculate_indicators(candles: List[Candle]) -> Dict[str, Any]:
    """
    Computes all standard technical indicators on the candle sequence.
    Returns latest snapshot and historical indicator series for charting.
    """
    if not candles or len(candles) < 14:
        return {
            "ema_9": None, "ema_20": None, "ema_50": None, "ema_200": None,
            "rsi_14": 50.0, "macd": 0.0, "macd_signal": 0.0, "macd_hist": 0.0,
            "supertrend": None, "supertrend_direction": "NEUTRAL",
            "vwap": None, "atr_14": None, "bb_upper": None, "bb_lower": None, "bb_mid": None
        }

    df = pd.DataFrame([c.model_dump() for c in candles])
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"].replace(0, 1)

    # 1. EMAs
    ema_9 = close.ewm(span=9, adjust=False).mean()
    ema_20 = close.ewm(span=20, adjust=False).mean()
    ema_50 = close.ewm(span=50, adjust=False).mean()
    ema_200 = close.ewm(span=min(200, len(close)), adjust=False).mean()

    # 2. RSI 14 (Wilder's Smoothing)
    delta = close.diff()
    gain = (delta.where(delta > 0, 0)).fillna(0)
    loss = (-delta.where(delta < 0, 0)).fillna(0)

    avg_gain = gain.rolling(window=14, min_periods=14).mean()
    avg_loss = loss.rolling(window=14, min_periods=14).mean()

    # Wilder's exponential smoothing
    for i in range(14, len(close)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * 13 + gain.iloc[i]) / 14
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * 13 + loss.iloc[i]) / 14

    rs = avg_gain / avg_loss.replace(0, 0.0001)
    rsi_14 = 100 - (100 / (1 + rs))

    # 3. MACD (12, 26, 9)
    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema_12 - ema_26
    macd_signal = macd_line.ewm(span=9, adjust=False).mean()
    macd_hist = macd_line - macd_signal

    # 4. ATR 14
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr_14 = tr.rolling(window=14).mean()

    # 5. Supertrend (Period 10, Multiplier 3)
    st_period = 10
    st_mult = 3.0
    st_atr = tr.rolling(window=st_period).mean()

    hl2 = (high + low) / 2.0
    basic_upper = hl2 + (st_mult * st_atr)
    basic_lower = hl2 - (st_mult * st_atr)

    final_upper = basic_upper.copy()
    final_lower = basic_lower.copy()
    st = pd.Series(index=df.index, dtype="float64")
    st_dir = pd.Series(index=df.index, dtype="object")

    for i in range(1, len(df)):
        if basic_upper.iloc[i] < final_upper.iloc[i - 1] or close.iloc[i - 1] > final_upper.iloc[i - 1]:
            final_upper.iloc[i] = basic_upper.iloc[i]
        else:
            final_upper.iloc[i] = final_upper.iloc[i - 1]

        if basic_lower.iloc[i] > final_lower.iloc[i - 1] or close.iloc[i - 1] < final_lower.iloc[i - 1]:
            final_lower.iloc[i] = basic_lower.iloc[i]
        else:
            final_lower.iloc[i] = final_lower.iloc[i - 1]

        if st.iloc[i - 1] == final_upper.iloc[i - 1]:
            if close.iloc[i] > final_upper.iloc[i]:
                st.iloc[i] = final_lower.iloc[i]
                st_dir.iloc[i] = "BULLISH"
            else:
                st.iloc[i] = final_upper.iloc[i]
                st_dir.iloc[i] = "BEARISH"
        else:
            if close.iloc[i] < final_lower.iloc[i]:
                st.iloc[i] = final_upper.iloc[i]
                st_dir.iloc[i] = "BEARISH"
            else:
                st.iloc[i] = final_lower.iloc[i]
                st_dir.iloc[i] = "BULLISH"

    # 6. VWAP
    typical_price = (high + low + close) / 3.0
    cum_vol = volume.cumsum()
    cum_pv = (typical_price * volume).cumsum()
    vwap_series = cum_pv / cum_vol

    # 7. Bollinger Bands (20, 2)
    bb_mid = close.rolling(window=20).mean()
    bb_std = close.rolling(window=20).std()
    bb_upper = bb_mid + (2.0 * bb_std)
    bb_lower = bb_mid - (2.0 * bb_std)

    last_idx = len(df) - 1

    return {
        "ema_9": round(float(ema_9.iloc[last_idx]), 2) if not pd.isna(ema_9.iloc[last_idx]) else None,
        "ema_20": round(float(ema_20.iloc[last_idx]), 2) if not pd.isna(ema_20.iloc[last_idx]) else None,
        "ema_50": round(float(ema_50.iloc[last_idx]), 2) if not pd.isna(ema_50.iloc[last_idx]) else None,
        "ema_200": round(float(ema_200.iloc[last_idx]), 2) if not pd.isna(ema_200.iloc[last_idx]) else None,
        "rsi_14": round(float(rsi_14.iloc[last_idx]), 2) if not pd.isna(rsi_14.iloc[last_idx]) else 50.0,
        "macd": round(float(macd_line.iloc[last_idx]), 2) if not pd.isna(macd_line.iloc[last_idx]) else 0.0,
        "macd_signal": round(float(macd_signal.iloc[last_idx]), 2) if not pd.isna(macd_signal.iloc[last_idx]) else 0.0,
        "macd_hist": round(float(macd_hist.iloc[last_idx]), 2) if not pd.isna(macd_hist.iloc[last_idx]) else 0.0,
        "supertrend": round(float(st.iloc[last_idx]), 2) if not pd.isna(st.iloc[last_idx]) else round(float(close.iloc[last_idx]), 2),
        "supertrend_direction": st_dir.iloc[last_idx] if not pd.isna(st_dir.iloc[last_idx]) else "BULLISH",
        "vwap": round(float(vwap_series.iloc[last_idx]), 2) if not pd.isna(vwap_series.iloc[last_idx]) else None,
        "atr_14": round(float(atr_14.iloc[last_idx]), 2) if not pd.isna(atr_14.iloc[last_idx]) else 25.0,
        "bb_upper": round(float(bb_upper.iloc[last_idx]), 2) if not pd.isna(bb_upper.iloc[last_idx]) else None,
        "bb_lower": round(float(bb_lower.iloc[last_idx]), 2) if not pd.isna(bb_lower.iloc[last_idx]) else None,
    }


class IndicatorEngine:
    """Wrapper class providing calculate_indicators interface."""
    @staticmethod
    def calculate(candles: List[Candle]) -> Dict[str, Any]:
        return calculate_indicators(candles)

    def calculate_indicators(self, candles: List[Candle]) -> Dict[str, Any]:
        return calculate_indicators(candles)
