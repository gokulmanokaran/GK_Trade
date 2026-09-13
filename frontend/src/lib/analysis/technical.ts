// ============================================================
// Technical Analysis Engine — Pure TypeScript
// EMA, RSI, MACD, ATR, VWAP, Supertrend, Bollinger Bands
// ============================================================

import type { OHLCCandle } from '../market-data/types';

// ── EMA ─────────────────────────────────────────────────────
export function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function latestEma(candles: OHLCCandle[], period: number): number | null {
  if (candles.length < period) return null;
  const closes = candles.map((c) => c.close);
  const emas = ema(closes, period);
  return emas.length > 0 ? +emas[emas.length - 1].toFixed(2) : null;
}

// ── RSI ─────────────────────────────────────────────────────
export function rsi(candles: OHLCCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const closes = candles.map((c) => c.close);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

// ── MACD ────────────────────────────────────────────────────
export function macd(
  candles: OHLCCandle[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number; signal: number; histogram: number } | null {
  if (candles.length < slow + signal) return null;
  const closes = candles.map((c) => c.close);
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);

  // Align: slow EMA is shorter
  const offset = fast - slow; // usually negative (fastEma is longer)
  const macdLine: number[] = [];
  for (let i = 0; i < slowEma.length; i++) {
    const fastIdx = i + (fastEma.length - slowEma.length);
    if (fastIdx >= 0 && fastIdx < fastEma.length) {
      macdLine.push(fastEma[fastIdx] - slowEma[i]);
    }
  }

  if (macdLine.length < signal) return null;
  const signalLine = ema(macdLine, signal);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];

  return {
    macd: +lastMacd.toFixed(2),
    signal: +lastSignal.toFixed(2),
    histogram: +(lastMacd - lastSignal).toFixed(2),
  };
}

// ── ATR ─────────────────────────────────────────────────────
export function atr(candles: OHLCCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  const recent = trs.slice(-period);
  return +(recent.reduce((a, b) => a + b, 0) / period).toFixed(2);
}

// ── VWAP ────────────────────────────────────────────────────
export function vwap(candles: OHLCCandle[]): number | null {
  if (candles.length === 0) return null;
  let cumPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumVol += c.volume;
  }
  return cumVol === 0 ? null : +(cumPV / cumVol).toFixed(2);
}

// ── Supertrend ───────────────────────────────────────────────
export function supertrend(
  candles: OHLCCandle[],
  period = 10,
  multiplier = 3
): { value: number; direction: 'BULLISH' | 'BEARISH' } | null {
  if (candles.length < period + 1) return null;

  const atrValues: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    atrValues.push(Math.max(hl, hc, lc));
  }

  let upperBand = 0;
  let lowerBand = 0;
  let prevUpperBand = 0;
  let prevLowerBand = 0;
  let direction: 'BULLISH' | 'BEARISH' = 'BULLISH';
  let supertrendVal = 0;

  for (let i = period; i < candles.length; i++) {
    const recentATR = atrValues.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    const hl2 = (candles[i].high + candles[i].low) / 2;

    const rawUpper = hl2 + multiplier * recentATR;
    const rawLower = hl2 - multiplier * recentATR;

    upperBand = rawUpper < prevUpperBand || candles[i - 1].close > prevUpperBand ? rawUpper : prevUpperBand;
    lowerBand = rawLower > prevLowerBand || candles[i - 1].close < prevLowerBand ? rawLower : prevLowerBand;

    if (candles[i].close > upperBand) {
      direction = 'BULLISH';
      supertrendVal = lowerBand;
    } else if (candles[i].close < lowerBand) {
      direction = 'BEARISH';
      supertrendVal = upperBand;
    } else {
      supertrendVal = direction === 'BULLISH' ? lowerBand : upperBand;
    }

    prevUpperBand = upperBand;
    prevLowerBand = lowerBand;
  }

  return { value: +supertrendVal.toFixed(2), direction };
}

// ── Bollinger Bands ──────────────────────────────────────────
export function bollingerBands(
  candles: OHLCCandle[],
  period = 20,
  stdDev = 2
): { upper: number; mid: number; lower: number } | null {
  if (candles.length < period) return null;
  const recent = candles.slice(-period).map((c) => c.close);
  const mid = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: +(mid + stdDev * std).toFixed(2),
    mid: +mid.toFixed(2),
    lower: +(mid - stdDev * std).toFixed(2),
  };
}

// ── Price Structure ──────────────────────────────────────────
export function detectPriceStructure(candles: OHLCCandle[]): {
  higherHigh: boolean;
  higherLow: boolean;
  lowerHigh: boolean;
  lowerLow: boolean;
  breakout: boolean;
  breakdown: boolean;
} {
  if (candles.length < 5) {
    return {
      higherHigh: false, higherLow: false,
      lowerHigh: false, lowerLow: false,
      breakout: false, breakdown: false,
    };
  }

  const n = candles.length;
  const prev2High = Math.max(candles[n - 4].high, candles[n - 3].high);
  const prev2Low = Math.min(candles[n - 4].low, candles[n - 3].low);
  const recentHigh = Math.max(candles[n - 2].high, candles[n - 1].high);
  const recentLow = Math.min(candles[n - 2].low, candles[n - 1].low);
  const lastClose = candles[n - 1].close;

  return {
    higherHigh: recentHigh > prev2High,
    higherLow: recentLow > prev2Low,
    lowerHigh: recentHigh < prev2High,
    lowerLow: recentLow < prev2Low,
    breakout: lastClose > prev2High,
    breakdown: lastClose < prev2Low,
  };
}

// ── All Indicators ───────────────────────────────────────────
export interface TechnicalIndicators {
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  vwap: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  atr14: number | null;
  supertrend: number | null;
  supertrendDirection: 'BULLISH' | 'BEARISH' | null;
  bbUpper: number | null;
  bbLower: number | null;
  bbMid: number | null;
  priceStructure: ReturnType<typeof detectPriceStructure>;
  currentPrice: number;
}

export function calculateAllIndicators(candles: OHLCCandle[]): TechnicalIndicators {
  const macdResult = macd(candles);
  const stResult = supertrend(candles);
  const bbResult = bollingerBands(candles);

  return {
    ema9: latestEma(candles, 9),
    ema20: latestEma(candles, 20),
    ema50: latestEma(candles, 50),
    ema200: latestEma(candles, 200),
    vwap: vwap(candles),
    rsi14: rsi(candles),
    macd: macdResult?.macd ?? null,
    macdSignal: macdResult?.signal ?? null,
    macdHist: macdResult?.histogram ?? null,
    atr14: atr(candles),
    supertrend: stResult?.value ?? null,
    supertrendDirection: stResult?.direction ?? null,
    bbUpper: bbResult?.upper ?? null,
    bbLower: bbResult?.lower ?? null,
    bbMid: bbResult?.mid ?? null,
    priceStructure: detectPriceStructure(candles),
    currentPrice: candles.length > 0 ? candles[candles.length - 1].close : 0,
  };
}
