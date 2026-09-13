// ============================================================
// Market Regime Detection Engine
// ============================================================

import type { MarketRegime } from '../market-data/types';
import type { TechnicalIndicators } from './technical';
import type { ChainSummary } from './option-chain';

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number; // 0-100
  reason: string;
  tradingAllowed: boolean;
}

export function detectMarketRegime(
  indicators: TechnicalIndicators,
  chainSummary: ChainSummary,
  candles: { close: number; high: number; low: number }[]
): RegimeAnalysis {
  const { ema9, ema20, ema50, vwap, rsi14, macdHist, supertrendDirection, atr14, currentPrice } = indicators;

  const scores = {
    bullish: 0,
    bearish: 0,
    sideways: 0,
    highVol: 0,
    lowVol: 0,
  };

  const reasons: string[] = [];

  // ── EMA alignment ───────────────────────────────────────────
  if (ema9 && ema20 && ema50) {
    if (currentPrice > ema9 && ema9 > ema20 && ema20 > ema50) {
      scores.bullish += 25;
      reasons.push('Price > EMA9 > EMA20 > EMA50 (strong bullish alignment)');
    } else if (currentPrice < ema9 && ema9 < ema20 && ema20 < ema50) {
      scores.bearish += 25;
      reasons.push('Price < EMA9 < EMA20 < EMA50 (strong bearish alignment)');
    } else if (Math.abs(ema9 - ema20) / ema20 < 0.002) {
      scores.sideways += 20;
      reasons.push('EMA9 ≈ EMA20 (flat / sideways)');
    }
  }

  // ── VWAP ────────────────────────────────────────────────────
  if (vwap) {
    if (currentPrice > vwap * 1.002) {
      scores.bullish += 15;
      reasons.push(`Price above VWAP (${vwap.toFixed(0)})`);
    } else if (currentPrice < vwap * 0.998) {
      scores.bearish += 15;
      reasons.push(`Price below VWAP (${vwap.toFixed(0)})`);
    } else {
      scores.sideways += 10;
    }
  }

  // ── Supertrend ───────────────────────────────────────────────
  if (supertrendDirection) {
    if (supertrendDirection === 'BULLISH') {
      scores.bullish += 20;
      reasons.push('Supertrend: BULLISH');
    } else {
      scores.bearish += 20;
      reasons.push('Supertrend: BEARISH');
    }
  }

  // ── MACD ────────────────────────────────────────────────────
  if (macdHist !== null) {
    if (macdHist > 0) {
      scores.bullish += 10;
      reasons.push(`MACD histogram positive (${macdHist.toFixed(2)})`);
    } else if (macdHist < 0) {
      scores.bearish += 10;
      reasons.push(`MACD histogram negative (${macdHist.toFixed(2)})`);
    }
  }

  // ── RSI ─────────────────────────────────────────────────────
  if (rsi14 !== null) {
    if (rsi14 > 60) {
      scores.bullish += 10;
    } else if (rsi14 < 40) {
      scores.bearish += 10;
    } else {
      scores.sideways += 5;
    }
  }

  // ── ATR Volatility ───────────────────────────────────────────
  if (atr14 && currentPrice > 0) {
    const atrPct = (atr14 / currentPrice) * 100;
    if (atrPct > 0.5) {
      scores.highVol += 30;
      reasons.push(`High volatility: ATR ${atr14.toFixed(1)} (${atrPct.toFixed(2)}%)`);
    } else if (atrPct < 0.2) {
      scores.lowVol += 30;
      reasons.push(`Low volatility: ATR ${atr14.toFixed(1)} (${atrPct.toFixed(2)}%)`);
    }
  }

  // ── Choppy detection: HH-HL-LL-LH mixed ────────────────────
  if (candles.length >= 10) {
    const { higherHigh, higherLow, lowerHigh, lowerLow } = indicators.priceStructure;
    if (higherHigh && lowerLow) {
      scores.sideways += 20;
      reasons.push('Mixed HH and LL structure — choppy');
    }
  }

  // ── Option chain confluence ──────────────────────────────────
  if (chainSummary.oiBias === 'BULLISH') scores.bullish += 15;
  else if (chainSummary.oiBias === 'BEARISH') scores.bearish += 15;

  // ── Determine regime ─────────────────────────────────────────
  let regime: MarketRegime;
  let confidence: number;
  let tradingAllowed = true;

  const maxScore = Math.max(scores.bullish, scores.bearish, scores.sideways, scores.highVol, scores.lowVol);

  if (scores.highVol >= 30 && scores.sideways >= 20) {
    regime = 'CHOPPY';
    confidence = 70;
    tradingAllowed = false;
    reasons.push('High volatility + sideways = CHOPPY. Signal generation paused.');
  } else if (scores.sideways > scores.bullish && scores.sideways > scores.bearish && scores.sideways >= 30) {
    regime = 'SIDEWAYS';
    confidence = Math.min(90, scores.sideways);
    tradingAllowed = false;
    reasons.push('Sideways market — reduced signal quality. Avoiding trades.');
  } else if (scores.bullish > scores.bearish) {
    regime = scores.bullish >= 50 ? 'TRENDING_BULLISH' : 'TRENDING_BULLISH';
    confidence = Math.min(95, scores.bullish);
    tradingAllowed = true;
  } else if (scores.bearish > scores.bullish) {
    regime = scores.bearish >= 50 ? 'TRENDING_BEARISH' : 'TRENDING_BEARISH';
    confidence = Math.min(95, scores.bearish);
    tradingAllowed = true;
  } else if (scores.highVol > 20) {
    regime = 'HIGH_VOLATILITY';
    confidence = Math.min(80, scores.highVol);
    tradingAllowed = true;
  } else if (scores.lowVol > 20) {
    regime = 'LOW_VOLATILITY';
    confidence = Math.min(80, scores.lowVol);
    tradingAllowed = false; // Low vol = poor premium, avoid
    reasons.push('Low volatility environment — option premiums thin.');
  } else {
    regime = 'SIDEWAYS';
    confidence = 40;
    tradingAllowed = false;
  }

  return {
    regime,
    confidence,
    reason: reasons.slice(0, 4).join('. '),
    tradingAllowed,
  };
}

export function regimeLabel(regime: MarketRegime): string {
  const labels: Record<MarketRegime, string> = {
    TRENDING_BULLISH: '📈 Trending Bullish',
    TRENDING_BEARISH: '📉 Trending Bearish',
    SIDEWAYS: '↔️ Sideways',
    HIGH_VOLATILITY: '⚡ High Volatility',
    LOW_VOLATILITY: '😴 Low Volatility',
    CHOPPY: '🌀 Choppy',
  };
  return labels[regime] ?? regime;
}

export function regimeColor(regime: MarketRegime): string {
  const colors: Record<MarketRegime, string> = {
    TRENDING_BULLISH: 'text-emerald-400',
    TRENDING_BEARISH: 'text-rose-400',
    SIDEWAYS: 'text-amber-400',
    HIGH_VOLATILITY: 'text-orange-400',
    LOW_VOLATILITY: 'text-slate-400',
    CHOPPY: 'text-red-500',
  };
  return colors[regime] ?? 'text-slate-400';
}
