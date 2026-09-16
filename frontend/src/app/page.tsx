'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Home, Zap, List, BarChart2, Settings,
  RefreshCw, Wifi, WifiOff, TrendingUp, TrendingDown,
  Minus, AlertTriangle, ChevronUp, ChevronDown,
  Target, Shield, Clock, Activity, Info, X,
  CheckCircle, XCircle, Circle, Trash2, Filter,
  Calendar, User, ChevronLeft, ChevronRight, Check,
  AlertCircle
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

interface ConfluenceSetup {
  state: string;
  rejectionReason?: string;
  orbHigh?: number;
  orbLow?: number;
  vwap?: number;
  confirmations?: Record<string, { status: string; detail?: string }>;
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
  confluenceSetup?: ConfluenceSetup;
  isDeleted?: boolean;
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
function fmt(n?: number | null, d = 2) {
  if (n == null || isNaN(n)) return '—';
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
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatTimeIST(iso: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true
    }).toUpperCase();
  } catch {
    return '—';
  }
}

function formatDateIST(iso: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
  } catch {
    return '—';
  }
}

// ── Score colour ─────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 80) return '#10b981';
  if (s >= 65) return '#f59e0b';
  return '#f43f5e';
}

// ── Signal status config ──────────────────────────────────────
function statusConfig(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    WATCH:             { label: '👀 Watch',            color: '#38bdf8',  bg: 'rgba(56,189,248,0.1)' },
    WAITING_FOR_ENTRY: { label: '⏳ Waiting Entry',    color: '#f59e0b',  bg: 'rgba(245,158,11,0.1)' },
    WAITING_FOR_RETEST:{ label: '🔄 Waiting Retest',   color: '#a78bfa',  bg: 'rgba(167,139,250,0.1)' },
    ENTRY_TRIGGERED:   { label: '🚀 Entry Triggered',  color: '#10b981',  bg: 'rgba(16,185,129,0.15)' },
    POSITION_ACTIVE:   { label: '📈 Position Active',  color: '#10b981',  bg: 'rgba(16,185,129,0.1)' },
    TARGET1_HIT:       { label: '🎯 Target 1 Hit',     color: '#10b981',  bg: 'rgba(16,185,129,0.15)' },
    TARGET2_HIT:       { label: '🎯 Target 2 Hit',     color: '#10b981',  bg: 'rgba(16,185,129,0.2)' },
    TRAILING_SL:       { label: '🔄 Trailing SL',      color: '#a78bfa',  bg: 'rgba(167,139,250,0.1)' },
    SL_HIT:            { label: '🚨 SL Hit',           color: '#f43f5e',  bg: 'rgba(244,63,94,0.15)' },
    EXIT:              { label: '🏁 Exited',           color: '#94a3b8',  bg: 'rgba(148,163,184,0.1)' },
    INVALIDATED:       { label: '❌ Invalidated',      color: '#f43f5e',  bg: 'rgba(244,63,94,0.1)' },
    NO_TRADE:          { label: '⛔ No Trade',         color: '#64748b',  bg: 'rgba(100,116,139,0.1)' },
    NO_SIGNAL:         { label: '⏳ No Signal / Wait', color: '#64748b',  bg: 'rgba(100,116,139,0.1)' },
    MARKET_CLOSED:     { label: '🌙 Market Closed',   color: '#64748b',  bg: 'rgba(100,116,139,0.1)' },
    DATA_UNAVAILABLE:  { label: '⚠️ Data Unavailable', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  };
  return map[status] ?? { label: status, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
}

// ═══════════════════════════════════════════════════════════════
// NO SIGNAL / WAIT CARD
// ═══════════════════════════════════════════════════════════════
function NoSignalCard({ signal, quote }: { signal: Signal | null; quote: Quote | null }) {
  const setup = signal?.confluenceSetup;
  const cfms = setup?.confirmations || {};
  const statusIcon = (s?: string) => {
    if (s === 'PASS')        return { icon: '✓', color: 'var(--emerald)' };
    if (s === 'FAIL')        return { icon: '✗', color: 'var(--rose)' };
    if (s === 'FAIL_CHOPPY') return { icon: '⚡', color: 'var(--rose)' };
    if (s === 'UNAVAILABLE') return { icon: '—', color: 'var(--amber)' };
    return                    { icon: '…', color: 'var(--text-muted)' };
  };

  const rows = [
    { key: 'vwap',           label: '1. VWAP Position', desc: 'Price above/below VWAP' },
    { key: 'ema20',          label: '2. 20 EMA Trend', desc: 'Slope & price alignment' },
    { key: 'orbBreakout',    label: '3. ORB Breakout', desc: '9:15-9:30 range break' },
    { key: 'candleStrength', label: '4. Candle Strength', desc: 'Body > 60%, rejection-free' },
    { key: 'volume',         label: '5. Volume Surge', desc: '> 1.2x 20-period average' },
    { key: 'retest',         label: '6. Retest & Rejection', desc: 'Breakout level hold' },
    { key: 'choppiness',     label: '7. Choppiness Filter', desc: 'CI < 61.8 & healthy ATR' },
  ];

  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div className="card signal-no-trade" style={{ padding: '16px', border: '1px solid rgba(148,163,184,0.15)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-secondary)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⏳ NO SIGNAL / WAIT</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              20-Rule Confluence Strategy Engine Active
            </div>
          </div>
          <div style={{
            background: 'rgba(100,116,139,0.15)', color: '#94a3b8', fontSize: '10px', fontWeight: 700,
            padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(148,163,184,0.2)',
            letterSpacing: '0.04em'
          }}>
            {setup?.state ? setup.state.replace(/_/g, ' ') : (quote?.marketStatus?.isOpen ? 'SCANNING' : 'MARKET CLOSED')}
          </div>
        </div>

        {/* Reason */}
        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '10px', padding: '12px', marginBottom: '14px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '4px' }}>CURRENT MARKET STATE</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {signal?.noTradeReason || setup?.rejectionReason || 'Monitoring live 5-minute candles. All 20 strategy conditions must pass simultaneously before an entry signal is generated.'}
          </div>
        </div>

        {/* Live Criteria Checklist */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>
            CONFLUENCE CONDITIONS CHECKLIST
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {rows.map(({ key, label }) => {
              const c = cfms[key] ?? {};
              const si = statusIcon(c.status);
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: si.color, fontWeight: 900, width: '14px', textAlign: 'center' }}>{si.icon}</span>
                    {label}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: si.color, letterSpacing: '0.04em' }}>
                    {c.status ?? 'PENDING'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Strategy Parameters Strip */}
        {(setup?.orbHigh || setup?.orbLow || setup?.vwap) && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            {setup.orbHigh && (
              <div style={{ flex: 1, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '8px', padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700 }}>ORB HIGH</div>
                <div className="price-display" style={{ fontSize: '12px', fontWeight: 800, color: 'var(--emerald)' }}>{setup.orbHigh.toFixed(1)}</div>
              </div>
            )}
            {setup.orbLow && (
              <div style={{ flex: 1, background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)', borderRadius: '8px', padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700 }}>ORB LOW</div>
                <div className="price-display" style={{ fontSize: '12px', fontWeight: 800, color: 'var(--rose)' }}>{setup.orbLow.toFixed(1)}</div>
              </div>
            )}
            {setup.vwap && (
              <div style={{ flex: 1, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '8px', padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700 }}>VWAP</div>
                <div className="price-display" style={{ fontSize: '12px', fontWeight: 800, color: '#a78bfa' }}>{setup.vwap.toFixed(1)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL CARD COMPONENT
// ═══════════════════════════════════════════════════════════════
function SignalCard({ signal, compact, onDelete }: { signal: Signal; compact?: boolean; onDelete?: (id: string) => void }) {
  const [showScore, setShowScore] = useState(false);
  const isTrade = signal.signalType === 'CALL_BUY' || signal.signalType === 'PUT_BUY';
  const isCall = signal.signalType === 'CALL_BUY';
  const sc = statusConfig(signal.status);

  if (!isTrade || !signal.entryLow || !signal.sl) {
    return null;
  }

  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div
        className={`card ${isCall ? 'signal-call' : 'signal-put'} ${isCall ? 'glow-emerald' : 'glow-rose'}`}
        style={{ padding: '16px' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: isCall ? 'var(--emerald)' : 'var(--rose)', letterSpacing: '-0.02em' }}>
              {isCall ? '🟢 CALL BUY' : '🔴 PUT BUY'}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
              NIFTY {signal.strike} {signal.optionType ?? (isCall ? 'CE' : 'PE')}
            </div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
            <div style={{
              background: sc.bg, color: sc.color, fontSize: '10px', fontWeight: 700,
              padding: '4px 8px', borderRadius: '8px', border: `1px solid ${sc.color}33`,
              letterSpacing: '0.04em'
            }}>
              {sc.label}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Exp: {signal.expiry || 'Current Weekly'}
            </div>
          </div>
        </div>

        {/* Trade parameters */}
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
            { label: 'R:R', val: `1 : ${signal.rrRatio || 1.5}`, color: 'var(--sky)' },
            { label: 'SCORE', val: `${signal.signalScore || 0}/100`, color: scoreColor(signal.signalScore || 0) },
            { label: 'CONFIDENCE', val: `${signal.confidence || 0}%`, color: scoreColor(signal.confidence || 0) },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</div>
              <div className="price-display" style={{ fontSize: '13px', fontWeight: 800, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Score breakdown toggle */}
        <button onClick={() => setShowScore(!showScore)} style={{
          width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '8px 12px', color: 'var(--text-secondary)',
          fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: showScore ? '10px' : '0'
        }}>
          <span>📊 20-Rule Confluence Breakdown</span>
          {showScore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showScore && signal.scoreBreakdown && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
            {Object.entries(signal.scoreBreakdown)
              .filter(([k]) => k !== 'total')
              .map(([component, score]) => {
                const maxMap: Record<string, number> = {
                  trend: 20, priceAction: 15, vwap: 10, momentum: 10,
                  volume: 10, optionChain: 15, oi: 10, volatility: 5, liquidity: 5
                };
                const max = maxMap[component] ?? 10;
                const pct = Math.round((Number(score) / max) * 100);
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

        {/* Technical Reason */}
        {signal.technicalReason && (
          <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '4px' }}>ANALYSIS AUDIT</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{signal.technicalReason}</div>
            {signal.oiReason && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{signal.oiReason}</div>
            )}
          </div>
        )}

        {/* Footer info & Delete */}
        <div style={{
          marginTop: '12px', padding: '8px 12px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={12} color="var(--text-muted)" />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Created:</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {formatTimeIST(signal.createdAt)}
            </span>
          </div>
          {onDelete && signal.id && (
            <button
              onClick={() => onDelete(signal.id!)}
              style={{
                background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)',
                borderRadius: '6px', color: 'var(--rose)', cursor: 'pointer',
                padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TIMELINE ITEM COMPONENT
// ═══════════════════════════════════════════════════════════════
function TimelineItem({
  signal,
  onDelete,
  deleting,
}: {
  signal: Signal;
  onDelete?: (s: Signal) => void;
  deleting?: string | null;
}) {
  const sc = statusConfig(signal.status);
  const isTrade = signal.signalType === 'CALL_BUY' || signal.signalType === 'PUT_BUY';
  const isCall = signal.signalType === 'CALL_BUY';

  return (
    <div className="card" style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ minWidth: '70px', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2 }}>
          {formatTimeIST(signal.createdAt)}
        </div>
        <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {timeSince(signal.createdAt)}
        </div>
      </div>
      <div style={{
        width: '3px', height: '36px', borderRadius: '2px',
        background: !isTrade ? 'var(--border)' : isCall ? 'var(--emerald)' : 'var(--rose)',
        flexShrink: 0
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {!isTrade ? 'NO TRADE' : `${isCall ? '🟢 CALL' : '🔴 PUT'} ${signal.strike} ${signal.optionType ?? ''}`}
        </div>
        {isTrade && signal.entryLow && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Entry ₹{fmt(signal.entryLow, 0)} · SL ₹{fmt(signal.sl, 0)} · T1 ₹{fmt(signal.target1, 0)}
          </div>
        )}
        {signal.noTradeReason && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
            {signal.noTradeReason.slice(0, 70)}…
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: sc.color, background: sc.bg, padding: '4px 8px', borderRadius: '6px' }}>
          {sc.label.split(' ').slice(1).join(' ') || sc.label}
        </div>
        {onDelete && signal.id && (
          <button
            onClick={() => onDelete(signal)}
            disabled={deleting === signal.id}
            title="Delete signal"
            style={{
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.25)',
              borderRadius: '6px',
              color: 'var(--rose)',
              cursor: 'pointer',
              padding: '5px 8px',
              fontSize: '12px',
              lineHeight: 1,
              opacity: deleting === signal.id ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOME TAB
// ═══════════════════════════════════════════════════════════════
function HomeTab({
  quote,
  signal,
  chain,
  candles,
  indicators,
  loading,
  onRefresh,
  todaySignals,
  missedSignals = [],
  onSelectTab,
  onDelete,
}: {
  quote: Quote | null;
  signal: Signal | null;
  chain: Chain | null;
  candles: Candle[];
  indicators: Indicators;
  loading: boolean;
  onRefresh: () => void;
  todaySignals: Signal[];
  missedSignals?: any[];
  onSelectTab: (tab: string) => void;
  onDelete: (id: string) => void;
}) {
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const isRealActiveTrade = signal && (signal.signalType === 'CALL_BUY' || signal.signalType === 'PUT_BUY') && (signal.status === 'ENTRY_TRIGGERED' || signal.status === 'POSITION_ACTIVE');

  return (
    <div className="animate-fade-in">
      {/* ── Missed Alerts Banner ─────────────────────── */}
      {missedSignals.length > 0 && !bannerDismissed && (
        <div style={{ margin: '16px 16px 0', padding: '12px 16px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--sky)', letterSpacing: '0.04em' }}>👋 WELCOME BACK</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              You missed {missedSignals.length} alert{missedSignals.length > 1 ? 's' : ''} today while away.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => onSelectTab('history')}
              style={{ background: 'var(--sky)', color: '#000', fontSize: '11px', fontWeight: 800, padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
            >
              Review
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── NIFTY Hero ─────────────────────────────── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '4px' }}>
                NIFTY 50 INDEX
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
                  <span className="price-display" style={{
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
              <button onClick={onRefresh} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              {quote && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                    {quote.marketStatus.isOpen
                      ? <><span className="live-dot" /><span style={{ fontSize: '10px', color: 'var(--emerald)', fontWeight: 700 }}>MARKET OPEN</span></>
                      : <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>MARKET CLOSED</span>
                    }
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--emerald)', fontWeight: 700, marginTop: '4px' }}>
                    🟢 UPSTOX LIVE
                  </div>
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
                {formatTimeIST(quote.timestamp)} IST
              </span>
              <span className="badge badge-live">
                📡 UPSTOX V2 LIVE
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Active Signal Card OR No-Signal Checklist ────────────────────── */}
      {isRealActiveTrade ? (
        <SignalCard signal={signal} compact={false} onDelete={onDelete} />
      ) : (
        <NoSignalCard signal={signal} quote={quote} />
      )}

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
              <TimelineItem key={s.id ?? i} signal={s} onDelete={(sig) => sig.id && onDelete(sig.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SIGNALS TAB
// ═══════════════════════════════════════════════════════════════
function SignalsTab({
  signal,
  todaySignals,
  loading,
  onDelete,
  quote,
}: {
  signal: Signal | null;
  todaySignals: Signal[];
  loading: boolean;
  onDelete: (id: string) => void;
  quote: Quote | null;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDel = async (s: Signal) => {
    if (!s.id) return;
    if (!window.confirm(`Delete this ${s.signalType === 'CALL_BUY' ? 'CALL' : s.signalType === 'PUT_BUY' ? 'PUT' : ''} signal?`)) return;
    setDeleting(s.id);
    await onDelete(s.id);
    setDeleting(null);
  };

  const trades = todaySignals.filter(s => s.signalType === 'CALL_BUY' || s.signalType === 'PUT_BUY');
  const noTrades = todaySignals.filter(s => s.signalType === 'NO_TRADE' || s.signalType === 'WATCH');
  const isRealActiveTrade = signal && (signal.signalType === 'CALL_BUY' || signal.signalType === 'PUT_BUY') && (signal.status === 'ENTRY_TRIGGERED' || signal.status === 'POSITION_ACTIVE');

  return (
    <div className="animate-fade-in" style={{ padding: '16px' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Active Signals & Setups</div>

      {/* Current Signal Card OR No-Signal Banner */}
      {isRealActiveTrade ? (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>CURRENT ACTIVE SIGNAL</div>
          <SignalCard signal={signal} compact={false} onDelete={onDelete} />
        </>
      ) : (
        <NoSignalCard signal={signal} quote={quote} />
      )}

      {/* Today's trades */}
      {trades.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '16px' }}>
            TODAY'S TRIGGERED SIGNALS ({trades.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {trades.map((s, i) => (
              <TimelineItem
                key={s.id ?? i}
                signal={s}
                onDelete={handleDel}
                deleting={deleting}
              />
            ))}
          </div>
        </>
      )}

      {/* No-trade log */}
      {noTrades.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '16px' }}>NO-TRADE & MONITORING LOG ({noTrades.length})</div>
          <div className="card" style={{ padding: '12px' }}>
            {noTrades.map((s, i) => (
              <div key={s.id ?? i} style={{ padding: '8px 0', borderBottom: i < noTrades.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {formatTimeIST(s.createdAt)}
                      </span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                        ({timeSince(s.createdAt)})
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--rose)' }}>Score: {s.signalScore || 0}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{s.noTradeReason?.slice(0, 100) || 'Conditions pending'}</div>
                </div>
                {s.id && (
                  <button
                    onClick={() => handleDel(s)}
                    disabled={deleting === s.id}
                    title="Delete log"
                    style={{
                      background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)',
                      borderRadius: '6px', color: 'var(--rose)', cursor: 'pointer',
                      padding: '4px 6px', fontSize: '11px',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {loading && todaySignals.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
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

  const maxOI = Math.max(...chain.rows.map(r => Math.max(r.ceOi || 0, r.peOi || 0)), 1);

  return (
    <div className="animate-fade-in" style={{ padding: '16px' }}>
      {/* Chain header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>NIFTY Option Chain</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Expiry: {chain.expiry}</div>
        </div>
        <span className="badge badge-live">
          📡 UPSTOX LIVE
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
// HISTORY TAB (COMPLETE DATABASE-BACKED AUDIT & PAGINATION)
// ═══════════════════════════════════════════════════════════════
function HistoryTab({
  userId,
  onDeleteSignal,
}: {
  userId: string;
  onDeleteSignal: (id: string) => Promise<void>;
}) {
  const [historySignals, setHistorySignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<string>('all');
  const [signalType, setSignalType] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [pagination, setPagination] = useState<{ total: number; page: number; limit: number; totalPages: number }>({
    total: 0, page: 1, limit: 15, totalPages: 1
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        dateRange,
        signalType,
      });

      const res = await fetch(`/api/signals/history?${params.toString()}`, {
        headers: { 'x-user-id': userId }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setHistorySignals(data.signals || []);
          setPagination(data.pagination || { total: 0, page: 1, limit: 15, totalPages: 1 });
          setStats(data.stats || null);
        }
      }
    } catch (err) {
      console.error('[fetchHistory error]', err);
    } finally {
      setLoading(false);
    }
  }, [page, dateRange, signalType, userId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this signal from history?')) return;
    setDeletingId(id);
    await onDeleteSignal(id);
    setDeletingId(null);
    fetchHistory();
  };

  return (
    <div className="animate-fade-in" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>Signal Audit History</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Persistent Database Records & Real Market Analytics</div>
        </div>
        <button onClick={fetchHistory} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Performance Summary Strip */}
      {stats && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>
            HISTORICAL PERFORMANCE SUMMARY
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {[
              { label: 'TOTAL TRADES', val: stats.totalSignals, color: 'var(--text-primary)' },
              { label: 'TRIGGERED', val: stats.triggered, color: 'var(--sky)' },
              { label: 'WIN RATE', val: stats.winRate != null ? `${stats.winRate}%` : '—', color: stats.winRate >= 50 ? 'var(--emerald)' : 'var(--rose)' },
              { label: 'TARGET 1', val: stats.target1Hits, color: 'var(--emerald)' },
              { label: 'TARGET 2', val: stats.target2Hits, color: 'var(--emerald)' },
              { label: 'STOP LOSS', val: stats.slHits, color: 'var(--rose)' },
            ].map(({ label, val, color }) => (
              <div key={label} className="card" style={{ padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</div>
                <div className="price-display" style={{ fontSize: '18px', fontWeight: 800, color, marginTop: '3px' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="card" style={{ padding: '12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Date Filter */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {[
            { id: 'all', label: 'All Time' },
            { id: 'today', label: 'Today' },
            { id: '7d', label: 'Past 7 Days' },
            { id: '30d', label: 'Past 30 Days' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => { setDateRange(f.id); setPage(1); }}
              style={{
                padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                background: dateRange === f.id ? 'var(--emerald)' : 'var(--bg-elevated)',
                color: dateRange === f.id ? '#000' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Signal Type Filter */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { id: 'ALL', label: 'All Types' },
            { id: 'CALL', label: '🟢 Calls Only' },
            { id: 'PUT', label: '🔴 Puts Only' },
            { id: 'NO_TRADE', label: '⛔ No-Trade Log' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => { setSignalType(f.id); setPage(1); }}
              style={{
                padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                background: signalType === f.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: signalType === f.id ? 'var(--text-primary)' : 'var(--text-muted)',
                border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Signals List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 75, borderRadius: 10 }} />)}
        </div>
      ) : historySignals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>No signals found</div>
          <div style={{ fontSize: '12px' }}>No trading records matching your selected date and filter criteria.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {historySignals.map((s) => {
            const isTrade = s.signalType === 'CALL_BUY' || s.signalType === 'PUT_BUY';
            const isCall = s.signalType === 'CALL_BUY';
            const sc = statusConfig(s.status);

            return (
              <div key={s.id} className="card" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: !isTrade ? 'var(--text-muted)' : isCall ? 'var(--emerald)' : 'var(--rose)' }}>
                        {!isTrade ? '⛔ NO TRADE' : `${isCall ? '🟢 CALL' : '🔴 PUT'} ${s.strike} ${s.optionType ?? ''}`}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: sc.color, background: sc.bg, padding: '2px 6px', borderRadius: '4px' }}>
                        {sc.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '3px' }}>
                      {formatDateIST(s.createdAt)} · {formatTimeIST(s.createdAt)} IST ({timeSince(s.createdAt)})
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: scoreColor(s.signalScore || 0) }}>
                      Score: {s.signalScore || 0}/100
                    </span>
                    {s.id && (
                      <button
                        onClick={() => handleDelete(s.id!)}
                        disabled={deletingId === s.id}
                        title="Delete record"
                        style={{
                          background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)',
                          borderRadius: '6px', color: 'var(--rose)', cursor: 'pointer',
                          padding: '4px 8px', fontSize: '11px', lineHeight: 1,
                          opacity: deletingId === s.id ? 0.3 : 1
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {isTrade && s.entryLow && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '10px', background: 'rgba(0,0,0,0.25)', padding: '8px', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 700 }}>ENTRY</div>
                      <div className="price-display" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>₹{fmt(s.entryLow, 0)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '8px', color: 'var(--rose)', fontWeight: 700 }}>SL</div>
                      <div className="price-display" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--rose)' }}>₹{fmt(s.sl, 0)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '8px', color: 'var(--emerald)', fontWeight: 700 }}>T1</div>
                      <div className="price-display" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--emerald)' }}>₹{fmt(s.target1, 0)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '8px', color: 'var(--sky)', fontWeight: 700 }}>R:R</div>
                      <div className="price-display" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sky)' }}>1:{s.rrRatio || 1.5}</div>
                    </div>
                  </div>
                )}

                {s.technicalReason && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {s.technicalReason}
                  </div>
                )}
                {s.noTradeReason && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {s.noTradeReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '8px 4px' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '6px 12px', color: page <= 1 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: page <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px'
            }}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} signals)
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '6px 12px', color: page >= pagination.totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: page >= pagination.totalPages ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px'
            }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════
function SettingsTab({
  userId,
  onUserChange,
  deletedCount,
}: {
  userId: string;
  onUserChange: (newUserId: string) => void;
  deletedCount: number;
}) {
  const [customUser, setCustomUser] = useState(userId);

  return (
    <div className="animate-fade-in" style={{ padding: '16px' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Settings & System Diagnostics</div>

      {/* User Isolation Card */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>USER PROFILE & ISOLATION</div>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
            Signals and deletion actions are completely isolated per user. Deleting a signal on User 1 does not affect User 2.
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {['user_alpha', 'user_beta'].map(u => (
              <button
                key={u}
                onClick={() => { setCustomUser(u); onUserChange(u); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                  background: userId === u ? 'var(--emerald)' : 'var(--bg-elevated)',
                  color: userId === u ? '#000' : 'var(--text-secondary)',
                  border: '1px solid var(--border)', cursor: 'pointer'
                }}
              >
                {u === 'user_alpha' ? '👤 User A (Alpha)' : '👤 User B (Beta)'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={customUser}
              onChange={(e) => setCustomUser(e.target.value)}
              placeholder="Custom User ID"
              style={{
                flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)',
                fontSize: '12px', fontFamily: 'monospace'
              }}
            />
            <button
              onClick={() => onUserChange(customUser)}
              style={{
                background: 'var(--sky)', color: '#000', fontWeight: 800,
                fontSize: '11px', padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer'
              }}
            >
              Switch
            </button>
          </div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Active ID: <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{userId}</strong></span>
            <span>Deleted signals: <strong style={{ color: 'var(--rose)' }}>{deletedCount}</strong></span>
          </div>
        </div>
      </div>

      {/* Market Data Provider Status */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>MARKET DATA INTEGRATION</div>
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Primary Provider</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--emerald)' }}>Upstox v2 API (Live)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Analytics Token</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--emerald)', fontFamily: 'monospace' }}>SECURE SERVER-SIDE (Active)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Token Scope</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Read-Only (No Trade Placement)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Fallback Providers</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>NSE India, Yahoo Finance</span>
          </div>
        </div>
      </div>

      {/* Strategy Engine Parameters */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>STRATEGY ENGINE PARAMETERS</div>
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { label: 'Strategy Specification', val: '20-Rule NIFTY Confluence Engine' },
            { label: 'Timeframe', val: '5-Minute Candles (09:15 - 15:30 IST)' },
            { label: 'Opening Range (ORB)', val: 'First 15m (09:15 - 09:30 IST)' },
            { label: 'Min Confluence Score', val: '75 / 100' },
            { label: 'Min Risk:Reward', val: '1 : 1.5' },
            { label: 'Execution Authority', val: 'Strict Confluence (Zero Fake Fallbacks)' },
          ].map(({ label, val }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="card" style={{ padding: '14px', background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.2)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--rose)', marginBottom: '6px', letterSpacing: '0.06em' }}>⚠️ DISCLAIMER</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          OptionPulse is a professional algorithmic market research and signal generation platform. It analyzes real-time NSE market data via Upstox API. It does NOT automatically execute orders on user accounts. Trading in derivatives involves substantial risk of loss.
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
// MAIN APPLICATION
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState<string>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('gk_active_tab') ?? 'home';
    return 'home';
  });

  const handleTabChange = (t: string) => {
    setTab(t);
    if (typeof window !== 'undefined') localStorage.setItem('gk_active_tab', t);
  };

  // User Identity State
  const [userId, setUserId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      let u = localStorage.getItem('gk_user_id');
      if (!u) {
        u = 'user_alpha';
        localStorage.setItem('gk_user_id', u);
      }
      return u;
    }
    return 'user_alpha';
  });

  // Local Deleted IDs tracking for instant zero-resurrection UI
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`gk_deleted_${userId}`);
        if (raw) return new Set(JSON.parse(raw));
      } catch {}
    }
    return new Set<string>();
  });

  const handleUserChange = (newUid: string) => {
    const cleaned = newUid.trim() || 'user_alpha';
    setUserId(cleaned);
    if (typeof window !== 'undefined') {
      localStorage.setItem('gk_user_id', cleaned);
      try {
        const raw = localStorage.getItem(`gk_deleted_${cleaned}`);
        setDeletedIds(raw ? new Set(JSON.parse(raw)) : new Set<string>());
      } catch {
        setDeletedIds(new Set<string>());
      }
    }
  };

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [indicators, setIndicators] = useState<Indicators>({});
  const [todaySignals, setTodaySignals] = useState<Signal[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [missedSignals, setMissedSignals] = useState<any[]>([]);
  const [dailySummary, setDailySummary] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const headers = { 'x-user-id': userId };

      const [quoteRes, currentSigRes, todaySigRes, summaryRes, chainRes, chartRes] = await Promise.allSettled([
        fetch('/api/market/quote'),
        fetch('/api/signals/current', { headers }),
        fetch('/api/signals/today', { headers }),
        fetch('/api/summary/today', { headers }),
        fetch('/api/market/option-chain'),
        fetch('/api/market/chart?timeframe=5m&limit=80'),
      ]);

      if (quoteRes.status === 'fulfilled' && quoteRes.value.ok) {
        const d = await quoteRes.value.json();
        if (d.success) setQuote(d.data);
      }

      if (currentSigRes.status === 'fulfilled' && currentSigRes.value.ok) {
        const d = await currentSigRes.value.json();
        if (d.success && d.signal) {
          if (!d.signal.id || !deletedIds.has(d.signal.id)) {
            setSignal(d.signal);
          } else {
            setSignal(null);
          }
        }
      }

      if (todaySigRes.status === 'fulfilled' && todaySigRes.value.ok) {
        const d = await todaySigRes.value.json();
        if (d.success) {
          const rawSignals: Signal[] = d.signals || [];
          const filtered = rawSignals.filter(s => !s.id || !deletedIds.has(s.id));
          setTodaySignals(filtered);
          setTimelineEvents(d.timelineEvents || []);
          setMissedSignals(d.missedSignals || []);
          if (!signal && filtered.length > 0) {
            const latest = filtered[filtered.length - 1];
            if (latest.signalType === 'CALL_BUY' || latest.signalType === 'PUT_BUY') {
              setSignal(latest);
            }
          }
        }
      }

      if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
        const d = await summaryRes.value.json();
        if (d.success) setDailySummary(d.summary);
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
  }, [userId, deletedIds, signal]);

  // Initial load + auto-refresh every 10s
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ── Permanent Signal Deletion Handler ──────────────────────────
  const handleDelete = async (id: string) => {
    // 1. Optimistic removal & add to deletedIds set immediately
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`gk_deleted_${userId}`, JSON.stringify(Array.from(next)));
      }
      return next;
    });

    setTodaySignals(prev => prev.filter(s => s.id !== id));
    if (signal?.id === id) setSignal(null);

    // 2. Persist deletion on server
    try {
      const res = await fetch(`/api/signals/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': userId }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn('[handleDelete] Server reported error:', errData.error || res.statusText);
      }
    } catch (e) {
      console.error('[handleDelete] API request network error:', e);
    }
  };

  return (
    <>
      <main id="main-content">
        {tab === 'home' && (
          <HomeTab
            quote={quote}
            signal={signal}
            chain={chain}
            candles={candles}
            indicators={indicators}
            loading={loading}
            onRefresh={fetchAll}
            todaySignals={todaySignals}
            missedSignals={missedSignals}
            onSelectTab={handleTabChange}
            onDelete={handleDelete}
          />
        )}
        {tab === 'signals' && (
          <SignalsTab
            signal={signal}
            todaySignals={todaySignals}
            loading={loading}
            onDelete={handleDelete}
            quote={quote}
          />
        )}
        {tab === 'chain' && (
          <ChainTab chain={chain} loading={loading} />
        )}
        {tab === 'history' && (
          <HistoryTab
            userId={userId}
            onDeleteSignal={handleDelete}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            userId={userId}
            onUserChange={handleUserChange}
            deletedCount={deletedIds.size}
          />
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <BottomNav active={tab} onChange={handleTabChange} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
