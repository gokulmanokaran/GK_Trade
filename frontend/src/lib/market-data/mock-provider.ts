// ============================================================
// Mock Market Data Provider — Realistic NIFTY simulation
// Clearly marks all data as DEMO/MOCK
// ============================================================

import type {
  MarketDataProvider,
  NiftyQuote,
  OptionChain,
  OptionChainRow,
  OHLCCandle,
  MarketStatus,
} from './types';
import { getMarketStatus } from '../market-hours';

// Seed-based pseudo-random (deterministic within a minute)
function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function randomWalk(base: number, volatility: number, seed: number): number {
  const rand = seededRandom(seed) * 2 - 1;
  return +(base + rand * volatility).toFixed(2);
}

// Base NIFTY price — drifts realistically across the day
function getNiftyBase(): number {
  const now = new Date();
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
  // Realistic range: 24000–25500
  const base = 24500 + seededRandom(dayOfYear * 100) * 1000;
  const intraMove = (seededRandom(dayOfYear + minuteOfDay) - 0.4) * 300;
  return +(base + intraMove).toFixed(2);
}

function getATMStrike(ltp: number): number {
  return Math.round(ltp / 50) * 50;
}

export class MockMarketDataProvider implements MarketDataProvider {
  name = 'mock';

  async getNiftyQuote(): Promise<NiftyQuote> {
    const now = new Date();
    const seed = Math.floor(now.getTime() / 60000); // changes each minute
    const ltp = randomWalk(getNiftyBase(), 15, seed);
    const prevClose = ltp - randomWalk(0, 100, seed + 1000);
    const open = prevClose + randomWalk(0, 50, seed + 2000);
    const high = Math.max(ltp, open, prevClose) + Math.abs(randomWalk(0, 30, seed + 3000));
    const low = Math.min(ltp, open, prevClose) - Math.abs(randomWalk(0, 30, seed + 4000));
    const change = +(ltp - prevClose).toFixed(2);
    const changePct = +((change / prevClose) * 100).toFixed(2);
    const vwap = +(open * 0.3 + ltp * 0.7).toFixed(2);

    return {
      instrument: 'NIFTY',
      ltp,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      prevClose: +prevClose.toFixed(2),
      change,
      changePct,
      volume: Math.floor(seededRandom(seed + 5000) * 50000000 + 10000000),
      vwap,
      timestamp: now,
      provider: 'mock',
      isMock: true,
    };
  }

  async getOptionChain(expiry?: string): Promise<OptionChain> {
    const quote = await this.getNiftyQuote();
    const atm = getATMStrike(quote.ltp);
    const now = new Date();
    const seed = Math.floor(now.getTime() / 60000);

    // Generate strikes ±10 from ATM in steps of 50
    const strikes: number[] = [];
    for (let i = -10; i <= 10; i++) {
      strikes.push(atm + i * 50);
    }

    let totalCallOi = 0;
    let totalPutOi = 0;

    const rows: OptionChainRow[] = strikes.map((strike, idx) => {
      const distFromAtm = Math.abs(strike - atm) / 50;
      const isCe = strike >= atm;

      // OI is highest at ATM and nearby strikes
      const oiBase = Math.max(0, 5000000 - distFromAtm * 800000);
      const ceOi = Math.floor(oiBase * (0.8 + seededRandom(seed + idx * 10) * 0.4));
      const peOi = Math.floor(oiBase * (0.8 + seededRandom(seed + idx * 10 + 1) * 0.4));
      const ceOiChange = Math.floor((seededRandom(seed + idx * 10 + 2) - 0.3) * 200000);
      const peOiChange = Math.floor((seededRandom(seed + idx * 10 + 3) - 0.3) * 200000);

      totalCallOi += ceOi;
      totalPutOi += peOi;

      // LTP based on intrinsic + time value
      const ceIntrinsic = Math.max(0, quote.ltp - strike);
      const peIntrinsic = Math.max(0, strike - quote.ltp);
      const timeValue = Math.max(5, 200 - distFromAtm * 30) * seededRandom(seed + idx + 100);
      const ceLtp = +(ceIntrinsic + timeValue).toFixed(2);
      const peLtp = +(peIntrinsic + timeValue).toFixed(2);

      // IV: higher for OTM, base ~15–20%
      const baseIv = 0.15 + distFromAtm * 0.01;
      const ceIv = +(baseIv + seededRandom(seed + idx + 200) * 0.03).toFixed(4);
      const peIv = +(baseIv + seededRandom(seed + idx + 300) * 0.03).toFixed(4);

      // Delta: rough approximation
      const ceDelta = strike <= atm ? 0.5 + distFromAtm * 0.08 : Math.max(0.05, 0.5 - distFromAtm * 0.1);
      const peDelta = -(strike >= atm ? 0.5 + distFromAtm * 0.08 : Math.max(0.05, 0.5 - distFromAtm * 0.1));

      return {
        strike,
        ceLtp,
        ceOi,
        ceOiChange,
        ceVolume: Math.floor(ceOi * 0.02 * seededRandom(seed + idx + 400)),
        ceIv,
        ceDelta: +Math.min(0.99, Math.abs(ceDelta)).toFixed(4),
        ceGamma: +(0.001 - distFromAtm * 0.0001).toFixed(6),
        ceTheta: +(-ceLtp * 0.005).toFixed(4),
        ceVega: +(ceLtp * 0.01).toFixed(4),
        ceBid: +(ceLtp - 2).toFixed(2),
        ceAsk: +(ceLtp + 2).toFixed(2),
        peLtp,
        peOi,
        peOiChange,
        peVolume: Math.floor(peOi * 0.02 * seededRandom(seed + idx + 500)),
        peIv,
        peDelta: +Math.min(0.99, Math.abs(peDelta)).toFixed(4),
        peGamma: +(0.001 - distFromAtm * 0.0001).toFixed(6),
        peTheta: +(-peLtp * 0.005).toFixed(4),
        peVega: +(peLtp * 0.01).toFixed(4),
        peBid: +(peLtp - 2).toFixed(2),
        peAsk: +(peLtp + 2).toFixed(2),
        isAtm: strike === atm,
      };
    });

    const pcr = +(totalPutOi / totalCallOi).toFixed(4);
    // Max pain: strike with least combined OI loss (simplified: highest put OI strike)
    const maxPainRow = rows.reduce((prev, curr) =>
      (curr.peOi || 0) > (prev.peOi || 0) ? curr : prev
    );

    // Default expiry: next Thursday
    const defaultExpiry = expiry || getNextThursday();

    return {
      instrument: 'NIFTY',
      expiry: defaultExpiry,
      underlyingLtp: quote.ltp,
      atmStrike: atm,
      pcr,
      maxPain: maxPainRow.strike,
      totalCallOi,
      totalPutOi,
      rows,
      timestamp: now,
      provider: 'mock',
      isMock: true,
    };
  }

