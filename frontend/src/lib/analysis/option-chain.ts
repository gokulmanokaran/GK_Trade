// ============================================================
// Option Chain Analysis Engine
// OI Analysis, PCR, Max Pain, OI Buildup Classification
// ============================================================

import type { OptionChain, OptionChainRow, OIBuildup } from '../market-data/types';

// ── PCR ──────────────────────────────────────────────────────
export function calculatePCR(chain: OptionChain): number {
  if (chain.totalCallOi && chain.totalPutOi && chain.totalCallOi > 0) {
    return +(chain.totalPutOi / chain.totalCallOi).toFixed(4);
  }
  const totCE = chain.rows.reduce((s, r) => s + (r.ceOi || 0), 0);
  const totPE = chain.rows.reduce((s, r) => s + (r.peOi || 0), 0);
  return totCE > 0 ? +(totPE / totCE).toFixed(4) : 1;
}

// ── Max Pain ─────────────────────────────────────────────────
export function calculateMaxPain(chain: OptionChain): number {
  let minPain = Infinity;
  let maxPainStrike = chain.atmStrike;

  for (const testRow of chain.rows) {
    let totalPain = 0;
    for (const row of chain.rows) {
      // CE pain at this strike
      if (testRow.strike < row.strike) {
        totalPain += (row.strike - testRow.strike) * (row.ceOi || 0);
      }
      // PE pain at this strike
      if (testRow.strike > row.strike) {
        totalPain += (testRow.strike - row.strike) * (row.peOi || 0);
      }
    }
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = testRow.strike;
    }
  }
  return maxPainStrike;
}

// ── Support / Resistance from OI ─────────────────────────────
export function findOILevels(chain: OptionChain): {
  callWall: number;   // highest call OI = resistance
  putWall: number;    // highest put OI = support
  secondCallWall: number;
  secondPutWall: number;
} {
  const sorted = [...chain.rows];

  const byCallOI = [...sorted].sort((a, b) => (b.ceOi || 0) - (a.ceOi || 0));
  const byPutOI = [...sorted].sort((a, b) => (b.peOi || 0) - (a.peOi || 0));

  return {
    callWall: byCallOI[0]?.strike ?? chain.atmStrike,
    secondCallWall: byCallOI[1]?.strike ?? chain.atmStrike,
    putWall: byPutOI[0]?.strike ?? chain.atmStrike,
    secondPutWall: byPutOI[1]?.strike ?? chain.atmStrike,
  };
}

// ── OI Buildup Classification ─────────────────────────────────
export function classifyOIBuildup(
  row: OptionChainRow,
  optionType: 'CE' | 'PE',
  priceChange: number // underlying price change %
): OIBuildup {
  const oiChange = optionType === 'CE' ? (row.ceOiChange ?? 0) : (row.peOiChange ?? 0);
  const priceUp = priceChange > 0;
  const oiUp = oiChange > 0;

  let classification: OIBuildup['classification'];
  let reason: string;

  if (optionType === 'CE') {
    if (priceUp && oiUp) {
      classification = 'LONG_BUILDUP';
      reason = 'CE price rising with OI addition — bullish long buildup';
    } else if (!priceUp && oiUp) {
      classification = 'SHORT_BUILDUP';
      reason = 'CE price falling with OI addition — bearish short buildup';
    } else if (priceUp && !oiUp) {
      classification = 'SHORT_COVERING';
      reason = 'CE price rising with OI reduction — short covering';
    } else {
      classification = 'LONG_UNWINDING';
      reason = 'CE price falling with OI reduction — long unwinding';
    }
  } else {
    if (!priceUp && oiUp) {
      classification = 'LONG_BUILDUP';
      reason = 'PE price rising with OI addition — bearish long buildup';
    } else if (priceUp && oiUp) {
      classification = 'SHORT_BUILDUP';
      reason = 'PE price falling with OI addition — bullish short buildup';
    } else if (!priceUp && !oiUp) {
      classification = 'SHORT_COVERING';
      reason = 'PE price rising with OI reduction — short covering';
    } else {
      classification = 'LONG_UNWINDING';
      reason = 'PE price falling with OI reduction — long unwinding';
    }
  }

  return { strike: row.strike, optionType, classification, reason };
}

// ── ATM Option Liquidity Check ───────────────────────────────
export interface LiquidityCheck {
  passed: boolean;
  reason: string;
  ceScore: number;  // 0–100
  peScore: number;
}

