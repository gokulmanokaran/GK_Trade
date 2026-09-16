// ============================================================
// Market Data Provider Factory
// Priority: Upstox Real-Time → Yahoo Finance (Secondary) → Mock (if explicitly forced)
// ============================================================

import type { MarketDataProvider } from './types';
import { UpstoxProvider } from './upstox-provider';
import { YahooFinanceProvider } from './yahoo-provider';
import { MockMarketDataProvider } from './mock-provider';

let _provider: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (_provider) return _provider;

  const upstoxToken = (process.env.UPSTOX_ANALYTICS_TOKEN || '').trim();
  const forceMock = process.env.FORCE_MOCK_DATA === 'true';

  if (forceMock) {
    _provider = new MockMarketDataProvider();
  } else if (upstoxToken.length > 5) {
    _provider = new UpstoxProvider(upstoxToken);
  } else {
    _provider = new YahooFinanceProvider();
  }

  return _provider;
}

export { UpstoxProvider, YahooFinanceProvider, MockMarketDataProvider };
