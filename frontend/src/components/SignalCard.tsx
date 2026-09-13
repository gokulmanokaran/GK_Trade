"use client";

import React, { useState } from "react";
import {
  Zap, Target, Shield, ArrowUpRight, ArrowDownRight,
  TrendingUp, CheckCircle2, AlertTriangle, ChevronRight,
  Sparkles, PlayCircle, BarChart3, HelpCircle
} from "lucide-react";

interface SignalData {
  trade: {
    signal: string;
    instrument: string;
    strike_price: number;
    option_type: string;
    current_option_ltp: number;
    entry_low: number;
    entry_high: number;
    entry_trigger: string;
    stop_loss: number;
    stop_loss_reason: string;
    target_1: number;
    target_2: number;
    target_3?: number;
    exit_condition: string;
    exit_status: string;
    trailing_sl?: number;
    risk_points: number;
    reward_points: number;
    risk_reward: number;
    signal_score: number;
    confidence: number;
    signal_strength: string;
    market_bias: string;
    invalidation_level: string;
    reasons: string[];
  };
  score_breakdown: {
    trend_score: number;
    max_trend: number;
    momentum_score: number;
    max_momentum: number;
    vwap_score: number;
    max_vwap: number;
    price_action_score: number;
    max_price_action: number;
    volume_score: number;
    max_volume: number;
    option_chain_score: number;
    max_option_chain: number;
    volatility_score: number;
    max_volatility: number;
    risk_reward_score: number;
    max_risk_reward: number;
    total_score: number;
    classification: string;
    bias: string;
  };
  ai_explanation: {
    summary: string;
    market_bias: string;
    signal_generation_reason: string;
    important_support: string;
    important_resistance: string;
    entry_reasoning: string;
    sl_reasoning: string;
    target_reasoning: string;
    invalidation_criteria: string;
    full_narrative?: string;
  };
}

interface SignalCardProps {
  signalData: SignalData | null;
  onPaperTrade: (trade: any) => void;
}

