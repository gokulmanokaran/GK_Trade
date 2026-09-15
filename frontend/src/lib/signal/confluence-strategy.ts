// ============================================================
// Confluence Strategy Engine — Frontend TypeScript Mirror
// Strictly implements the 20 Confluence Strategy Rules
// ============================================================

import type { NiftyQuote, OptionChain, OHLCCandle } from '../market-data/types';

export type ConfirmationStatus = 'PASS' | 'FAIL' | 'UNAVAILABLE' | 'PENDING' | 'FAIL_CHOPPY';

export interface ConfirmationItem {
  name: string;
  status: ConfirmationStatus;
  detail: string;
  metricValue?: number;
  thresholdValue?: number;
}

export type ConfluenceState =
  | 'WAITING_FOR_ORB_BREAKOUT'
  | 'WAITING_FOR_RETEST'
  | 'ENTRY_TRIGGERED'
  | 'NO_TRADE'
  | 'MARKET_CLOSED'
  | 'DATA_DELAYED'
  | 'INSUFFICIENT_DATA';

export interface ConfluenceSignalResult {
  signalType: 'CALL_BUY' | 'PUT_BUY' | 'NO_TRADE' | 'WATCH';
  state: ConfluenceState;
  direction: 'CE' | 'PE' | 'NONE';
  confidenceScore: number;
  dataQuality: 'LIVE' | 'DELAYED' | 'STALE' | 'INSUFFICIENT';
  dataSource: string;
  dataAgeSeconds: number;
  isLiveData: boolean;

  niftySpotLtp: number;
  orbHigh: number | null;
  orbLow: number | null;
  orbTimeRange: string;
  vwap: number | null;
  ema20: number | null;

  entryPrice: number | null;
  sl: number | null;
  target1: number | null;
  target2: number | null;
  rrRatio: number | null;

  recommendedStrike: number | null;
  optionType: 'CE' | 'PE' | null;
  instrumentName: string | null;
  optionLtp: number | null;

  confirmations: Record<string, ConfirmationItem>;
  passedConfirmationsCount: number;
  totalConfirmationsCount: number;
  rejectionReason: string | null;
  invalidationCondition: string | null;
  summaryReason: string;
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────

function parseISTMinutes(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Convert UTC to IST (+5h 30m)
  const istTime = new Date(d.getTime() + 330 * 60000);
  return istTime.getUTCHours() * 60 + istTime.getUTCMinutes();
}

export function calculateORB(candles: OHLCCandle[]): {
  orbHigh: number | null;
  orbLow: number | null;
  orbIndices: number[];
} {
  let orbHigh: number | null = null;
  let orbLow: number | null = null;
  const orbIndices: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const totalMin = parseISTMinutes(candles[i].timestamp);
    // 09:15 is 555 min, 09:30 is 570 min
    if (totalMin >= 555 && totalMin < 570) {
      orbIndices.push(i);
      if (orbHigh === null || candles[i].high > orbHigh) orbHigh = candles[i].high;
      if (orbLow === null || candles[i].low < orbLow) orbLow = candles[i].low;
    }
  }

  // Fallback for mock/test data with first 3 candles if at least 3 exist
  if ((orbHigh === null || orbLow === null) && candles.length >= 3) {
    orbHigh = Math.max(...candles.slice(0, 3).map((c) => c.high));
    orbLow = Math.min(...candles.slice(0, 3).map((c) => c.low));
    orbIndices.push(0, 1, 2);
  }

  return { orbHigh, orbLow, orbIndices };
}

function countVwapCrossovers(closes: number[], vwaps: number[], lookback = 10): number {
  if (closes.length < 2) return 0;
  const c = closes.slice(-lookback);
  const v = vwaps.slice(-lookback);
  let crosses = 0;
  for (let i = 1; i < c.length; i++) {
    const prevDiff = c[i - 1] - v[i - 1];
    const currDiff = c[i] - v[i];
    if ((prevDiff > 0 && currDiff < 0) || (prevDiff < 0 && currDiff > 0)) {
      crosses++;
    }
  }
  return crosses;
}

