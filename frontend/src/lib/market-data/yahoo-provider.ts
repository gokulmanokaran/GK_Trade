// ============================================================
// Yahoo Finance Market Data Provider
// Fetches NIFTY 50 (^NSEI) data via Yahoo Finance API
// ============================================================

import type {
  MarketDataProvider,
  NiftyQuote,
  OptionChain,
  OHLCCandle,
  MarketStatus,
} from './types';
import { getMarketStatus } from '../market-hours';
import { MockMarketDataProvider } from './mock-provider';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance';
const NIFTY_SYMBOL = '%5ENSEI'; // ^NSEI URL encoded

export class YahooFinanceProvider implements MarketDataProvider {
  name = 'yahoo';
  private mock = new MockMarketDataProvider();

  async getNiftyQuote(): Promise<NiftyQuote> {
    try {
      const res = await fetch(
        `${YAHOO_BASE}/chart/${NIFTY_SYMBOL}?interval=1m&range=1d`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
          },
          next: { revalidate: 30 }, // cache for 30s
        }
      );

      if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) throw new Error('No chart result');

      const meta = result.meta;
      const ltp = meta.regularMarketPrice ?? meta.previousClose;
      const prevClose = meta.chartPreviousClose ?? meta.previousClose;

      return {
        instrument: 'NIFTY',
        ltp: +ltp.toFixed(2),
        open: +(meta.regularMarketOpen ?? ltp).toFixed(2),
        high: +(meta.regularMarketDayHigh ?? ltp).toFixed(2),
        low: +(meta.regularMarketDayLow ?? ltp).toFixed(2),
        prevClose: +prevClose.toFixed(2),
        change: +(ltp - prevClose).toFixed(2),
        changePct: +(((ltp - prevClose) / prevClose) * 100).toFixed(2),
        volume: meta.regularMarketVolume,
        vwap: undefined, // Yahoo doesn't provide VWAP directly
        timestamp: new Date(meta.regularMarketTime * 1000),
        provider: 'yahoo',
        isMock: false,
      };
    } catch (err) {
      console.warn('[YahooProvider] getNiftyQuote failed, falling back to mock:', err);
      const mockData = await this.mock.getNiftyQuote();
      return { ...mockData, provider: 'yahoo-fallback' };
    }
  }

  async getOptionChain(expiry?: string): Promise<OptionChain> {
    // Yahoo Finance doesn't provide NIFTY options chain directly
    // Fall back to mock with a note
    console.info('[YahooProvider] Option chain: using mock (Yahoo does not provide NIFTY options)');
    const chain = await this.mock.getOptionChain(expiry);
    return { ...chain, provider: 'yahoo-mock-chain' };
  }

  async getExpiries(): Promise<string[]> {
    return this.mock.getExpiries();
  }

  async getHistoricalData(timeframe: string, limit: number): Promise<OHLCCandle[]> {
    try {
      const intervalMap: Record<string, string> = {
        '1m': '1m', '3m': '2m', '5m': '5m',
        '15m': '15m', '30m': '30m', '1H': '60m', '1D': '1d',
      };
      const rangeMap: Record<string, string> = {
        '1m': '1d', '3m': '1d', '5m': '5d',
        '15m': '5d', '30m': '5d', '1H': '1mo', '1D': '3mo',
      };

      const yInterval = intervalMap[timeframe] || '5m';
      const yRange = rangeMap[timeframe] || '5d';

      const res = await fetch(
        `${YAHOO_BASE}/chart/${NIFTY_SYMBOL}?interval=${yInterval}&range=${yRange}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
          next: { revalidate: 60 },
        }
      );

      if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) throw new Error('No chart result');

      const timestamps: number[] = result.timestamp || [];
      const ohlcv = result.indicators?.quote?.[0] || {};
      const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];

      const candles: OHLCCandle[] = timestamps
        .slice(-limit)
        .map((ts, i) => ({
          timestamp: new Date(ts * 1000),
          open: +(ohlcv.open?.[i] ?? 0).toFixed(2),
          high: +(ohlcv.high?.[i] ?? 0).toFixed(2),
          low: +(ohlcv.low?.[i] ?? 0).toFixed(2),
          close: +(ohlcv.close?.[i] ?? adjclose[i] ?? 0).toFixed(2),
          volume: ohlcv.volume?.[i] ?? 0,
        }))
        .filter((c) => c.close > 0);

      return candles;
    } catch (err) {
      console.warn('[YahooProvider] getHistoricalData failed, falling back to mock:', err);
      return this.mock.getHistoricalData(timeframe, limit);
    }
  }

  async getMarketStatus(): Promise<MarketStatus> {
    return getMarketStatus();
  }

  async getOptionQuote(strike: number, optionType: 'CE' | 'PE', expiry: string) {
    return this.mock.getOptionQuote(strike, optionType, expiry);
  }
}
