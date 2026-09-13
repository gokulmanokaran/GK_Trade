// ============================================================
// Composite Market Data Provider
// Priority: Yahoo Finance → Mock
// ============================================================

import type { MarketDataProvider } from './types';
import { YahooFinanceProvider } from './yahoo-provider';
import { MockMarketDataProvider } from './mock-provider';

let _provider: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (_provider) return _provider;

  // Use mock if explicitly set via env, or if no real provider configured
  const useMock = process.env.FORCE_MOCK_DATA === 'true';
  _provider = useMock ? new MockMarketDataProvider() : new YahooFinanceProvider();
  return _provider;
}

export { MockMarketDataProvider, YahooFinanceProvider };
