'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Home, Zap, List, BarChart2, Settings,
  RefreshCw, Wifi, WifiOff, TrendingUp, TrendingDown,
  Minus, AlertTriangle, ChevronUp, ChevronDown,
  Target, Shield, Clock, Activity, Info, X,
  CheckCircle, XCircle, Circle
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────
interface Quote {
  ltp: number; open: number; high: number; low: number;
  prevClose: number; change: number; changePct: number;
  volume?: number; vwap?: number; timestamp: string;
  dataAge: number; isStale: boolean; providerStatus: string;
  marketStatus: { isOpen: boolean; session: string };
  isMock?: boolean;
}

interface Signal {
  id?: string;
  signalType: 'CALL_BUY' | 'PUT_BUY' | 'NO_TRADE' | 'WATCH';
  status: string;
  strike: number; optionType: string | null; expiry: string;
  niftyPrice: number; entryLow: number; entryHigh: number;
  entryTrigger: string; sl: number; slReason: string;
  target1: number; target2: number; rrRatio: number;
  signalScore: number; confidence: number;
  regime: string; trendDirection: string;
  technicalReason: string; oiReason: string; chainReason: string;
  noTradeReason?: string; createdAt: string;
  scoreBreakdown?: Record<string, number>;
}

interface ChainRow {
  strike: number; isAtm: boolean;
  ceLtp?: number; ceOi?: number; ceIv?: number; ceOiChange?: number;
  peLtp?: number; peOi?: number; peIv?: number; peOiChange?: number;
}

interface Chain {
  expiry: string; atmStrike: number; pcr?: number; maxPain?: number;
  callWall?: number; putWall?: number;
  rows: ChainRow[]; isMock?: boolean;
  providerStatus?: string;
}

interface Candle {
  timestamp: string; open: number; high: number; low: number;
  close: number; volume: number; vwap?: number;
}

interface Indicators {
  ema9?: number; ema20?: number; ema50?: number; vwap?: number;
  rsi14?: number; macd?: number; macdHist?: number;
  atr14?: number; supertrend?: number; supertrendDirection?: string;
}

// ── Helpers ────────────────────────────────────────────────────
function fmt(n?: number, d = 2) {
  if (n == null) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtOI(n?: number) {
  if (n == null) return '—';
  if (n >= 1e7) return (n / 1e7).toFixed(1) + 'Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(1) + 'L';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toString();
}
function timeSince(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Kolkata', hour12: false
  });
}

// ── Score colour ─────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 85) return '#10b981';
  if (s >= 70) return '#f59e0b';
  return '#f43f5e';
}

