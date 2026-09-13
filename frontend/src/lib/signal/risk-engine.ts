// ============================================================
// Risk Engine — SL, Targets, R:R calculation
// ============================================================

import type { TechnicalIndicators } from '../analysis/technical';
import type { ChainSummary } from '../analysis/option-chain';

export interface RiskParameters {
  entryLow: number;
  entryHigh: number;
  entryTrigger: string;
  sl: number;
  slReason: string;
  target1: number;
  target2: number;
  target3: number | null;
  rrRatio: number;
  validSetup: boolean;
  invalidReason?: string;
}

export interface RiskConfig {
  minRR: number;      // default 1.5
  atrMultiplierSL: number; // default 1.5
}

const DEFAULT_CONFIG: RiskConfig = {
  minRR: 1.5,
  atrMultiplierSL: 1.5,
};

export function calculateRisk(
  direction: 'CALL' | 'PUT',
  optionLtp: number,
  niftyPrice: number,
  indicators: TechnicalIndicators,
  chainSummary: ChainSummary,
  config: Partial<RiskConfig> = {}
): RiskParameters {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { atr14, vwap, ema20, ema50 } = indicators;
  const isBull = direction === 'CALL';

  // ── Entry Zone ────────────────────────────────────────────
  // Widen by 2–3% to allow for spread + slippage
  const entryLow = +(optionLtp * 0.98).toFixed(2);
  const entryHigh = +(optionLtp * 1.03).toFixed(2);
  const entryTrigger = isBull
    ? `NIFTY holds above ${(niftyPrice - (atr14 ?? 20)).toFixed(0)} with bullish candle`
    : `NIFTY breaks below ${(niftyPrice + (atr14 ?? 20)).toFixed(0)} with bearish candle`;

  // ── Stop Loss ─────────────────────────────────────────────
  let sl: number;
  let slReason: string;

  if (atr14) {
    // ATR-based SL
    const atrSL = optionLtp - atr14 * cfg.atrMultiplierSL;
    sl = +Math.max(atrSL, optionLtp * 0.65).toFixed(2); // min 35% below entry
    slReason = `ATR(14) ${atr14.toFixed(1)} × ${cfg.atrMultiplierSL} below entry`;
  } else {
    sl = +(optionLtp * 0.72).toFixed(2);
    slReason = '28% below entry (default)';
  }

  // Underlying SL level
  if (vwap && isBull && niftyPrice > vwap) {
    slReason += `. NIFTY invalidation: close below VWAP ${vwap.toFixed(0)}`;
  } else if (ema20) {
    slReason += `. NIFTY invalidation: close below EMA20 ${ema20.toFixed(0)}`;
  }

  // ── Targets ──────────────────────────────────────────────
  const risk = entryHigh - sl;

  // Target 1: 1.5× risk (conservative — partial exit)
  const target1 = +(entryHigh + risk * 1.5).toFixed(2);
  // Target 2: 2.5× risk (full exit)
  const target2 = +(entryHigh + risk * 2.5).toFixed(2);
  // Target 3: 3.5× risk (trail)
  const target3 = +(entryHigh + risk * 3.5).toFixed(2);

  // R:R using midpoint entry
  const entryMid = (entryLow + entryHigh) / 2;
  const rrRatio = risk > 0 ? +((target1 - entryMid) / (entryMid - sl)).toFixed(2) : 0;

  // Validate minimum R:R
  const validSetup = rrRatio >= cfg.minRR && sl > 0 && sl < entryLow && target1 > entryHigh;

  return {
    entryLow,
    entryHigh,
    entryTrigger,
    sl,
    slReason,
    target1,
    target2,
    target3,
    rrRatio,
    validSetup,
    invalidReason: !validSetup ? `R:R ${rrRatio} < minimum ${cfg.minRR}` : undefined,
  };
}

// ── Position Size Calculation ────────────────────────────────
export function calculatePositionSize(
  capital: number,
  riskPct: number,
  entryPrice: number,
  sl: number,
  lotSize = 50 // NIFTY lot size
): { lots: number; investmentRequired: number; maxRisk: number } {
  const maxRiskAmount = (capital * riskPct) / 100;
  const riskPerUnit = entryPrice - sl;
  if (riskPerUnit <= 0) return { lots: 0, investmentRequired: 0, maxRisk: 0 };

  const maxUnits = Math.floor(maxRiskAmount / riskPerUnit);
  const lots = Math.max(0, Math.floor(maxUnits / lotSize));
  const investmentRequired = lots * lotSize * entryPrice;
  const maxRisk = lots * lotSize * riskPerUnit;

  return { lots, investmentRequired: +investmentRequired.toFixed(0), maxRisk: +maxRisk.toFixed(0) };
}