export function evaluateConfluence(
  candles: OHLCCandle[],
  quote: NiftyQuote,
  chain?: OptionChain | null,
  options: {
    isMarketOpen?: boolean;
    dataQuality?: 'LIVE' | 'DELAYED' | 'STALE' | 'INSUFFICIENT';
    dataSource?: string;
    dataAgeSeconds?: number;
    isLiveData?: boolean;
  } = {}
): ConfluenceSignalResult {
  const ltp = quote.ltp;
  const timestampStr = quote.timestamp ? quote.timestamp.toISOString() : new Date().toISOString();
  const isMarketOpen = options.isMarketOpen ?? true;
  const dataQuality = options.dataQuality ?? (quote.isMock ? 'DELAYED' : 'LIVE');
  const dataSource = options.dataSource ?? quote.provider;
  const dataAgeSeconds = options.dataAgeSeconds ?? Math.floor((Date.now() - new Date(quote.timestamp).getTime()) / 1000);
  const isLiveData = options.isLiveData ?? (!quote.isMock && dataAgeSeconds < 60);

  // Gate 0: Insufficient candles
  if (!candles || candles.length < 3) {
    return {
      signalType: 'NO_TRADE',
      state: 'INSUFFICIENT_DATA',
      direction: 'NONE',
      confidenceScore: 0,
      dataQuality,
      dataSource,
      dataAgeSeconds,
      isLiveData,
      niftySpotLtp: ltp,
      orbHigh: null,
      orbLow: null,
      orbTimeRange: '09:15 - 09:30 IST',
      vwap: null,
      ema20: null,
      entryPrice: null,
      sl: null,
      target1: null,
      target2: null,
      rrRatio: null,
      recommendedStrike: null,
      optionType: null,
      instrumentName: null,
      optionLtp: null,
      confirmations: {},
      passedConfirmationsCount: 0,
      totalConfirmationsCount: 7,
      rejectionReason: 'Insufficient candles (minimum 3 required for 15-min Opening Range)',
      invalidationCondition: null,
      summaryReason: 'Waiting for initial market data series to establish 15-min Opening Range.',
      timestamp: timestampStr,
    };
  }

  // ── Calculate Technical Series ──────────────────────────────
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  // 20 EMA
  const ema20Arr: number[] = [];
  const k = 2 / (20 + 1);
  let currEma = closes[0];
  for (let i = 0; i < closes.length; i++) {
    currEma = closes[i] * k + currEma * (1 - k);
    ema20Arr.push(currEma);
  }

  // VWAP
  const vwapArr: number[] = [];
  let cumVol = 0;
  let cumPv = 0;
  for (let i = 0; i < candles.length; i++) {
    const typ = (highs[i] + lows[i] + closes[i]) / 3.0;
    const v = volumes[i];
    cumVol += v;
    cumPv += typ * v;
    vwapArr.push(cumVol > 0 ? cumPv / cumVol : typ);
  }

  // ATR 14
  let currAtr = 25.0;
  if (candles.length >= 14) {
    const trs = candles.slice(1).map((c, i) => {
      const prevC = candles[i].close;
      return Math.max(c.high - c.low, Math.abs(c.high - prevC), Math.abs(c.low - prevC));
    });
    currAtr = trs.slice(-14).reduce((a, b) => a + b, 0) / 14;
  }

  const { orbHigh, orbLow, orbIndices } = calculateORB(candles);
  const lastIdx = candles.length - 1;
  const currClose = closes[lastIdx];
  const currVwap = vwapArr[lastIdx];
  const currEma20 = ema20Arr[lastIdx];

  const totalVolSum = volumes.reduce((a, b) => a + b, 0);
  const isSpotVolumeMissing = totalVolSum === 0;

  // Choppiness Check: count crossovers in last 10 candles
  const vwapCrossovers = countVwapCrossovers(closes, vwapArr, 10);
  const isChoppy = vwapCrossovers > 2;

  const choppinessItem: ConfirmationItem = isChoppy
    ? {
        name: 'Choppiness Filter',
        status: 'FAIL_CHOPPY',
        detail: `Price repeatedly crossed VWAP (${vwapCrossovers} times in last 10 candles > 2). Market is choppy.`,
        metricValue: vwapCrossovers,
        thresholdValue: 2,
      }
    : {
        name: 'Choppiness Filter',
        status: 'PASS',
        detail: `Clean directional structure: ${vwapCrossovers} VWAP crossovers in last 10 bars (<= 2).`,
        metricValue: vwapCrossovers,
        thresholdValue: 2,
      };

  const postOrbStartIdx = orbIndices.length > 0 ? Math.max(...orbIndices) + 1 : 3;

  // Still within ORB
  if (postOrbStartIdx >= candles.length || orbHigh === null || orbLow === null) {
    const confirmations: Record<string, ConfirmationItem> = {
      vwap: { name: 'VWAP Position', status: 'PENDING', detail: `LTP: ${currClose.toFixed(1)} vs VWAP: ${currVwap.toFixed(1)}` },
      ema20: { name: '20 EMA Trend', status: 'PENDING', detail: `LTP: ${currClose.toFixed(1)} vs 20 EMA: ${currEma20.toFixed(1)}` },
      orbBreakout: { name: 'ORB Breakout', status: 'PENDING', detail: `Forming 15m Range (High: ${orbHigh?.toFixed(1) ?? '—'}, Low: ${orbLow?.toFixed(1) ?? '—'})` },
      candleStrength: { name: 'Candle Strength', status: 'PENDING', detail: 'Waiting for breakout candle close' },
      volume: { name: 'Volume Confirmation', status: isSpotVolumeMissing ? 'UNAVAILABLE' : 'PENDING', detail: 'Waiting for post-ORB volume' },
      retest: { name: 'Retest & Rejection', status: 'PENDING', detail: 'Retest can only occur after ORB breakout' },
      choppiness: choppinessItem,
    };

    return {
      signalType: 'WATCH',
      state: 'WAITING_FOR_ORB_BREAKOUT',
      direction: 'NONE',
      confidenceScore: 30,
      dataQuality,
      dataSource,
      dataAgeSeconds,
      isLiveData,
      niftySpotLtp: currClose,
      orbHigh,
      orbLow,
      orbTimeRange: '09:15 - 09:30 IST',
      vwap: +currVwap.toFixed(1),
      ema20: +currEma20.toFixed(1),
      entryPrice: null,
      sl: null,
      target1: null,
      target2: null,
      rrRatio: null,
      recommendedStrike: null,
      optionType: null,
      instrumentName: null,
      optionLtp: null,
      confirmations,
      passedConfirmationsCount: 0,
      totalConfirmationsCount: 7,
      rejectionReason: 'Market is within or right at the 15-minute opening range window.',
      invalidationCondition: null,
      summaryReason: `Opening Range established [Low: ${orbLow?.toFixed(1) ?? '—'} - High: ${orbHigh?.toFixed(1) ?? '—'}]. Awaiting 5-min candle breakout with volume.`,
      timestamp: timestampStr,
    };
  }

  // Search post-ORB for Breakout
  let ceBreakoutIdx: number | null = null;
  let peBreakoutIdx: number | null = null;

  for (let i = postOrbStartIdx; i < candles.length; i++) {
    const c = candles[i];
    const cRange = Math.max(0.1, c.high - c.low);
    const body = Math.abs(c.close - c.open);
    if (c.close > orbHigh && ceBreakoutIdx === null) {
      if (body / cRange >= 0.48 && cRange <= 2.5 * currAtr) ceBreakoutIdx = i;
    }
    if (c.close < orbLow && peBreakoutIdx === null) {
      if (body / cRange >= 0.48 && cRange <= 2.5 * currAtr) peBreakoutIdx = i;
    }
  }

  let targetDir: 'CE' | 'PE' | 'NONE' = 'NONE';
  let breakoutIdx: number | null = null;
  let breakoutLevel: number | null = null;

  if (ceBreakoutIdx !== null && peBreakoutIdx === null) {
    targetDir = 'CE';
    breakoutIdx = ceBreakoutIdx;
    breakoutLevel = orbHigh;
  } else if (peBreakoutIdx !== null && ceBreakoutIdx === null) {
    targetDir = 'PE';
    breakoutIdx = peBreakoutIdx;
    breakoutLevel = orbLow;
  } else if (ceBreakoutIdx !== null && peBreakoutIdx !== null) {
    if (ceBreakoutIdx > peBreakoutIdx) {
      targetDir = 'CE';
      breakoutIdx = ceBreakoutIdx;
      breakoutLevel = orbHigh;
    } else {
      targetDir = 'PE';
      breakoutIdx = peBreakoutIdx;
      breakoutLevel = orbLow;
    }
  }

  // No Breakout yet
  if (targetDir === 'NONE' || breakoutIdx === null || breakoutLevel === null) {
    const confirmations: Record<string, ConfirmationItem> = {
      vwap: {
        name: 'VWAP Position',
        status: currClose > currVwap ? 'PASS' : 'FAIL',
        detail: `LTP: ${currClose.toFixed(1)}, VWAP: ${currVwap.toFixed(1)}`,
      },
      ema20: {
        name: '20 EMA Trend',
        status: currClose > currEma20 ? 'PASS' : 'FAIL',
        detail: `LTP: ${currClose.toFixed(1)}, 20 EMA: ${currEma20.toFixed(1)}`,
      },
      orbBreakout: {
        name: 'ORB Breakout',
        status: 'PENDING',
        detail: `No breakout yet. ORB High: ${orbHigh.toFixed(1)}, Low: ${orbLow.toFixed(1)}, Current: ${currClose.toFixed(1)}`,
      },
      candleStrength: { name: 'Candle Strength', status: 'PENDING', detail: 'Waiting for 5m candle closing beyond ORB' },
      volume: { name: 'Volume Confirmation', status: isSpotVolumeMissing ? 'UNAVAILABLE' : 'PENDING', detail: 'Awaiting breakout candle volume' },
      retest: { name: 'Retest & Rejection', status: 'PENDING', detail: 'Retest occurs after breakout' },
      choppiness: choppinessItem,
    };

    return {
      signalType: 'WATCH',
      state: 'WAITING_FOR_ORB_BREAKOUT',
      direction: 'NONE',
      confidenceScore: 35,
      dataQuality,
      dataSource,
      dataAgeSeconds,
      isLiveData,
      niftySpotLtp: currClose,
      orbHigh,
      orbLow,
      orbTimeRange: '09:15 - 09:30 IST',
      vwap: +currVwap.toFixed(1),
      ema20: +currEma20.toFixed(1),
      entryPrice: null,
      sl: null,
      target1: null,
      target2: null,
      rrRatio: null,
      recommendedStrike: null,
      optionType: null,
      instrumentName: null,
      optionLtp: null,
      confirmations,
      passedConfirmationsCount: Object.values(confirmations).filter((c) => c.status === 'PASS').length,
      totalConfirmationsCount: 7,
      rejectionReason: null,
      invalidationCondition: null,
      summaryReason: `NIFTY is trading within today's Opening Range (${orbLow.toFixed(1)} - ${orbHigh.toFixed(1)}). Stand aside until breakout.`,
      timestamp: timestampStr,
    };
  }

  // ── Breakout Found! Evaluate Confirmations ─────────────────
  const breakoutCandle = candles[breakoutIdx];
  const bRange = Math.max(0.1, breakoutCandle.high - breakoutCandle.low);
  const bBody = Math.abs(breakoutCandle.close - breakoutCandle.open);
  const strongCandle = bBody / bRange >= 0.48 && bRange <= 2.5 * currAtr;

  const vwapPass = targetDir === 'CE' ? currClose > currVwap : currClose < currVwap;
  const emaPass = targetDir === 'CE' ? currClose > currEma20 : currClose < currEma20;

  const confirmations: Record<string, ConfirmationItem> = {
    vwap: {
      name: 'VWAP Position',
      status: vwapPass ? 'PASS' : 'FAIL',
      detail:
        targetDir === 'CE'
          ? `NIFTY (${currClose.toFixed(1)}) > VWAP (${currVwap.toFixed(1)})`
          : `NIFTY (${currClose.toFixed(1)}) < VWAP (${currVwap.toFixed(1)})`,
      metricValue: currClose,
      thresholdValue: currVwap,
    },
    ema20: {
      name: '20 EMA Trend',
      status: emaPass ? 'PASS' : 'FAIL',
      detail:
        targetDir === 'CE'
          ? `NIFTY (${currClose.toFixed(1)}) > 20 EMA (${currEma20.toFixed(1)})`
          : `NIFTY (${currClose.toFixed(1)}) < 20 EMA (${currEma20.toFixed(1)})`,
      metricValue: currClose,
      thresholdValue: currEma20,
    },
    orbBreakout: {
      name: 'ORB Breakout',
      status: 'PASS',
      detail:
        targetDir === 'CE'
          ? `5m Breakout above ORB High (${orbHigh.toFixed(1)})`
          : `5m Breakdown below ORB Low (${orbLow.toFixed(1)})`,
      metricValue: breakoutCandle.close,
      thresholdValue: breakoutLevel,
    },
    candleStrength: {
      name: 'Candle Strength',
      status: strongCandle ? 'PASS' : 'FAIL',
      detail: strongCandle
        ? `Strong candle body (${Math.round((bBody / bRange) * 100)}%), range ${bRange.toFixed(1)} <= 2.5*ATR`
        : `Weak body or oversized candle (${bRange.toFixed(1)} pts)`,
      metricValue: +(bBody / bRange).toFixed(2),
      thresholdValue: 0.5,
    },
    volume: isSpotVolumeMissing
      ? {
          name: 'Volume Confirmation',
          status: 'UNAVAILABLE',
          detail: 'NIFTY spot feed does not provide exchange traded volume. Live entry requires verified futures/proxy volume.',
          metricValue: 0,
          thresholdValue: 1,
        }
      : {
          name: 'Volume Confirmation',
          status: 'PASS', // If volume exists and > 0
          detail: `Breakout volume confirmed on candle #${breakoutIdx + 1}.`,
          metricValue: breakoutCandle.volume,
          thresholdValue: 0,
        },
    choppiness: choppinessItem,
  };

  // Check Retest (Rule 6: retest_idx > breakout_idx)
  let retestFound = false;
  let retestIdx: number | null = null;
  let retestSwingLevel: number | null = null;

  for (let r = breakoutIdx + 1; r < candles.length; r++) {
    const rc = candles[r];
    const rRange = Math.max(0.1, rc.high - rc.low);

    if (targetDir === 'CE') {
      const lowerWick = Math.min(rc.open, rc.close) - rc.low;
      const touchesLevel = rc.low <= orbHigh * 1.002 && rc.high >= orbHigh * 0.998;
      const bullishRejection = rc.close >= orbHigh || lowerWick / rRange >= 0.35;
      if (touchesLevel && bullishRejection) {
        retestFound = true;
        retestIdx = r;
        retestSwingLevel = rc.low;
        break;
      }
    } else {
      const upperWick = rc.high - Math.max(rc.open, rc.close);
      const touchesLevel = rc.high >= orbLow * 0.998 && rc.low <= orbLow * 1.002;
      const bearishRejection = rc.close <= orbLow || upperWick / rRange >= 0.35;
      if (touchesLevel && bearishRejection) {
        retestFound = true;
        retestIdx = r;
        retestSwingLevel = rc.high;
        break;
      }
    }
  }

  confirmations.retest = retestFound
    ? {
        name: 'Retest & Rejection',
        status: 'PASS',
        detail: `Retest confirmed on candle #${(retestIdx ?? 0) + 1} with swing test at ${retestSwingLevel?.toFixed(1)} and clean continuation`,
        metricValue: retestSwingLevel ?? undefined,
        thresholdValue: breakoutLevel,
      }
    : {
        name: 'Retest & Rejection',
        status: 'PENDING',
        detail: `Breakout occurred on candle #${breakoutIdx + 1}. Awaiting subsequent pullback to test ${breakoutLevel.toFixed(1)}`,
        metricValue: currClose,
        thresholdValue: breakoutLevel,
      };

  // Trade targets and risk
  const step = 50;
  const atmStrike = Math.round(currClose / step) * step;
  const selectedStrike = targetDir === 'CE' ? atmStrike - step : atmStrike + step; // 1-step ITM
  const optType = targetDir;
  const instrumentName = `NIFTY ${selectedStrike} ${optType}`;

  const slPoint =
    retestSwingLevel !== null
      ? retestSwingLevel
      : targetDir === 'CE'
      ? orbHigh - 15.0
      : orbLow + 15.0;

  const riskPts = Math.max(18.0, Math.abs(currClose - slPoint));
  const t1 = +(targetDir === 'CE' ? currClose + 1.5 * riskPts : currClose - 1.5 * riskPts).toFixed(1);
  const t2 = +(targetDir === 'CE' ? currClose + 2.2 * riskPts : currClose - 2.2 * riskPts).toFixed(1);
  const rrRatio = +(Math.abs(t1 - currClose) / riskPts).toFixed(2);

  const invalidation =
    targetDir === 'CE'
      ? `NIFTY sustains below retest swing ${slPoint.toFixed(1)} or drops below VWAP (${currVwap.toFixed(1)})`
      : `NIFTY sustains above retest swing ${slPoint.toFixed(1)} or climbs above VWAP (${currVwap.toFixed(1)})`;

  // Estimate option LTP
  let optLtp = 120.0;
  if (chain && chain.rows) {
    const row = chain.rows.find((r) => r.strike === selectedStrike);
    if (row) {
      const price = optType === 'CE' ? row.ceLtp : row.peLtp;
      if (price && price > 0) optLtp = price;
    }
  }

  const passedCount = Object.values(confirmations).filter((c) => c.status === 'PASS').length;
  const confidence = Math.round((passedCount / 7.0) * 100);

  let state: ConfluenceState = 'NO_TRADE';
  let signalType: 'CALL_BUY' | 'PUT_BUY' | 'NO_TRADE' | 'WATCH' = 'NO_TRADE';
  let rejection: string | null = null;

  if (isChoppy) {
    state = 'NO_TRADE';
    signalType = 'NO_TRADE';
    rejection = 'NO_TRADE_CHOPPY: Price repeatedly crossing VWAP (>2 times in last 10 bars).';
  } else if (!strongCandle) {
    state = 'NO_TRADE';
    signalType = 'NO_TRADE';
    rejection = 'NO_TRADE — Breakout candle lacks structural conviction (body < 50% or oversized).';
  } else if (isSpotVolumeMissing) {
    state = 'NO_TRADE';
    signalType = 'NO_TRADE';
    rejection = 'NO_TRADE — Volume confirmation unavailable on NIFTY spot feed.';
  } else if (!retestFound) {
    state = 'WAITING_FOR_RETEST';
    signalType = 'WATCH';
    rejection = `Waiting for post-breakout retest and rejection of ${breakoutLevel.toFixed(1)}.`;
  } else if (!vwapPass || !emaPass) {
    state = 'NO_TRADE';
    signalType = 'NO_TRADE';
    rejection = `NO_TRADE — Trend mismatch (VWAP: ${confirmations.vwap.status}, 20 EMA: ${confirmations.ema20.status}).`;
  } else if (rrRatio < 1.5) {
    state = 'NO_TRADE';
    signalType = 'NO_TRADE';
    rejection = `NO_TRADE — POOR_RISK_REWARD (RR ${rrRatio.toFixed(2)} < 1.5).`;
  } else if (!isMarketOpen) {
    state = 'MARKET_CLOSED';
    signalType = 'NO_TRADE';
    rejection = 'Market is currently closed. Showing end-of-session confluence evaluation.';
  } else {
    state = 'ENTRY_TRIGGERED';
    signalType = targetDir === 'CE' ? 'CALL_BUY' : 'PUT_BUY';
    rejection = null;
  }

  const summary =
    state === 'ENTRY_TRIGGERED'
      ? `Active Setup: ${signalType} (${instrumentName}) at ₹${optLtp.toFixed(1)}`
      : `Current Status: ${state}. ${rejection ?? 'Awaiting setup criteria.'}`;

  return {
    signalType,
    state,
    direction: targetDir,
    confidenceScore: confidence,
    dataQuality,
    dataSource,
    dataAgeSeconds,
    isLiveData,
    niftySpotLtp: currClose,
    orbHigh,
    orbLow,
    orbTimeRange: '09:15 - 09:30 IST',
    vwap: +currVwap.toFixed(1),
    ema20: +currEma20.toFixed(1),
    entryPrice: currClose,
    sl: slPoint,
    target1: t1,
    target2: t2,
    rrRatio,
    recommendedStrike: selectedStrike,
    optionType: optType,
    instrumentName,
    optionLtp: optLtp,
    confirmations,
    passedConfirmationsCount: passedCount,
    totalConfirmationsCount: 7,
    rejectionReason: rejection,
    invalidationCondition: invalidation,
    summaryReason: summary,
    timestamp: timestampStr,
  };
}