// ── Signal status config ──────────────────────────────────────
function statusConfig(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    WATCH:             { label: '👀 Watch',            color: '#38bdf8',  bg: 'rgba(56,189,248,0.1)' },
    WAITING_FOR_ENTRY: { label: '⏳ Waiting Entry',    color: '#f59e0b',  bg: 'rgba(245,158,11,0.1)' },
    ENTRY_TRIGGERED:   { label: '🚀 Entry Triggered',  color: '#10b981',  bg: 'rgba(16,185,129,0.15)' },
    POSITION_ACTIVE:   { label: '📈 Position Active',  color: '#10b981',  bg: 'rgba(16,185,129,0.1)' },
    TARGET1_HIT:       { label: '🎯 Target 1 Hit',     color: '#10b981',  bg: 'rgba(16,185,129,0.15)' },
    TARGET2_HIT:       { label: '🎯 Target 2 Hit',     color: '#10b981',  bg: 'rgba(16,185,129,0.2)' },
    TRAILING_SL:       { label: '🔄 Trailing SL',      color: '#a78bfa',  bg: 'rgba(167,139,250,0.1)' },
    SL_HIT:            { label: '🚨 SL Hit',           color: '#f43f5e',  bg: 'rgba(244,63,94,0.15)' },
    EXIT:              { label: '🏁 Exited',           color: '#94a3b8',  bg: 'rgba(148,163,184,0.1)' },
    INVALIDATED:       { label: '❌ Invalidated',      color: '#f43f5e',  bg: 'rgba(244,63,94,0.1)' },
    NO_TRADE:          { label: '⛔ No Trade',         color: '#64748b',  bg: 'rgba(100,116,139,0.1)' },
    MARKET_CLOSED:     { label: '🌙 Market Closed',   color: '#64748b',  bg: 'rgba(100,116,139,0.1)' },
    DATA_UNAVAILABLE:  { label: '⚠️ Data Unavailable', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  };
  return map[status] ?? { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
}

// ═══════════════════════════════════════════════════════════════
// HOME TAB
// ═══════════════════════════════════════════════════════════════
function HomeTab({ quote, signal, chain, candles, indicators, loading, onRefresh, todaySignals }: {
  quote: Quote | null; signal: Signal | null; chain: Chain | null;
  candles: Candle[]; indicators: Indicators; loading: boolean;
  onRefresh: () => void; todaySignals: Signal[];
}) {
  return (
    <div className="animate-fade-in">
      {/* ── NIFTY Hero ─────────────────────────────── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '4px' }}>
                NIFTY 50
              </div>
              {loading && !quote ? (
                <div className="skeleton" style={{ width: 160, height: 40, marginBottom: 8 }} />
              ) : (
                <div className="price-display" style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {quote ? fmt(quote.ltp, 2) : '—'}
                </div>
              )}
              {quote && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <span className={`price-display`} style={{
                    fontSize: '14px', fontWeight: 700,
                    color: quote.change >= 0 ? 'var(--emerald)' : 'var(--rose)'
                  }}>
                    {quote.change >= 0 ? '+' : ''}{fmt(quote.change)} ({quote.changePct >= 0 ? '+' : ''}{fmt(quote.changePct, 2)}%)
                  </span>
                  {quote.change >= 0
                    ? <TrendingUp size={16} color="var(--emerald)" />
                    : <TrendingDown size={16} color="var(--rose)" />
                  }
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              <button onClick={onRefresh} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px', color: 'var(--text-secondary)' }}>
                <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              {quote && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                    {quote.marketStatus.isOpen
                      ? <><span className="live-dot" /><span style={{ fontSize: '10px', color: 'var(--emerald)', fontWeight: 700 }}>LIVE</span></>
                      : <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>CLOSED</span>
                    }
                  </div>
                  {quote.isStale && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <AlertTriangle size={10} color="var(--amber)" />
                      <span style={{ fontSize: '10px', color: 'var(--amber)', fontWeight: 600 }}>DELAYED</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* OHLV strip */}
          {quote && (
            <div style={{ display: 'flex', gap: '0', marginTop: '12px', background: 'var(--bg-surface)', borderRadius: '10px', overflow: 'hidden' }}>
              {[
                { label: 'O', val: quote.open, color: 'var(--text-secondary)' },
                { label: 'H', val: quote.high, color: 'var(--emerald)' },
                { label: 'L', val: quote.low, color: 'var(--rose)' },
                { label: 'PC', val: quote.prevClose, color: 'var(--text-secondary)' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ flex: 1, padding: '8px 6px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</div>
                  <div className="price-display" style={{ fontSize: '12px', fontWeight: 600, color, marginTop: '2px' }}>{fmt(val, 0)}</div>
                </div>
              ))}
              {quote.vwap && (
                <div style={{ flex: 1, padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>VWAP</div>
                  <div className="price-display" style={{ fontSize: '12px', fontWeight: 600, color: '#a78bfa', marginTop: '2px' }}>{fmt(quote.vwap, 0)}</div>
                </div>
              )}
            </div>
          )}

          {/* Timestamp */}
          {quote && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {formatTime(quote.timestamp)} IST
              </span>
              <span className={`badge ${quote.providerStatus === 'MOCK' ? 'badge-mock' : 'badge-live'}`}>
                {quote.providerStatus === 'MOCK' ? '🎭 DEMO' : '📡 LIVE'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Current Signal Card ────────────────────── */}
      {signal && <SignalCard signal={signal} compact={false} />}

      {/* ── Indicators Strip ──────────────────────── */}
      {indicators.rsi14 && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '10px' }}>TECHNICAL INDICATORS</div>
            <div className="scroll-x">
              <div style={{ display: 'flex', gap: '16px', minWidth: 'max-content' }}>
                {[
                  { label: 'RSI(14)', val: indicators.rsi14?.toFixed(1), color: indicators.rsi14! > 60 ? 'var(--emerald)' : indicators.rsi14! < 40 ? 'var(--rose)' : 'var(--amber)' },
                  { label: 'EMA9', val: indicators.ema9 ? fmt(indicators.ema9, 0) : '—', color: 'var(--text-secondary)' },
                  { label: 'EMA20', val: indicators.ema20 ? fmt(indicators.ema20, 0) : '—', color: 'var(--text-secondary)' },
                  { label: 'MACD', val: indicators.macdHist != null ? (indicators.macdHist > 0 ? '+' : '') + indicators.macdHist?.toFixed(1) : '—', color: indicators.macdHist! >= 0 ? 'var(--emerald)' : 'var(--rose)' },
                  { label: 'ATR(14)', val: indicators.atr14?.toFixed(1), color: 'var(--text-secondary)' },
                  { label: 'SUPERTREND', val: indicators.supertrendDirection, color: indicators.supertrendDirection === 'BULLISH' ? 'var(--emerald)' : 'var(--rose)' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign: 'center', minWidth: 56 }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</div>
                    <div className="price-display" style={{ fontSize: '13px', fontWeight: 700, color, marginTop: '2px' }}>{val ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Today's Timeline ──────────────────────── */}
      {todaySignals.length > 0 && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '10px' }}>TODAY'S SIGNALS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {todaySignals.slice(0, 5).map((s, i) => (
              <TimelineItem key={i} signal={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL CARD COMPONENT
// ═══════════════════════════════════════════════════════════════
function SignalCard({ signal, compact }: { signal: Signal; compact: boolean }) {
  const [showScore, setShowScore] = useState(false);
  const isTrade = signal.signalType !== 'NO_TRADE';
  const isCall = signal.signalType === 'CALL_BUY';
  const sc = statusConfig(signal.status);

  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div
        className={`card ${isTrade ? (isCall ? 'signal-call' : 'signal-put') : 'signal-no-trade'} ${isTrade ? (isCall ? 'glow-emerald' : 'glow-rose') : ''}`}
        style={{ padding: '16px' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: isTrade ? (isCall ? 'var(--emerald)' : 'var(--rose)') : 'var(--text-muted)', letterSpacing: '-0.02em' }}>
              {isTrade ? (isCall ? '🟢 CALL BUY' : '🔴 PUT BUY') : '⛔ NO TRADE'}
            </div>
            {isTrade && (
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                NIFTY {signal.strike} {signal.optionType}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{
              background: sc.bg, color: sc.color, fontSize: '10px', fontWeight: 700,
              padding: '4px 8px', borderRadius: '8px', border: `1px solid ${sc.color}33`,
              letterSpacing: '0.04em'
            }}>
              {sc.label}
            </div>
            {isTrade && (
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right' }}>
                Exp: {signal.expiry}
              </div>
            )}
          </div>
        </div>

        {/* No trade reason */}
        {!isTrade && signal.noTradeReason && (
          <div style={{ background: 'rgba(100,116,139,0.1)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>REASON</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{signal.noTradeReason}</div>
          </div>
        )}

        {/* Trade parameters */}
        {isTrade && (
          <>
            {/* Entry / SL / Targets */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '4px' }}>ENTRY ZONE</div>
                <div className="price-display" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹{fmt(signal.entryLow, 0)} – ₹{fmt(signal.entryHigh, 0)}
                </div>
              </div>
              <div style={{ background: 'rgba(244,63,94,0.15)', borderRadius: '10px', padding: '10px', border: '1px solid rgba(244,63,94,0.2)' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--rose)', letterSpacing: '0.08em', marginBottom: '4px' }}>STOP LOSS</div>
                <div className="price-display" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--rose)' }}>₹{fmt(signal.sl, 0)}</div>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: '10px', padding: '10px', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--emerald)', letterSpacing: '0.08em', marginBottom: '4px' }}>TARGET 1</div>
                <div className="price-display" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--emerald)' }}>₹{fmt(signal.target1, 0)}</div>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.15)', borderRadius: '10px', padding: '10px', border: '1px solid rgba(16,185,129,0.3)' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--emerald)', letterSpacing: '0.08em', marginBottom: '4px' }}>TARGET 2</div>
                <div className="price-display" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--emerald)' }}>₹{fmt(signal.target2, 0)}</div>
              </div>
            </div>

            {/* R:R / Score / Confidence */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {[
                { label: 'R:R', val: `1 : ${signal.rrRatio}`, color: 'var(--sky)' },
                { label: 'SCORE', val: `${signal.signalScore}/100`, color: scoreColor(signal.signalScore) },
                { label: 'CONFIDENCE', val: `${signal.confidence}%`, color: scoreColor(signal.confidence) },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</div>
                  <div className="price-display" style={{ fontSize: '13px', fontWeight: 800, color }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Score breakdown button */}
            <button onClick={() => setShowScore(!showScore)} style={{
              width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', padding: '8px 12px', color: 'var(--text-secondary)',
              fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: showScore ? '10px' : '0'
            }}>
              <span>📊 Score Breakdown</span>
              {showScore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showScore && signal.scoreBreakdown && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(signal.scoreBreakdown)
                  .filter(([k]) => k !== 'total')
                  .map(([component, score]) => {
                    const maxMap: Record<string, number> = {
                      trend: 20, priceAction: 15, vwap: 10, momentum: 10,
                      volume: 10, optionChain: 15, oi: 10, volatility: 5, liquidity: 5
                    };
                    const max = maxMap[component] ?? 10;
                    const pct = Math.round((score / max) * 100);
                    const label = component.replace(/([A-Z])/g, ' $1').toUpperCase();
                    return (
                      <div key={component}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: scoreColor(pct) }}>{score}/{max}</span>
                        </div>
                        <div className="score-bar-track">
                          <div className="score-bar-fill" style={{ width: `${pct}%`, background: scoreColor(pct) }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Entry trigger */}
            {signal.entryTrigger && (
              <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '8px 10px' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>TRIGGER: </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{signal.entryTrigger}</span>
              </div>
            )}
          </>
        )}

        {/* Why this signal */}
        {isTrade && signal.technicalReason && (
          <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '6px' }}>WHY THIS SIGNAL</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{signal.technicalReason}</div>
            {signal.oiReason && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{signal.oiReason}</div>
            )}
          </div>
        )}

        <div style={{ marginTop: '8px', fontSize: '9px', color: 'var(--text-muted)', textAlign: 'right' }}>
          {timeSince(signal.createdAt)}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TIMELINE ITEM
// ═══════════════════════════════════════════════════════════════
function TimelineItem({ signal }: { signal: Signal }) {
  const sc = statusConfig(signal.status);
  const isCall = signal.signalType === 'CALL_BUY';
  return (
    <div className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '32px', textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {formatTime(signal.createdAt).slice(0, 5)}
        </div>
      </div>
      <div style={{ width: '3px', height: '32px', borderRadius: '2px', background: signal.signalType === 'NO_TRADE' ? 'var(--border)' : isCall ? 'var(--emerald)' : 'var(--rose)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {signal.signalType === 'NO_TRADE' ? 'NO TRADE' : `${isCall ? '🟢' : '🔴'} ${signal.signalType === 'CALL_BUY' ? 'CALL' : 'PUT'} ${signal.strike} ${signal.optionType}`}
        </div>
        {signal.signalType !== 'NO_TRADE' && (
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            Entry ₹{fmt(signal.entryLow, 0)} · SL ₹{fmt(signal.sl, 0)} · T1 ₹{fmt(signal.target1, 0)}
          </div>
        )}
        {signal.noTradeReason && (
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {signal.noTradeReason.slice(0, 60)}…
          </div>
        )}
      </div>
      <div style={{ fontSize: '10px', fontWeight: 700, color: sc.color, flexShrink: 0 }}>
        {sc.label.split(' ').slice(1).join(' ')}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SIGNALS TAB
// ═══════════════════════════════════════════════════════════════
function SignalsTab({ signal, todaySignals, loading }: { signal: Signal | null; todaySignals: Signal[]; loading: boolean }) {
  const trades = todaySignals.filter(s => s.signalType !== 'NO_TRADE');
  const noTrades = todaySignals.filter(s => s.signalType === 'NO_TRADE');

  return (
    <div className="animate-fade-in" style={{ padding: '16px' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Signals</div>

      {/* Current signal */}
      {signal && signal.signalType !== 'NO_TRADE' && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>CURRENT SIGNAL</div>
          <SignalCard signal={signal} compact={false} />
        </>
      )}

      {/* Today's trades */}
      {trades.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '8px' }}>TODAY'S SETUPS ({trades.length})</div>
          {trades.map((s, i) => <TimelineItem key={i} signal={s} />)}
        </>
      )}

      {/* No-trade log */}
      {noTrades.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '16px' }}>NO-TRADE LOG ({noTrades.length})</div>
          <div className="card" style={{ padding: '12px' }}>
            {noTrades.map((s, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < noTrades.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>{formatTime(s.createdAt).slice(0, 5)}</span>
                  <span style={{ fontSize: '10px', color: 'var(--rose)' }}>Score: {s.signalScore}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{s.noTradeReason?.slice(0, 100)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {loading && todaySignals.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
        </div>
      )}

      {!loading && todaySignals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>No signals yet today</div>
          <div style={{ fontSize: '13px' }}>Signals will appear here during market hours</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OPTION CHAIN TAB
// ═══════════════════════════════════════════════════════════════
function ChainTab({ chain, loading }: { chain: Chain | null; loading: boolean }) {
  if (loading && !chain) return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />)}
    </div>
  );

  if (!chain) return null;

  const maxOI = Math.max(...chain.rows.map(r => Math.max(r.ceOi || 0, r.peOi || 0)));

  return (
    <div className="animate-fade-in" style={{ padding: '16px' }}>
      {/* Chain header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>Option Chain</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Expiry: {chain.expiry}</div>
        </div>
        <span className={`badge ${chain.providerStatus === 'MOCK' ? 'badge-mock' : 'badge-live'}`}>
          {chain.providerStatus === 'MOCK' ? '🎭 DEMO' : '📡 LIVE'}
        </span>
      </div>

      {/* PCR / MaxPain strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
        {[
          { label: 'PCR', val: chain.pcr?.toFixed(2), color: chain.pcr && chain.pcr > 1.2 ? 'var(--emerald)' : chain.pcr && chain.pcr < 0.8 ? 'var(--rose)' : 'var(--amber)' },
          { label: 'MAX PAIN', val: chain.maxPain, color: 'var(--sky)' },
          { label: 'ATM', val: chain.atmStrike, color: 'var(--text-primary)' },
        ].map(({ label, val, color }) => (
          <div key={label} className="card" style={{ padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</div>
            <div className="price-display" style={{ fontSize: '15px', fontWeight: 800, color, marginTop: '3px' }}>{val ?? '—'}</div>
          </div>
        ))}
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: '4px', marginBottom: '6px', padding: '0 2px' }}>
        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--emerald)', letterSpacing: '0.06em', textAlign: 'left' }}>CALLS</div>
        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textAlign: 'center' }}>STRIKE</div>
        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--rose)', letterSpacing: '0.06em', textAlign: 'right' }}>PUTS</div>
      </div>

      {/* Strike rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {chain.rows.map((row) => {
          const ceBarW = maxOI > 0 ? Math.round(((row.ceOi || 0) / maxOI) * 100) : 0;
          const peBarW = maxOI > 0 ? Math.round(((row.peOi || 0) / maxOI) * 100) : 0;
          return (
            <div key={row.strike} style={{
              display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: '4px',
              background: row.isAtm ? 'rgba(245,158,11,0.08)' : 'var(--bg-card)',
              border: `1px solid ${row.isAtm ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
              borderRadius: '10px', padding: '8px',
              transition: 'background 0.15s'
            }}>
              {/* CE side */}
              <div style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <div className="price-display" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    ₹{fmt(row.ceLtp, 1)}
                  </div>
                  <div style={{ fontSize: '10px', color: (row.ceOiChange ?? 0) > 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                    {(row.ceOiChange ?? 0) > 0 ? '▲' : '▼'} {fmtOI(Math.abs(row.ceOiChange ?? 0))}
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>OI: {fmtOI(row.ceOi)}</div>
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                  <div className="oi-bar-ce" style={{ height: '100%', width: `${ceBarW}%`, borderRadius: 2 }} />
                </div>
              </div>

              {/* Strike */}
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: row.isAtm ? 'var(--amber)' : 'var(--text-secondary)' }}>{row.strike}</div>
                {row.isAtm && <div style={{ fontSize: '8px', color: 'var(--amber)', fontWeight: 700, letterSpacing: '0.06em' }}>ATM</div>}
              </div>

              {/* PE side */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <div style={{ fontSize: '10px', color: (row.peOiChange ?? 0) > 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                    {(row.peOiChange ?? 0) > 0 ? '▲' : '▼'} {fmtOI(Math.abs(row.peOiChange ?? 0))}
                  </div>
                  <div className="price-display" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    ₹{fmt(row.peLtp, 1)}
                  </div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>OI: {fmtOI(row.peOi)}</div>
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, direction: 'rtl' }}>
                  <div className="oi-bar-pe" style={{ height: '100%', width: `${peBarW}%`, borderRadius: 2 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HISTORY TAB
// ═══════════════════════════════════════════════════════════════
function HistoryTab({ todaySignals }: { todaySignals: Signal[] }) {
  const trades = todaySignals.filter(s => s.signalType !== 'NO_TRADE');
  const triggered = trades.filter(s => !['WATCH', 'WAITING_FOR_ENTRY'].includes(s.status));
  const t1 = trades.filter(s => ['TARGET1_HIT', 'TARGET2_HIT', 'TRAILING_SL'].includes(s.status)).length;
  const sl = trades.filter(s => s.status === 'SL_HIT').length;
  const winRate = triggered.length > 0 ? Math.round((t1 / triggered.length) * 100) : null;

  return (
    <div className="animate-fade-in" style={{ padding: '16px' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>History</div>

      {/* Daily stats */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>TODAY'S PERFORMANCE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            { label: 'SIGNALS', val: trades.length, color: 'var(--text-primary)' },
            { label: 'TRIGGERED', val: triggered.length, color: 'var(--sky)' },
            { label: 'WIN RATE', val: winRate != null ? `${winRate}%` : '—', color: winRate != null && winRate >= 50 ? 'var(--emerald)' : 'var(--rose)' },
            { label: 'TARGET HIT', val: t1, color: 'var(--emerald)' },
            { label: 'SL HIT', val: sl, color: 'var(--rose)' },
            { label: 'NO TRADE', val: todaySignals.filter(s => s.signalType === 'NO_TRADE').length, color: 'var(--text-muted)' },
          ].map(({ label, val, color }) => (
            <div key={label} className="card" style={{ padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</div>
              <div className="price-display" style={{ fontSize: '20px', fontWeight: 800, color, marginTop: '4px' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Signal journal */}
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>SIGNAL JOURNAL</div>
      {todaySignals.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {todaySignals.map((s, i) => <TimelineItem key={i} signal={s} />)}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>📅</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>No data for today</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Signals appear here as they are generated</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════
function SettingsTab() {
  return (
    <div className="animate-fade-in" style={{ padding: '16px' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Settings</div>

      {/* Risk */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>RISK MANAGEMENT</div>
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { label: 'Capital', val: '₹1,00,000', desc: 'Virtual trading capital' },
            { label: 'Risk per trade', val: '1%', desc: 'Max ₹1,000 per signal' },
            { label: 'Max daily loss', val: '3%', desc: 'Max ₹3,000 per day' },
            { label: 'Max trades / day', val: '3', desc: 'Signal frequency limit' },
          ].map(({ label, val, desc }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{desc}</div>
              </div>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: 700, color: 'var(--emerald)' }}>
                {val}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strategy */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>STRATEGY</div>
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { label: 'Min signal score', val: '75 / 100' },
            { label: 'Min Risk:Reward', val: '1 : 1.5' },
            { label: 'Strategy version', val: 'NIFTY-V1.0' },
            { label: 'Time filter', val: '09:20 – 15:00' },
          ].map(({ label, val }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>NOTIFICATIONS</div>
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { label: 'New signal', enabled: true },
            { label: 'Entry triggered', enabled: true },
            { label: 'Stop loss hit', enabled: true },
            { label: 'Target 1 hit', enabled: true },
            { label: 'Target 2 hit', enabled: true },
            { label: 'Daily summary', enabled: true },
          ].map(({ label, enabled }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
              <div style={{
                width: 44, height: 24, borderRadius: 12,
                background: enabled ? 'var(--emerald)' : 'var(--border)',
                position: 'relative', cursor: 'pointer'
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: enabled ? 22 : 2,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s'
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="card" style={{ padding: '14px', background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.2)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--rose)', marginBottom: '6px', letterSpacing: '0.06em' }}>⚠️ DISCLAIMER</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          OptionPulse is a market analysis tool only. It does NOT place any real trades. All signals are for informational purposes. Never trade with money you cannot afford to lose. Past performance does not guarantee future results.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BOTTOM NAVIGATION
// ═══════════════════════════════════════════════════════════════
function BottomNav({ active, onChange }: { active: string; onChange: (tab: string) => void }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: <Home size={22} /> },
    { id: 'signals', label: 'Signals', icon: <Zap size={22} /> },
    { id: 'chain', label: 'Chain', icon: <List size={22} /> },
    { id: 'history', label: 'History', icon: <BarChart2 size={22} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={22} /> },
  ];
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <button key={t.id} className={`nav-item ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState('home');
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [indicators, setIndicators] = useState<Indicators>({});
  const [todaySignals, setTodaySignals] = useState<Signal[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [quoteRes, signalRes, chainRes, chartRes] = await Promise.allSettled([
        fetch('/api/market/quote'),
        fetch('/api/signals'),
        fetch('/api/market/option-chain'),
        fetch('/api/market/chart?timeframe=5m&limit=80'),
      ]);

      if (quoteRes.status === 'fulfilled' && quoteRes.value.ok) {
        const d = await quoteRes.value.json();
        if (d.success) setQuote(d.data);
      }

      if (signalRes.status === 'fulfilled' && signalRes.value.ok) {
        const d = await signalRes.value.json();
        if (d.success) {
          setSignal(d.data.currentSignal);
          setTodaySignals(d.data.todaySignals || []);
          setIsMock(d.data.isMockData);
        }
      }

      if (chainRes.status === 'fulfilled' && chainRes.value.ok) {
        const d = await chainRes.value.json();
        if (d.success) setChain(d.data);
      }

      if (chartRes.status === 'fulfilled' && chartRes.value.ok) {
        const d = await chartRes.value.json();
        if (d.success) {
          setCandles(d.data.candles || []);
          setIndicators(d.data.indicators || {});
        }
      }

      setLastUpdate(new Date().toISOString());
    } catch (err) {
      console.error('[fetchAll]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return (
    <>
      {/* Demo banner */}
      {isMock && (
        <div className="demo-banner">🎭 DEMO DATA — Connect a real market data provider for live signals</div>
      )}

      {/* Main content */}
      <main id="main-content">
        {tab === 'home' && (
          <HomeTab
            quote={quote} signal={signal} chain={chain}
            candles={candles} indicators={indicators}
            loading={loading} onRefresh={fetchAll}
            todaySignals={todaySignals}
          />
        )}
        {tab === 'signals' && (
          <SignalsTab signal={signal} todaySignals={todaySignals} loading={loading} />
        )}
        {tab === 'chain' && (
          <ChainTab chain={chain} loading={loading} />
        )}
        {tab === 'history' && (
          <HistoryTab todaySignals={todaySignals} />
        )}
        {tab === 'settings' && <SettingsTab />}
      </main>

      {/* Bottom Nav */}
      <BottomNav active={tab} onChange={setTab} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