export function checkLiquidity(
  chain: OptionChain,
  minOI = 50000,
  minVolume = 1000,
  maxSpreadPct = 5
): LiquidityCheck {
  const atm = chain.rows.find((r) => r.isAtm);
  if (!atm) return { passed: false, reason: 'ATM strike not found', ceScore: 0, peScore: 0 };

  const ceOk = (atm.ceOi ?? 0) >= minOI;
  const peOk = (atm.peOi ?? 0) >= minOI;
  const ceVolOk = (atm.ceVolume ?? 0) >= minVolume;
  const peVolOk = (atm.peVolume ?? 0) >= minVolume;

  const ceSpreadPct = atm.ceLtp && atm.ceBid && atm.ceAsk
    ? ((atm.ceAsk - atm.ceBid) / atm.ceLtp) * 100
    : 0;
  const peSpreadPct = atm.peLtp && atm.peBid && atm.peAsk
    ? ((atm.peAsk - atm.peBid) / atm.peLtp) * 100
    : 0;

  const ceSpreadOk = ceSpreadPct <= maxSpreadPct;
  const peSpreadOk = peSpreadPct <= maxSpreadPct;

  const ceScore = (ceOk ? 40 : 0) + (ceVolOk ? 40 : 0) + (ceSpreadOk ? 20 : 0);
  const peScore = (peOk ? 40 : 0) + (peVolOk ? 40 : 0) + (peSpreadOk ? 20 : 0);

  const passed = ceScore >= 60 || peScore >= 60;
  const reasons: string[] = [];
  if (!ceOk) reasons.push(`CE OI low (${(atm.ceOi || 0).toLocaleString('en-IN')} < ${minOI.toLocaleString('en-IN')})`);
  if (!peOk) reasons.push(`PE OI low (${(atm.peOi || 0).toLocaleString('en-IN')} < ${minOI.toLocaleString('en-IN')})`);
  if (!ceVolOk) reasons.push('CE volume insufficient');
  if (!peVolOk) reasons.push('PE volume insufficient');

  return {
    passed,
    reason: passed ? 'Liquidity adequate' : reasons.join('; '),
    ceScore,
    peScore,
  };
}

// ── IV Analysis ───────────────────────────────────────────────
export interface IVAnalysis {
  atmCeIV: number | null;
  atmPeIV: number | null;
  avgIV: number | null;
  ivLevel: 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
  recommendation: string;
}

export function analyzeIV(chain: OptionChain): IVAnalysis {
  const atm = chain.rows.find((r) => r.isAtm);
  const atmCeIV = atm?.ceIv ?? null;
  const atmPeIV = atm?.peIv ?? null;
  const avgIV = atmCeIV && atmPeIV ? +((atmCeIV + atmPeIV) / 2).toFixed(4) : atmCeIV ?? atmPeIV;

  let ivLevel: IVAnalysis['ivLevel'] = 'NORMAL';
  let recommendation = 'IV is in normal range. Option buying is viable.';

  if (avgIV !== null) {
    if (avgIV < 0.12) {
      ivLevel = 'LOW';
      recommendation = 'IV is low. Options are cheap; buying strategies preferred.';
    } else if (avgIV < 0.20) {
      ivLevel = 'NORMAL';
      recommendation = 'IV is normal. Standard option buying viable.';
    } else if (avgIV < 0.30) {
      ivLevel = 'ELEVATED';
      recommendation = 'IV is elevated. Premium is expensive; consider tighter targets.';
    } else {
      ivLevel = 'EXTREME';
      recommendation = 'IV is extremely high. Avoid buying; premium crush risk is high.';
    }
  }

  return { atmCeIV, atmPeIV, avgIV, ivLevel, recommendation };
}

// ── Chain Summary ─────────────────────────────────────────────
export interface ChainSummary {
  pcr: number;
  maxPain: number;
  callWall: number;
  putWall: number;
  oiBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  ivAnalysis: IVAnalysis;
  liquidityCheck: LiquidityCheck;
  reason: string;
}

export function analyzeChain(chain: OptionChain, niftyChangePct = 0): ChainSummary {
  const pcr = calculatePCR(chain);
  const maxPain = calculateMaxPain(chain);
  const levels = findOILevels(chain);
  const ivAnalysis = analyzeIV(chain);
  const liquidityCheck = checkLiquidity(chain);

  // PCR interpretation
  let oiBias: ChainSummary['oiBias'] = 'NEUTRAL';
  let reason = '';

  if (pcr > 1.3) {
    oiBias = 'BULLISH';
    reason = `PCR ${pcr.toFixed(2)} — heavy put writing suggests bullish sentiment. Put wall at ${levels.putWall}.`;
  } else if (pcr < 0.7) {
    oiBias = 'BEARISH';
    reason = `PCR ${pcr.toFixed(2)} — heavy call writing suggests bearish sentiment. Call wall at ${levels.callWall}.`;
  } else {
    reason = `PCR ${pcr.toFixed(2)} — neutral. Call wall ${levels.callWall}, put wall ${levels.putWall}.`;
  }

  return {
    pcr,
    maxPain,
    callWall: levels.callWall,
    putWall: levels.putWall,
    oiBias,
    ivAnalysis,
    liquidityCheck,
    reason,
  };
}
