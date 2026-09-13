// ============================================================
// Market Data Types — OptionPulse v2
// ============================================================

export interface NiftyQuote {
  instrument: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume?: number;
  vwap?: number;
  timestamp: Date;
  provider: string;
  isMock: boolean;
}

export interface OptionChainRow {
  strike: number;
  ceLtp?: number;
  ceOi?: number;
  ceOiChange?: number;
  ceVolume?: number;
  ceIv?: number;
  ceDelta?: number;
  ceGamma?: number;
  ceTheta?: number;
  ceVega?: number;
  ceBid?: number;
  ceAsk?: number;
  peLtp?: number;
  peOi?: number;
  peOiChange?: number;
  peVolume?: number;
  peIv?: number;
  peDelta?: number;
  peGamma?: number;
  peTheta?: number;
  peVega?: number;
  peBid?: number;
  peAsk?: number;
  isAtm: boolean;
}

export interface OptionChain {
  instrument: string;
  expiry: string; // YYYY-MM-DD
  underlyingLtp: number;
  atmStrike: number;
  pcr?: number;
  maxPain?: number;
  totalCallOi?: number;
  totalPutOi?: number;
  rows: OptionChainRow[];
  timestamp: Date;
  provider: string;
  isMock: boolean;
}

export interface OHLCCandle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export interface MarketStatus {
  isOpen: boolean;
  session: 'PRE_OPEN' | 'OPEN' | 'POST_CLOSE' | 'CLOSED' | 'HOLIDAY' | 'CLOSED_WEEKEND' | 'CLOSED_HOLIDAY';
  holidayName?: string;
  nextOpenAt?: Date;
  nextCloseAt?: Date;
  timestamp: Date;
}

export interface DataFreshness {
  timestamp: Date;
  ageSeconds: number;
  isStale: boolean; // > 30 seconds during market hours
  provider: string;
  status: 'LIVE' | 'DELAYED' | 'MOCK' | 'ERROR';
}

// Provider interface — replaceable
export interface MarketDataProvider {
  name: string;
  getNiftyQuote(): Promise<NiftyQuote>;
  getOptionChain(expiry?: string): Promise<OptionChain>;
  getExpiries(): Promise<string[]>;
  getHistoricalData(timeframe: string, limit: number): Promise<OHLCCandle[]>;
  getMarketStatus(): Promise<MarketStatus>;
  getOptionQuote(strike: number, optionType: 'CE' | 'PE', expiry: string): Promise<Partial<OptionChainRow>>;
}

// Signal types
export type SignalType = 'CALL_BUY' | 'PUT_BUY' | 'NO_TRADE' | 'WATCH';
export type SignalStatus =
  | 'WATCH'
  | 'WAITING_FOR_ENTRY'
  | 'ENTRY_TRIGGERED'
  | 'POSITION_ACTIVE'
  | 'TARGET1_HIT'
  | 'TRAILING_SL'
  | 'TARGET2_HIT'
  | 'SL_HIT'
  | 'EXIT'
  | 'INVALIDATED'
  | 'NO_TRADE'
  | 'MARKET_CLOSED'
  | 'DATA_UNAVAILABLE';

export type MarketRegime =
  | 'TRENDING_BULLISH'
  | 'TRENDING_BEARISH'
  | 'SIDEWAYS'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'CHOPPY';

export interface SignalScoreBreakdown {
  trend: number;
  priceAction: number;
  vwap: number;
  momentum: number;
  volume: number;
  optionChain: number;
  oi: number;
  volatility: number;
  liquidity: number;
  total: number;
}

export interface GeneratedSignal {
  id?: string;
  instrument: string;
  signalType: SignalType;
  expiry: string;
  strike: number;
  optionType: 'CE' | 'PE' | null;
  niftyPrice: number;
  entryLow: number;
  entryHigh: number;
  entryTrigger: string;
  sl: number;
  slReason: string;
  target1: number;
  target2: number;
  rrRatio: number;
  signalScore: number;
  confidence: number;
  regime: MarketRegime;
  trendDirection: string;
  technicalReason: string;
  oiReason: string;
  chainReason: string;
  liquidityOk: boolean;
  noTradeReason?: string;
  status: SignalStatus;
  scoreBreakdown: SignalScoreBreakdown;
  createdAt: Date;
}

export interface OIBuildup {
  strike: number;
  optionType: 'CE' | 'PE';
  classification: 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'SHORT_COVERING' | 'LONG_UNWINDING';
  reason: string;
}
