"use client";

import React from "react";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";

interface IndexData {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  p_change: number;
  open?: number;
  high?: number;
  low?: number;
  prev_close?: number;
  vwap?: number;
  trend: string;
  data_source?: string;
  is_delayed?: boolean;
}

interface MarketOverviewProps {
  indices: IndexData[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export const MarketOverview: React.FC<MarketOverviewProps> = ({
  indices,
  selectedSymbol,
  onSelectSymbol,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {indices.map((idx) => {
        const isPositive = idx.change >= 0;
        const isSelected = selectedSymbol === idx.symbol;
        const low = idx.low || idx.ltp - 50;
        const high = idx.high || idx.ltp + 50;
        const range = high - low;
        const currentPosPct = range > 0 ? Math.min(100, Math.max(0, ((idx.ltp - low) / range) * 100)) : 50;

        return (
          <div
            key={idx.symbol}
            onClick={() => onSelectSymbol(idx.symbol)}
            className={`cursor-pointer rounded-xl p-4 transition-all border ${
              isSelected
                ? "bg-slate-900 border-emerald-500/70 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/40"
                : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-900/90 hover:border-slate-700"
            }`}
          >
            {/* Top row: Symbol, Name, Trend Badge */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-extrabold text-sm text-white tracking-wide">{idx.symbol}</span>
                <span className="text-[11px] text-slate-400 block">{idx.name}</span>
              </div>
              <div
                className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  idx.trend === "BULLISH"
                    ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                    : idx.trend === "BEARISH"
                    ? "bg-rose-950/60 text-rose-400 border-rose-800/50"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {idx.trend === "BULLISH" ? (
                  <TrendingUp className="w-3 h-3" />
                ) : idx.trend === "BEARISH" ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                <span>{idx.trend}</span>
              </div>
            </div>

            {/* Price & Change */}
            <div className="flex items-baseline justify-between mb-3">
              <div className="font-mono text-2xl font-black text-white tracking-tight">
                {idx.ltp > 0 ? idx.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "..."}
              </div>
              <div
                className={`font-mono text-xs font-semibold flex items-center gap-1 ${
                  isPositive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                <span>{isPositive ? "+" : ""}{idx.change ? idx.change.toFixed(2) : "0.00"}</span>
                <span>({isPositive ? "+" : ""}{idx.p_change ? idx.p_change.toFixed(2) : "0.00"}%)</span>
              </div>
            </div>

            {/* Day High / Low Range Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>L: {low.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</span>
                <span>VWAP: {idx.vwap ? idx.vwap.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : "-"}</span>
                <span>H: {high.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden relative">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${currentPosPct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
