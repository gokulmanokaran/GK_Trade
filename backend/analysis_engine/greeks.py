"""
Black-Scholes Options Pricing & Greeks Calculator.
Computes true analytical Delta, Gamma, Theta, Vega, and numerical Implied Volatility (IV).
Used across option chain parsing and risk management.
"""

import math
from typing import Tuple
from scipy.stats import norm

# Standard Indian Risk-Free Rate (~6.75% RBI Repo benchmark)
DEFAULT_RISK_FREE_RATE = 0.0675


def black_scholes_price(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    iv: float,
    rate: float = DEFAULT_RISK_FREE_RATE,
    option_type: str = "CE"
) -> float:
    """Calculates Black-Scholes theoretical option price."""
    if time_to_expiry_years <= 0 or iv <= 0 or spot <= 0 or strike <= 0:
        return max(0.0, spot - strike) if option_type.upper() == "CE" else max(0.0, strike - spot)

    d1 = (math.log(spot / strike) + (rate + 0.5 * iv ** 2) * time_to_expiry_years) / (iv * math.sqrt(time_to_expiry_years))
    d2 = d1 - iv * math.sqrt(time_to_expiry_years)

    if option_type.upper() == "CE":
        price = spot * norm.cdf(d1) - strike * math.exp(-rate * time_to_expiry_years) * norm.cdf(d2)
    else:
        price = strike * math.exp(-rate * time_to_expiry_years) * norm.cdf(-d2) - spot * norm.cdf(-d1)

    return max(0.05, float(price))


def calculate_greeks(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    iv: float,
    rate: float = DEFAULT_RISK_FREE_RATE,
    option_type: str = "CE"
) -> Tuple[float, float, float, float]:
    """
    Returns (Delta, Gamma, Theta, Vega).
    - Delta: Price sensitivity per 1 pt underlying move
    - Gamma: Delta change per 1 pt underlying move
    - Theta: Daily decay in points
    - Vega: Price change per 1% change in IV
    """
    if time_to_expiry_years <= 0.0001 or iv <= 0.001 or spot <= 0 or strike <= 0:
        is_call = option_type.upper() == "CE"
        delta = 1.0 if (is_call and spot > strike) else (0.0 if is_call else (-1.0 if spot < strike else 0.0))
        return round(delta, 4), 0.0, 0.0, 0.0

    sqrt_t = math.sqrt(time_to_expiry_years)
    d1 = (math.log(spot / strike) + (rate + 0.5 * iv ** 2) * time_to_expiry_years) / (iv * sqrt_t)
    d2 = d1 - iv * sqrt_t

    pdf_d1 = norm.pdf(d1)

    # Gamma (identical for Call and Put)
    gamma = pdf_d1 / (spot * iv * sqrt_t)

    # Vega (per 1% IV change -> divide by 100)
    vega = (spot * sqrt_t * pdf_d1) / 100.0

    is_call = option_type.upper() == "CE"
    if is_call:
        delta = norm.cdf(d1)
        theta = -(spot * pdf_d1 * iv) / (2.0 * sqrt_t) - rate * strike * math.exp(-rate * time_to_expiry_years) * norm.cdf(d2)
    else:
        delta = norm.cdf(d1) - 1.0
        theta = -(spot * pdf_d1 * iv) / (2.0 * sqrt_t) + rate * strike * math.exp(-rate * time_to_expiry_years) * norm.cdf(-d2)

    # Convert theta to per-day decay (calendar year 365 days)
    theta_per_day = theta / 365.0

    return round(float(delta), 4), round(float(gamma), 6), round(float(theta_per_day), 4), round(float(vega), 4)


def implied_volatility(
    market_price: float,
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    rate: float = DEFAULT_RISK_FREE_RATE,
    option_type: str = "CE"
) -> float:
    """Finds IV using bisection search."""
    if market_price <= 0.05 or time_to_expiry_years <= 0:
        return 0.15  # Fallback reasonable default (15%)

    intrinsic = max(0.0, spot - strike) if option_type.upper() == "CE" else max(0.0, strike - spot)
    if market_price < intrinsic:
        return 0.10

    low_vol = 0.01
    high_vol = 3.00

    for _ in range(35):
        mid_vol = (low_vol + high_vol) / 2.0
        est_price = black_scholes_price(spot, strike, time_to_expiry_years, mid_vol, rate, option_type)
        diff = est_price - market_price

        if abs(diff) < 0.01:
            return round(mid_vol, 4)

        if diff > 0:
            high_vol = mid_vol
        else:
            low_vol = mid_vol

    return round((low_vol + high_vol) / 2.0, 4)
