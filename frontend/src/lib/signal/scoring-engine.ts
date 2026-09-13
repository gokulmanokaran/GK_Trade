// ============================================================
// Signal Scoring Engine — 100 Point Weighted System
// ============================================================

import type { TechnicalIndicators } from '../analysis/technical';
import type { ChainSummary } from '../analysis/option-chain';
import type { RegimeAnalysis } from '../analysis/market-regime';
import type { SignalScoreBreakdown } from '../market-data/types';

const DEFAULT_WEIGHTS: SignalScoreBreakdown = {
  trend: 20,
  priceAction: 15,
  vwap: 10,
  momentum: 10,
  volume: 10,
  optionChain: 15,
  oi: 10,
  volatility: 5,
  liquidity: 5,
  total: 100,
};

export interface ScoringInput {
  indicators: TechnicalIndicators;
  chainSummary: ChainSummary;
  regime: RegimeAnalysis;
  direction: 'CALL' | 'PUT';
  candles: { close: number; high: number; low: number; volume: number }[];
  weights?: Partial<SignalScoreBreakdown>;
}

export interface ScoringResult {
  score: SignalScoreBreakdown;
  totalScore: number;
  componentReasons: Record<string, string>;
  confidence: number;
}

export function scoreSignal(input: ScoringInput): ScoringResult {
  const w = { ...DEFAULT_WEIGHTS, ...(input.weights || {}) };
  const { indicators, chainSummary, regime, direction, candles } = input;
  const isBull = direction === 'CALL';
  const reasons: Record<string, string> = {};
  const scores: Partial<SignalScoreBreakdown> = {};

  // ── 1. TREND (20 pts) ─────────────────────────────────────
  {
    const { ema9, ema20, ema50, supertrendDirection, currentPrice } = indicators;
    let trendScore = 0;
    const tr: string[] = [];

    if (ema9 && ema20 && ema50) {
      if (isBull) {
        if (currentPrice > ema9) { trendScore += 5; tr.push('Price>EMA9'); }
        if (ema9 > ema20) { trendScore += 5; tr.push('EMA9>EMA20'); }
        if (ema20 > ema50) { trendScore += 5; tr.push('EMA20>EMA50'); }
      } else {
        if (currentPrice < ema9) { trendScore += 5; tr.push('Price<EMA9'); }
        if (ema9 < ema20) { trendScore += 5; tr.push('EMA9<EMA20'); }
        if (ema20 < ema50) { trendScore += 5; tr.push('EMA20<EMA50'); }
      }
    }
    if (supertrendDirection) {
      if ((isBull && supertrendDirection === 'BULLISH') || (!isBull && supertrendDirection === 'BEARISH')) {
        trendScore += 5;
        tr.push(`Supertrend ${supertrendDirection}`);
      }
    }
    scores.trend = Math.min(w.trend, Math.round((trendScore / 20) * w.trend));
    reasons.trend = tr.join(', ') || 'Trend not aligned';
  }

  // ── 2. PRICE ACTION (15 pts) ──────────────────────────────
  {
    const { higherHigh, higherLow, lowerHigh, lowerLow, breakout, breakdown } = indicators.priceStructure;
    let paScore = 0;
    const pa: string[] = [];

    if (isBull) {
      if (higherHigh) { paScore += 5; pa.push('Higher High'); }
      if (higherLow) { paScore += 5; pa.push('Higher Low'); }
      if (breakout) { paScore += 5; pa.push('Breakout'); }
    } else {
      if (lowerHigh) { paScore += 5; pa.push('Lower High'); }
      if (lowerLow) { paScore += 5; pa.push('Lower Low'); }
      if (breakdown) { paScore += 5; pa.push('Breakdown'); }
    }
    scores.priceAction = Math.min(w.priceAction, Math.round((paScore / 15) * w.priceAction));
    reasons.priceAction = pa.join(', ') || 'No clear price structure';
  }

  // ── 3. VWAP (10 pts) ─────────────────────────────────────
  {
    const { vwap, currentPrice } = indicators;
    let vwapScore = 0;
    if (vwap) {
      const pctFromVwap = (currentPrice - vwap) / vwap;
      if (isBull) {
        if (pctFromVwap > 0.002) { vwapScore = 10; reasons.vwap = `Price above VWAP by ${(pctFromVwap * 100).toFixed(2)}%`; }
        else if (pctFromVwap > 0) { vwapScore = 5; reasons.vwap = 'Price slightly above VWAP'; }
        else { reasons.vwap = 'Price below VWAP — bearish'; }
      } else {
        if (pctFromVwap < -0.002) { vwapScore = 10; reasons.vwap = `Price below VWAP by ${Math.abs(pctFromVwap * 100).toFixed(2)}%`; }
        else if (pctFromVwap < 0) { vwapScore = 5; reasons.vwap = 'Price slightly below VWAP'; }
        else { reasons.vwap = 'Price above VWAP — bullish'; }
      }
    } else {
      reasons.vwap = 'VWAP not available';
    }
    scores.vwap = Math.min(w.vwap, vwapScore);
  }

  // ── 4. MOMENTUM (10 pts) ──────────────────────────────────
  {
    const { rsi14, macdHist } = indicators;
    let momScore = 0;
    const mom: string[] = [];

    if (rsi14 !== null) {
      if (isBull) {
        if (rsi14 > 55 && rsi14 < 75) { momScore += 5; mom.push(`RSI ${rsi14} (bullish zone)`); }
        else if (rsi14 > 50) { momScore += 3; mom.push(`RSI ${rsi14} (above 50)`); }
        else { mom.push(`RSI ${rsi14} (bearish)`); }
      } else {
        if (rsi14 < 45 && rsi14 > 25) { momScore += 5; mom.push(`RSI ${rsi14} (bearish zone)`); }
        else if (rsi14 < 50) { momScore += 3; mom.push(`RSI ${rsi14} (below 50)`); }
        else { mom.push(`RSI ${rsi14} (bullish)`); }
      }
    }

    if (macdHist !== null) {
      if (isBull && macdHist > 0) { momScore += 5; mom.push(`MACD hist +${macdHist.toFixed(2)}`); }
      else if (!isBull && macdHist < 0) { momScore += 5; mom.push(`MACD hist ${macdHist.toFixed(2)}`); }
    }

    scores.momentum = Math.min(w.momentum, momScore);
    reasons.momentum = mom.join(', ') || 'Momentum not aligned';
  }

  // ── 5. VOLUME (10 pts) ───────────────────────────────────
  {
    if (candles.length >= 10) {
      const recentVol = candles[candles.length - 1].volume;
      const avgVol = candles.slice(-10, -1).reduce((s, c) => s + c.volume, 0) / 9;
      const volRatio = avgVol > 0 ? recentVol / avgVol : 1;

      let volScore = 0;
      if (volRatio >= 2) { volScore = 10; reasons.volume = `Volume spike ${volRatio.toFixed(1)}x avg`; }
      else if (volRatio >= 1.5) { volScore = 7; reasons.volume = `Volume elevated ${volRatio.toFixed(1)}x`; }
      else if (volRatio >= 1.0) { volScore = 4; reasons.volume = 'Normal volume'; }
      else { reasons.volume = `Volume weak ${volRatio.toFixed(1)}x`; }

      scores.volume = Math.min(w.volume, volScore);
    } else {
      scores.volume = 5; // neutral if insufficient data
      reasons.volume = 'Insufficient data for volume analysis';
    }
  }

  // ── 6. OPTION CHAIN (15 pts) ─────────────────────────────
  {
    const { oiBias, pcr } = chainSummary;
    let ocScore = 0;
    if (isBull) {
      if (oiBias === 'BULLISH') { ocScore = 15; reasons.optionChain = chainSummary.reason; }
      else if (oiBias === 'NEUTRAL') { ocScore = 8; reasons.optionChain = 'Neutral option chain'; }
      else { ocScore = 0; reasons.optionChain = 'Option chain bearish'; }
    } else {
      if (oiBias === 'BEARISH') { ocScore = 15; reasons.optionChain = chainSummary.reason; }
      else if (oiBias === 'NEUTRAL') { ocScore = 8; reasons.optionChain = 'Neutral option chain'; }
      else { ocScore = 0; reasons.optionChain = 'Option chain bullish'; }
    }
    scores.optionChain = Math.min(w.optionChain, ocScore);
  }

  // ── 7. OI BUILDUP (10 pts) ───────────────────────────────
  {
    // Based on regime + chain agreement
    const regimeAligned = (isBull && regime.regime === 'TRENDING_BULLISH') ||
                          (!isBull && regime.regime === 'TRENDING_BEARISH');
    scores.oi = regimeAligned ? w.oi : Math.floor(w.oi * 0.4);
    reasons.oi = regimeAligned
      ? `OI structure aligns with ${direction} bias`
      : `OI structure not fully aligned with ${direction}`;
  }

  // ── 8. VOLATILITY (5 pts) ────────────────────────────────
  {
    const { ivLevel } = chainSummary.ivAnalysis;
    let volScore = 0;
    if (ivLevel === 'NORMAL') { volScore = 5; }
    else if (ivLevel === 'LOW') { volScore = 5; }
    else if (ivLevel === 'ELEVATED') { volScore = 2; }
    else { volScore = 0; } // EXTREME
    scores.volatility = volScore;
    reasons.volatility = chainSummary.ivAnalysis.recommendation;
  }

  // ── 9. LIQUIDITY (5 pts) ─────────────────────────────────
  {
    const { passed, ceScore, peScore } = chainSummary.liquidityCheck;
    const liqScore = passed ? 5 : 0;
    scores.liquidity = liqScore;
    reasons.liquidity = chainSummary.liquidityCheck.reason;
  }

  // ── Total ─────────────────────────────────────────────────
  const totalScore = Object.entries(scores)
    .filter(([k]) => k !== 'total')
    .reduce((s, [, v]) => s + (v as number), 0);

  // Confidence: score + regime confidence + confirmations
  const confirmations = Object.values(scores).filter((v) => (v as number) > 0).length;
  const confidence = Math.round(
    totalScore * 0.6 + regime.confidence * 0.3 + confirmations * 1.5
  );

  return {
    score: { ...scores, total: totalScore } as SignalScoreBreakdown,
    totalScore,
    componentReasons: reasons,
    confidence: Math.min(99, confidence),
  };
}
