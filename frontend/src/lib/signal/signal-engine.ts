// ============================================================
// Main Signal Engine — Orchestrates all analysis engines
// Produces a GeneratedSignal or NO_TRADE decision
// ============================================================

import type { NiftyQuote, OptionChain, OHLCCandle, GeneratedSignal, MarketRegime } from '../market-data/types';
import { calculateAllIndicators } from '../analysis/technical';
import { analyzeChain, checkLiquidity } from '../analysis/option-chain';
import { detectMarketRegime } from '../analysis/market-regime';
import { scoreSignal } from './scoring-engine';
import { calculateRisk } from './risk-engine';
import { isMarketOpen } from '../market-hours';

export interface SignalEngineConfig {
  minScore: number;      // default 75
  minRR: number;         // default 1.5
  maxSignalsPerDay: number; // default 3
}

const DEFAULT_CONFIG: SignalEngineConfig = {
  minScore: 75,
  minRR: 1.5,
  maxSignalsPerDay: 3,
};

export async function generateSignal(
  quote: NiftyQuote,
  chain: OptionChain,
  candles: OHLCCandle[],
  config: Partial<SignalEngineConfig> = {}
): Promise<GeneratedSignal> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = new Date();
  const instrument = 'NIFTY';

  // ── Market status check ───────────────────────────────────
  if (!isMarketOpen()) {
    return noTrade(quote, chain, 'Market is closed', 'MARKET_CLOSED');
  }

  // ── Data freshness ────────────────────────────────────────
  const dataAgeMs = now.getTime() - quote.timestamp.getTime();
  if (dataAgeMs > 120000) { // > 2 minutes stale
    return noTrade(quote, chain, 'Market data is stale (>2 minutes old)', 'DATA_UNAVAILABLE');
  }

  // ── Technical analysis ────────────────────────────────────
  if (candles.length < 30) {
    return noTrade(quote, chain, 'Insufficient candle history for analysis');
  }

  const indicators = calculateAllIndicators(candles);
  const chainSummary = analyzeChain(chain, quote.changePct);

  // ── Market regime ─────────────────────────────────────────
  const regime = detectMarketRegime(indicators, chainSummary, candles);
  if (!regime.tradingAllowed) {
    return noTrade(quote, chain, `Market regime: ${regime.regime}. ${regime.reason}`);
  }

  // ── Determine direction ───────────────────────────────────
  const direction = regime.regime === 'TRENDING_BULLISH' ? 'CALL' : 'PUT';

  // ── Liquidity check ───────────────────────────────────────
  const liquidityCheck = chainSummary.liquidityCheck;
  if (!liquidityCheck.passed) {
    return noTrade(quote, chain, `Option liquidity insufficient: ${liquidityCheck.reason}`);
  }

  // ── Score the signal ──────────────────────────────────────
  const scoring = scoreSignal({
    indicators,
    chainSummary,
    regime,
    direction,
    candles,
  });

  if (scoring.totalScore < cfg.minScore) {
    return noTrade(
      quote, chain,
      `Signal score ${scoring.totalScore}/100 below minimum ${cfg.minScore}. Conditions: ${
        Object.entries(scoring.componentReasons)
          .filter(([, v]) => v.includes('not') || v.includes('below'))
          .map(([k, v]) => `${k}: ${v}`)
          .slice(0, 3)
          .join('; ')
      }`
    );
  }

  // ── Select strike ─────────────────────────────────────────
  const atm = chain.atmStrike;
  // ATM for strong setups, slight OTM for moderate
  const strike = scoring.totalScore >= 85 ? atm : atm + (direction === 'CALL' ? 50 : -50);
  const optionType = direction === 'CALL' ? 'CE' : 'PE';

  // Find option price
  const strikeRow = chain.rows.find((r) => r.strike === strike) ??
                    chain.rows.find((r) => r.isAtm);
  const optionLtp = optionType === 'CE'
    ? (strikeRow?.ceLtp ?? atm * 0.01)
    : (strikeRow?.peLtp ?? atm * 0.01);

  // ── Risk calculation ──────────────────────────────────────
  const risk = calculateRisk(direction, optionLtp, quote.ltp, indicators, chainSummary, {
    minRR: cfg.minRR,
  });

  if (!risk.validSetup) {
    return noTrade(quote, chain, `Risk/Reward invalid: ${risk.invalidReason}`);
  }

  // ── Expiry selection ──────────────────────────────────────
  const expiry = chain.expiry;

  // ── Build technical reasons ───────────────────────────────
  const techReason = buildTechReason(indicators, direction, scoring.componentReasons);
  const oiReason = chainSummary.reason;
  const chainReason = `PCR ${chainSummary.pcr.toFixed(2)}, Max Pain ${chainSummary.maxPain}, ` +
                      `Call wall ${chainSummary.callWall}, Put wall ${chainSummary.putWall}`;

  return {
    instrument,
    signalType: direction === 'CALL' ? 'CALL_BUY' : 'PUT_BUY',
    expiry,
    strike,
    optionType,
    niftyPrice: quote.ltp,
    entryLow: risk.entryLow,
    entryHigh: risk.entryHigh,
    entryTrigger: risk.entryTrigger,
    sl: risk.sl,
    slReason: risk.slReason,
    target1: risk.target1,
    target2: risk.target2,
    rrRatio: risk.rrRatio,
    signalScore: scoring.totalScore,
    confidence: scoring.confidence,
    regime: regime.regime,
    trendDirection: regime.regime.includes('BULLISH') ? 'BULLISH' : 'BEARISH',
    technicalReason: techReason,
    oiReason,
    chainReason,
    liquidityOk: liquidityCheck.passed,
    status: 'WATCH',
    scoreBreakdown: scoring.score,
    createdAt: now,
  };
}