  async getExpiries(): Promise<string[]> {
    const expiries: string[] = [];
    const now = new Date();
    // Next 4 Thursdays
    for (let week = 0; week < 4; week++) {
      const d = new Date(now);
      d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7) + week * 7);
      expiries.push(d.toISOString().split('T')[0]);
    }
    return expiries;
  }

  async getHistoricalData(timeframe: string, limit: number): Promise<OHLCCandle[]> {
    const now = new Date();
    const intervalMap: Record<string, number> = {
      '1m': 60000,
      '3m': 180000,
      '5m': 300000,
      '15m': 900000,
      '30m': 1800000,
      '1H': 3600000,
      '1D': 86400000,
    };
    const interval = intervalMap[timeframe] || 300000;

    const candles: OHLCCandle[] = [];
    let price = getNiftyBase();

    for (let i = limit; i >= 0; i--) {
      const ts = new Date(now.getTime() - i * interval);
      const seed = Math.floor(ts.getTime() / interval);
      const move = randomWalk(0, 30, seed);
      const open = +price.toFixed(2);
      const close = +(price + move).toFixed(2);
      const high = +(Math.max(open, close) + Math.abs(randomWalk(0, 10, seed + 1))).toFixed(2);
      const low = +(Math.min(open, close) - Math.abs(randomWalk(0, 10, seed + 2))).toFixed(2);
      const volume = Math.floor(seededRandom(seed + 3) * 100000 + 5000);

      // VWAP: simple running approximation
      const typicalPrice = (high + low + close) / 3;
      const vwap = +typicalPrice.toFixed(2);

      candles.push({ timestamp: ts, open, high, low, close, volume, vwap });
      price = close;
    }

    return candles;
  }

  async getMarketStatus(): Promise<MarketStatus> {
    return getMarketStatus();
  }

  async getOptionQuote(
    strike: number,
    optionType: 'CE' | 'PE',
    expiry: string
  ) {
    const chain = await this.getOptionChain(expiry);
    const row = chain.rows.find((r) => r.strike === strike);
    if (!row) return {};
    return optionType === 'CE'
      ? {
          ceLtp: row.ceLtp, ceOi: row.ceOi, ceIv: row.ceIv,
          ceDelta: row.ceDelta, ceBid: row.ceBid, ceAsk: row.ceAsk,
        }
      : {
          peLtp: row.peLtp, peOi: row.peOi, peIv: row.peIv,
          peDelta: row.peDelta, peBid: row.peBid, peAsk: row.peAsk,
        };
  }
}

function getNextThursday(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilThursday = (4 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilThursday);
  return d.toISOString().split('T')[0];
}
