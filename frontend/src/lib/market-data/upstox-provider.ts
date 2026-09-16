// ============================================================
// Upstox v2 Market Data Provider (Server-Side Only)
// Real-time market data for NIFTY 50 and options via Upstox API v2
// ============================================================

import type {
  MarketDataProvider,
  NiftyQuote,
  OptionChain,
  OptionChainRow,
  OHLCCandle,
  MarketStatus,
} from './types';
import { getMarketStatus as getLocalMarketStatus } from '../market-hours';

const UPSTOX_BASE_URL = 'https://api.upstox.com/v2';
const NIFTY_INSTRUMENT_KEY = 'NSE_INDEX|Nifty 50';

export class UpstoxProvider implements MarketDataProvider {
  name = 'upstox';
  private token: string;

  constructor(token?: string) {
    this.token = (token || process.env.UPSTOX_ANALYTICS_TOKEN || '').trim();
  }

  get isConfigured(): boolean {
    return Boolean(this.token && this.token.length > 5);
  }

  private get headers(): Record<string, string> {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'OptionPulse/2.0',
    };
  }

  async getNiftyQuote(): Promise<NiftyQuote> {
    if (!this.isConfigured) {
      throw new Error('UPSTOX_ANALYTICS_TOKEN is not configured on backend.');
    }

    const url = `${UPSTOX_BASE_URL}/market-quote/quotes?instrument_key=${encodeURIComponent(NIFTY_INSTRUMENT_KEY)}`;
    const res = await fetch(url, {
      headers: this.headers,
      cache: 'no-store',
    });

    if (res.status === 401) {
      throw new Error('Upstox Analytics Token is invalid or expired (HTTP 401).');
    }
    if (!res.ok) {
      throw new Error(`Upstox quote request failed: HTTP ${res.status}`);
    }

    const json = await res.json();
    const data = json?.data || {};

    let q: any = null;
    for (const key of Object.keys(data)) {
      if (key.includes('Nifty 50') || key.includes('NIFTY') || key.includes('NSE_INDEX')) {
        q = data[key];
        break;
      }
    }
    if (!q && Object.keys(data).length > 0) {
      q = Object.values(data)[0];
    }

    if (!q) {
      throw new Error('No quote data found in Upstox response for NIFTY 50');
    }

    const ltp = Number(q.last_price || q.ltp || 0);
    const ohlc = q.ohlc || {};
    const open = Number(ohlc.open || ltp);
    const high = Number(ohlc.high || ltp);
    const low = Number(ohlc.low || ltp);
    const prevClose = Number(ohlc.close || ltp);
    const change = Number(q.net_change || (ltp - prevClose));
    const changePct = Number(q.percentage_change || ((change / (prevClose || 1)) * 100));
    const volume = Number(q.volume || 0);
    const vwap = q.average_price ? Number(q.average_price) : undefined;

    let timestamp = new Date();
    if (q.timestamp || q.last_trade_time) {
      const raw = q.timestamp || q.last_trade_time;
      const parsed = typeof raw === 'number' ? new Date(raw) : new Date(raw);
      if (!isNaN(parsed.getTime())) timestamp = parsed;
    }

    return {
      instrument: 'NIFTY',
      ltp: +ltp.toFixed(2),
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      prevClose: +prevClose.toFixed(2),
      change: +change.toFixed(2),
      changePct: +changePct.toFixed(2),
      volume,
      vwap: vwap ? +vwap.toFixed(2) : undefined,
      timestamp,
      provider: 'upstox',
      isMock: false,
    };
  }

  async getExpiries(): Promise<string[]> {
    if (!this.isConfigured) return [];

    try {
      const url = `${UPSTOX_BASE_URL}/option/contract?instrument_key=${encodeURIComponent(NIFTY_INSTRUMENT_KEY)}`;
      const res = await fetch(url, { headers: this.headers, cache: 'no-store' });
      if (!res.ok) return [];

      const json = await res.json();
      const contracts = json?.data || [];
      const expiries = Array.from(new Set(contracts.map((c: any) => c.expiry).filter(Boolean))) as string[];
      return expiries.sort();
    } catch {
      return [];
    }
  }

  async getOptionChain(expiry?: string): Promise<OptionChain> {
    if (!this.isConfigured) {
      throw new Error('UPSTOX_ANALYTICS_TOKEN is not configured on backend.');
    }

    let selectedExpiry = expiry;
    if (!selectedExpiry) {
      const expiries = await this.getExpiries();
      selectedExpiry = expiries[0];
    }

    let url = `${UPSTOX_BASE_URL}/option/chain?instrument_key=${encodeURIComponent(NIFTY_INSTRUMENT_KEY)}`;
    if (selectedExpiry) {
      url += `&expiry_date=${encodeURIComponent(selectedExpiry)}`;
    }

    const res = await fetch(url, {
      headers: this.headers,
      cache: 'no-store',
    });

    if (res.status === 401) {
      throw new Error('Upstox Analytics Token is invalid or expired (HTTP 401).');
    }
    if (!res.ok) {
      throw new Error(`Upstox option chain request failed: HTTP ${res.status}`);
    }

    const json = await res.json();
    const chainList: any[] = json?.data || [];
    if (chainList.length === 0) {
      throw new Error('Empty option chain received from Upstox for NIFTY');
    }

    const quote = await this.getNiftyQuote();
    const underlyingLtp = quote.ltp;
    const atmStrike = Math.round(underlyingLtp / 50) * 50;

    let totalCallOi = 0;
    let totalPutOi = 0;

    const rows: OptionChainRow[] = chainList.map((item: any) => {
      const strike = Number(item.strike_price || 0);
      const callData = item.call_options || {};
      const putData = item.put_options || {};

      const ceMarket = callData.market_data || {};
      const ceGreeks = callData.option_greeks || {};
      const peMarket = putData.market_data || {};
      const peGreeks = putData.option_greeks || {};

      const ceOi = Number(ceMarket.oi || 0);
      const peOi = Number(peMarket.oi || 0);
      totalCallOi += ceOi;
      totalPutOi += peOi;

      return {
        strike,
        isAtm: Math.abs(strike - atmStrike) < 25,
        ceLtp: ceMarket.ltp != null ? Number(ceMarket.ltp) : undefined,
        ceOi,
        ceOiChange: ceMarket.change_in_oi != null ? Number(ceMarket.change_in_oi) : undefined,
        ceVolume: ceMarket.volume != null ? Number(ceMarket.volume) : undefined,
        ceIv: ceGreeks.iv != null ? Number(ceGreeks.iv) : undefined,
        ceDelta: ceGreeks.delta != null ? Number(ceGreeks.delta) : undefined,
        ceGamma: ceGreeks.gamma != null ? Number(ceGreeks.gamma) : undefined,
        ceTheta: ceGreeks.theta != null ? Number(ceGreeks.theta) : undefined,
        ceVega: ceGreeks.vega != null ? Number(ceGreeks.vega) : undefined,
        ceBid: ceMarket.bid != null ? Number(ceMarket.bid) : undefined,
        ceAsk: ceMarket.ask != null ? Number(ceMarket.ask) : undefined,
        peLtp: peMarket.ltp != null ? Number(peMarket.ltp) : undefined,
        peOi,
        peOiChange: peMarket.change_in_oi != null ? Number(peMarket.change_in_oi) : undefined,
        peVolume: peMarket.volume != null ? Number(peMarket.volume) : undefined,
        peIv: peGreeks.iv != null ? Number(peGreeks.iv) : undefined,
        peDelta: peGreeks.delta != null ? Number(peGreeks.delta) : undefined,
        peGamma: peGreeks.gamma != null ? Number(peGreeks.gamma) : undefined,
        peTheta: peGreeks.theta != null ? Number(peGreeks.theta) : undefined,
        peVega: peGreeks.vega != null ? Number(peGreeks.vega) : undefined,
        peBid: peMarket.bid != null ? Number(peMarket.bid) : undefined,
        peAsk: peMarket.ask != null ? Number(peMarket.ask) : undefined,
      };
    });

    rows.sort((a, b) => a.strike - b.strike);
    const pcr = totalCallOi > 0 ? +(totalPutOi / totalCallOi).toFixed(2) : 1.0;

    return {
      instrument: 'NIFTY',
      expiry: selectedExpiry || new Date().toISOString().split('T')[0],
      underlyingLtp,
      atmStrike,
      pcr,
      maxPain: undefined,
      totalCallOi,
      totalPutOi,
      rows,
      timestamp: new Date(),
      provider: 'upstox',
      isMock: false,
    };
  }

  async getHistoricalData(timeframe: string, limit: number): Promise<OHLCCandle[]> {
    if (!this.isConfigured) {
      throw new Error('UPSTOX_ANALYTICS_TOKEN is not configured on backend.');
    }

    const interval = timeframe === '1m' ? '1minute' : '5minute';
    const url = `${UPSTOX_BASE_URL}/historical-candle/intraday/${encodeURIComponent(NIFTY_INSTRUMENT_KEY)}/${interval}`;

    const res = await fetch(url, {
      headers: this.headers,
      cache: 'no-store',
    });

    if (res.status === 401) {
      throw new Error('Upstox Analytics Token is invalid or expired (HTTP 401).');
    }
    if (!res.ok) {
      throw new Error(`Upstox candles request failed: HTTP ${res.status}`);
    }

    const json = await res.json();
    const rawCandles: any[] = json?.data?.candles || [];

    // Upstox returns newest candles first: [[timestamp, open, high, low, close, volume, oi], ...]
    // Sort oldest first for indicators calculation
    const candles: OHLCCandle[] = rawCandles
      .slice(0, limit)
      .reverse()
      .map((c) => ({
        timestamp: new Date(c[0]),
        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        volume: Number(c[5] || 0),
      }));

    return candles;
  }

  async getMarketStatus(): Promise<MarketStatus> {
    return getLocalMarketStatus();
  }

  async getOptionQuote(strike: number, optionType: 'CE' | 'PE', expiry: string): Promise<Partial<OptionChainRow>> {
    const chain = await this.getOptionChain(expiry);
    const row = chain.rows.find((r) => r.strike === strike);
    if (!row) return {};
    return row;
  }
}