export const SignalCard: React.FC<SignalCardProps> = ({
  signalData,
  onPaperTrade,
}) => {
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
  const [showAiDetails, setShowAiDetails] = useState(false);

  if (!signalData || !signalData.trade) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center text-slate-400">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm">Calculating real-time quantitative signal confluence...</p>
      </div>
    );
  }

  const { trade, score_breakdown: score, ai_explanation: ai } = signalData;
  const isCall = trade.signal.includes("CALL");
  const isPut = trade.signal.includes("PUT");
  const isNoTrade = trade.signal === "NO TRADE";

  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
      {/* Background glow accent */}
      <div
        className={`absolute -top-24 -right-24 w-60 h-60 rounded-full blur-3xl opacity-20 pointer-events-none ${
          isCall ? "bg-emerald-500" : isPut ? "bg-rose-500" : "bg-amber-500"
        }`}
      />

      {/* Header: Signal Type, Instrument, Confidence Score */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black tracking-wider flex items-center gap-2 uppercase shadow-md ${
              isCall
                ? "bg-emerald-500 text-slate-950"
                : isPut
                ? "bg-rose-500 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>{trade.signal}</span>
          </div>
          <div>
            <h2 className="font-extrabold text-lg text-white tracking-tight flex items-center gap-2">
              {trade.instrument}
              <span className="text-xs font-mono font-medium text-slate-400 bg-slate-800/70 px-2 py-0.5 rounded border border-slate-700">
                LTP: ₹{trade.current_option_ltp.toFixed(2)}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Bias: <strong className={isCall ? "text-emerald-400" : isPut ? "text-rose-400" : "text-slate-300"}>{trade.market_bias}</strong> | Strength: <strong className="text-white">{trade.signal_strength}</strong>
            </p>
          </div>
        </div>

        {/* Score & Confidence */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Signal Score</div>
            <div className="font-mono text-xl font-black text-white flex items-center justify-end gap-1">
              <span className={trade.signal_score >= 70 ? "text-emerald-400" : trade.signal_score >= 55 ? "text-amber-400" : "text-slate-400"}>
                {trade.signal_score.toFixed(0)}
              </span>
              <span className="text-xs text-slate-500 font-normal">/100</span>
            </div>
          </div>
          <div className="text-right pl-3 border-l border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Confidence</div>
            <div className="font-mono text-xl font-black text-emerald-400">
              {trade.confidence.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Trade Matrix: Entry Zone, Stop Loss, Target 1, Target 2, Risk/Reward */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {/* Entry Zone */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            <span>Entry Zone</span>
          </div>
          <div className="font-mono text-base font-bold text-white">
            ₹{trade.entry_low.toFixed(1)} – ₹{trade.entry_high.toFixed(1)}
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5" title={trade.entry_trigger}>
            {trade.entry_trigger}
          </div>
        </div>

        {/* Stop Loss */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-rose-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-rose-400" />
            <span>Stop Loss</span>
          </div>
          <div className="font-mono text-base font-bold text-rose-400">
            ₹{trade.stop_loss.toFixed(1)}
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5" title={trade.stop_loss_reason}>
            {trade.stop_loss_reason}
          </div>
        </div>

        {/* Target 1 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span>Target 1 (1:1.2)</span>
          </div>
          <div className="font-mono text-base font-bold text-emerald-400">
            ₹{trade.target_1.toFixed(1)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            +{(trade.target_1 - trade.current_option_ltp).toFixed(1)} pts
          </div>
        </div>

        {/* Target 2 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span>Target 2 (1:{trade.risk_reward.toFixed(1)})</span>
          </div>
          <div className="font-mono text-base font-bold text-emerald-400">
            ₹{trade.target_2.toFixed(1)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            +{(trade.target_2 - trade.current_option_ltp).toFixed(1)} pts
          </div>
        </div>

        {/* Risk / Reward & Exit */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 col-span-2 sm:col-span-1">
          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">
            Risk : Reward
          </div>
          <div className="font-mono text-base font-bold text-white">
            1 : {trade.risk_reward.toFixed(1)}
          </div>
          <div className="text-[10px] font-bold text-amber-400 mt-0.5">
            Status: {trade.exit_status}
          </div>
        </div>
      </div>

      {/* Structural Invalidation Alert */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl px-3.5 py-2 mb-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-slate-400">
            <strong className="text-slate-300">Invalidation Level:</strong> {trade.invalidation_level}
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-500 hidden md:block">
          Dynamic Trailing SL active
        </div>
      </div>

      {/* Quantitative Reasons Summary */}
      <div className="space-y-1.5 mb-4">
        {trade.reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span>{r}</span>
          </div>
        ))}
      </div>

      {/* Action Buttons: Simulate Paper Trade & View Score Breakdown */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScoreBreakdown(!showScoreBreakdown)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all border border-slate-700"
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{showScoreBreakdown ? "Hide Score Breakdown" : "View Score Breakdown (8 Categories)"}</span>
          </button>
          <button
            onClick={() => setShowAiDetails(!showAiDetails)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all border border-slate-700"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>{showAiDetails ? "Hide AI Rationale" : "AI In-Depth Explanation"}</span>
          </button>
        </div>

        {!isNoTrade && (
          <button
            onClick={() =>
              onPaperTrade({
                symbol: trade.instrument.split(" ")[0],
                instrument: trade.instrument,
                direction: isCall ? "BUY" : "BUY",
                entry_price: trade.entry_high,
                quantity: trade.instrument.includes("BANK") ? 15 : 25,
                lots: 1,
                stop_loss: trade.stop_loss,
                target_1: trade.target_1,
                target_2: trade.target_2,
              })
            }
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950/50 transition-all active:scale-95"
          >
            <PlayCircle className="w-4 h-4 fill-slate-950 text-emerald-500" />
            <span>Simulate in Paper Trading</span>
          </button>
        )}
      </div>

      {/* Collapsible 100-Point Transparent Score Breakdown Table */}
      {showScoreBreakdown && (
        <div className="mt-4 pt-4 border-t border-slate-800 bg-slate-950/70 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Transparent 100-Point Scoring Breakdown
            </h4>
            <span className="text-xs font-mono font-bold text-emerald-400">
              Total Score: {score.total_score.toFixed(1)} / 100 ({score.classification})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">Trend</div>
              <div className="font-mono text-sm font-bold text-white">{score.trend_score} / {score.max_trend}</div>
              <div className="w-full bg-slate-800 h-1 rounded mt-1 overflow-hidden">
                <div className="bg-emerald-400 h-full" style={{ width: `${(score.trend_score / score.max_trend) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">Momentum</div>
              <div className="font-mono text-sm font-bold text-white">{score.momentum_score} / {score.max_momentum}</div>
              <div className="w-full bg-slate-800 h-1 rounded mt-1 overflow-hidden">
                <div className="bg-emerald-400 h-full" style={{ width: `${(score.momentum_score / score.max_momentum) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">VWAP</div>
              <div className="font-mono text-sm font-bold text-white">{score.vwap_score} / {score.max_vwap}</div>
              <div className="w-full bg-slate-800 h-1 rounded mt-1 overflow-hidden">
                <div className="bg-emerald-400 h-full" style={{ width: `${(score.vwap_score / score.max_vwap) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">Price Action</div>
              <div className="font-mono text-sm font-bold text-white">{score.price_action_score} / {score.max_price_action}</div>
              <div className="w-full bg-slate-800 h-1 rounded mt-1 overflow-hidden">
                <div className="bg-emerald-400 h-full" style={{ width: `${(score.price_action_score / score.max_price_action) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">Volume</div>
              <div className="font-mono text-sm font-bold text-white">{score.volume_score} / {score.max_volume}</div>
              <div className="w-full bg-slate-800 h-1 rounded mt-1 overflow-hidden">
                <div className="bg-emerald-400 h-full" style={{ width: `${(score.volume_score / score.max_volume) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">Option Chain & OI</div>
              <div className="font-mono text-sm font-bold text-white">{score.option_chain_score} / {score.max_option_chain}</div>
              <div className="w-full bg-slate-800 h-1 rounded mt-1 overflow-hidden">
                <div className="bg-emerald-400 h-full" style={{ width: `${(score.option_chain_score / score.max_option_chain) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">Volatility (ATR)</div>
              <div className="font-mono text-sm font-bold text-white">{score.volatility_score} / {score.max_volatility}</div>
              <div className="w-full bg-slate-800 h-1 rounded mt-1 overflow-hidden">
                <div className="bg-emerald-400 h-full" style={{ width: `${(score.volatility_score / score.max_volatility) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase">Risk / Reward</div>
              <div className="font-mono text-sm font-bold text-white">{score.risk_reward_score} / {score.max_risk_reward}</div>
              <div className="w-full bg-slate-800 h-1 rounded mt-1 overflow-hidden">
                <div className="bg-emerald-400 h-full" style={{ width: `${(score.risk_reward_score / score.max_risk_reward) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible In-Depth AI Explanation */}
      {showAiDetails && (
        <div className="mt-4 pt-4 border-t border-slate-800 bg-slate-950/70 p-4 rounded-xl text-xs space-y-3">
          <div className="flex items-center gap-2 text-indigo-400 font-bold uppercase tracking-wider text-[11px]">
            <Sparkles className="w-4 h-4" />
            <span>AI Narrative Synthesis (Deterministic Decision Support)</span>
          </div>

          <p className="text-slate-200 leading-relaxed bg-slate-900/90 p-3 rounded-lg border border-slate-800">
            {ai.full_narrative || ai.summary}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <span className="font-semibold text-emerald-400 block mb-1">Key Structural Support:</span>
              <span className="text-slate-300">{ai.important_support}</span>
            </div>
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <span className="font-semibold text-rose-400 block mb-1">Key Structural Resistance:</span>
              <span className="text-slate-300">{ai.important_resistance}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