// ── Helper: Build human-readable technical reason ─────────────
function buildTechReason(
  ind: ReturnType<typeof calculateAllIndicators>,
  direction: 'CALL' | 'PUT',
  reasons: Record<string, string>
): string {
  const parts: string[] = [];
  const isBull = direction === 'CALL';

  if (ind.supertrendDirection) {
    parts.push(`Supertrend is ${ind.supertrendDirection}`);
  }
  if (ind.vwap && ind.currentPrice) {
    parts.push(ind.currentPrice > ind.vwap
      ? `Price above VWAP (${ind.vwap?.toFixed(0)})`
      : `Price below VWAP (${ind.vwap?.toFixed(0)})`
    );
  }
  if (ind.rsi14) parts.push(`RSI(14) = ${ind.rsi14}`);
  if (ind.macdHist !== null) parts.push(`MACD histogram = ${ind.macdHist > 0 ? '+' : ''}${ind.macdHist}`);
  if (ind.priceStructure.breakout && isBull) parts.push('Breakout confirmed');
  if (ind.priceStructure.breakdown && !isBull) parts.push('Breakdown confirmed');

  return parts.join('. ') + '.';
}

// ── Helper: NO_TRADE signal builder ──────────────────────────
function noTrade(
  quote: NiftyQuote,
  chain: OptionChain,
  reason: string,
  status: GeneratedSignal['status'] = 'NO_TRADE'
): GeneratedSignal {
  return {
    instrument: 'NIFTY',
    signalType: 'NO_TRADE',
    expiry: chain.expiry,
    strike: chain.atmStrike,
    optionType: null,
    niftyPrice: quote.ltp,
    entryLow: 0,
    entryHigh: 0,
    entryTrigger: '',
    sl: 0,
    slReason: '',
    target1: 0,
    target2: 0,
    rrRatio: 0,
    signalScore: 0,
    confidence: 0,
    regime: 'SIDEWAYS',
    trendDirection: 'NEUTRAL',
    technicalReason: reason,
    oiReason: '',
    chainReason: '',
    liquidityOk: false,
    noTradeReason: reason,
    status,
    scoreBreakdown: {
      trend: 0, priceAction: 0, vwap: 0, momentum: 0,
      volume: 0, optionChain: 0, oi: 0, volatility: 0,
      liquidity: 0, total: 0,
    },
    createdAt: new Date(),
  };
}
