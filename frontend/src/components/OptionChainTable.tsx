"use client";

import React, { useState } from "react";
import {
  Filter, Eye, Check, ChevronDown, Layers,
  TrendingUp, TrendingDown, HelpCircle
} from "lucide-react";

interface OptionContract {
  strike_price: number;
  option_type: string;
  ltp: number;
  change: number;
  p_change: number;
  volume: number;
  oi: number;
  change_oi: number;
  iv: number;
  bid: number;
  ask: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  buildup: string;
}

interface StrikeRow {
  strike_price: number;
  ce: OptionContract;
  pe: OptionContract;
}

interface OptionChainProps {
  data: {
    symbol: string;
    expiry_date: string;
    available_expiries: string[];
    underlying_ltp: number;
    atm_strike: number;
    pcr: number;
    max_pain: number;
    total_ce_oi: number;
    total_pe_oi: number;
    timestamp: string;
    data_source: string;
    is_delayed: boolean;
    strikes: StrikeRow[];
  } | null;
  onSelectExpiry: (expiry: string) => void;
  strikeRange: number;
  setStrikeRange: (r: number) => void;
}

export const OptionChainTable: React.FC<OptionChainProps> = ({
  data,
  onSelectExpiry,
  strikeRange,
  setStrikeRange,
}) => {
  const [showGreeks, setShowGreeks] = useState(false);
  const [sideFilter, setSideFilter] = useState<"BOTH" | "CALLS" | "PUTS">("BOTH");

  if (!data || !data.strikes || data.strikes.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full mx-auto mb-3" />
        <p>Loading full institutional option chain data...</p>
      </div>
    );
  }

  const { strikes, underlying_ltp, atm_strike, pcr, max_pain, expiry_date, available_expiries } = data;

  // Identify highest OI strikes for walls
  const maxCeOi = Math.max(...strikes.map((s) => s.ce.oi), 1);
  const maxPeOi = Math.max(...strikes.map((s) => s.pe.oi), 1);
  const highestCallStrike = strikes.reduce((prev, curr) => (curr.ce.oi > prev.ce.oi ? curr : prev)).strike_price;
  const highestPutStrike = strikes.reduce((prev, curr) => (curr.pe.oi > prev.pe.oi ? curr : prev)).strike_price;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
      {/* Option Chain Control Bar */}
      <div className="bg-slate-950 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Expiry & Strikes selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold uppercase">Expiry:</span>
            <select
              value={expiry_date}
              onChange={(e) => onSelectExpiry(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
            >
              {available_expiries.map((exp) => (
                <option key={exp} value={exp}>{exp}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold uppercase">Range:</span>
            <select
              value={strikeRange}
              onChange={(e) => setStrikeRange(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value={10}>± 10 Strikes</option>
              <option value={15}>± 15 Strikes</option>
              <option value={25}>± 25 Strikes</option>
              <option value={40}>± 40 Strikes</option>
            </select>
          </div>

          {/* CE / PE / Both Filter */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-0.5 flex items-center">
            <button
              onClick={() => setSideFilter("BOTH")}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                sideFilter === "BOTH" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:text-white"
              }`}
            >
              Both
            </button>
            <button
              onClick={() => setSideFilter("CALLS")}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                sideFilter === "CALLS" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:text-white"
              }`}
            >
              Calls
            </button>
            <button
              onClick={() => setSideFilter("PUTS")}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                sideFilter === "PUTS" ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:text-white"
              }`}
            >
              Puts
            </button>
          </div>
        </div>

        {/* Center: PCR & Max Pain KPIs */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 mr-1.5">Spot:</span>
            <span className="font-bold text-white">{underlying_ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 mr-1.5">PCR:</span>
            <span className={`font-bold ${pcr >= 1.2 ? "text-emerald-400" : pcr <= 0.8 ? "text-rose-400" : "text-amber-400"}`}>
              {pcr.toFixed(2)}
            </span>
          </div>
          <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 mr-1.5">Max Pain:</span>
            <span className="font-bold text-indigo-400">{max_pain.toLocaleString("en-IN")}</span>
          </div>
        </div>

        {/* Right: Greeks Toggle */}
        <div>
          <button
            onClick={() => setShowGreeks(!showGreeks)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              showGreeks
                ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showGreeks ? "Hide Greeks" : "Show Greeks (Δ, Γ, Θ, ν)"}</span>
          </button>
        </div>
      </div>

      {/* Option Chain Grid Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-center border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 select-none">
              {/* CALLS HEADER */}
              {(sideFilter === "BOTH" || sideFilter === "CALLS") && (
                <>
                  <th colSpan={showGreeks ? 10 : 6} className="py-2 px-3 text-emerald-400 bg-emerald-950/20 border-r border-slate-800 text-xs tracking-wider uppercase font-black">
                    CALLS (CE)
                  </th>
                </>
              )}

              {/* STRIKE HEADER */}
              <th className="py-2 px-4 bg-slate-900 text-white font-bold border-x border-slate-700 tracking-wider">
                STRIKE
              </th>

              {/* PUTS HEADER */}
              {(sideFilter === "BOTH" || sideFilter === "PUTS") && (
                <>
                  <th colSpan={showGreeks ? 10 : 6} className="py-2 px-3 text-rose-400 bg-rose-950/20 border-l border-slate-800 text-xs tracking-wider uppercase font-black">
                    PUTS (PE)
                  </th>
                </>
              )}
            </tr>

            {/* Subheader Column Names */}
            <tr className="table-header border-b border-slate-800 text-[11px] font-mono">
              {(sideFilter === "BOTH" || sideFilter === "CALLS") && (
                <>
                  <th className="py-2 px-2 text-right">OI</th>
                  <th className="py-2 px-2 text-right">Chg OI</th>
                  <th className="py-2 px-2 text-right">Volume</th>
                  <th className="py-2 px-2 text-right">IV</th>
                  {showGreeks && (
                    <>
                      <th className="py-2 px-1 text-right text-indigo-300">Delta</th>
                      <th className="py-2 px-1 text-right text-indigo-300">Gamma</th>
                      <th className="py-2 px-1 text-right text-indigo-300">Theta</th>
                      <th className="py-2 px-1 text-right text-indigo-300">Vega</th>
                    </>
                  )}
                  <th className="py-2 px-2 text-right">Bid/Ask</th>
                  <th className="py-2 px-3 text-right font-bold text-white border-r border-slate-800">LTP</th>
                </>
              )}

              <th className="py-2 px-4 bg-slate-900/90 text-white font-black border-x border-slate-700">
                PRICE
              </th>

              {(sideFilter === "BOTH" || sideFilter === "PUTS") && (
                <>
                  <th className="py-2 px-3 text-left font-bold text-white border-l border-slate-800">LTP</th>
                  <th className="py-2 px-2 text-left">Bid/Ask</th>
                  {showGreeks && (
                    <>
                      <th className="py-2 px-1 text-left text-indigo-300">Delta</th>
                      <th className="py-2 px-1 text-left text-indigo-300">Gamma</th>
                      <th className="py-2 px-1 text-left text-indigo-300">Theta</th>
                      <th className="py-2 px-1 text-left text-indigo-300">Vega</th>
                    </>
                  )}
                  <th className="py-2 px-2 text-left">IV</th>
                  <th className="py-2 px-2 text-left">Volume</th>
                  <th className="py-2 px-2 text-left">Chg OI</th>
                  <th className="py-2 px-2 text-left">OI</th>
                </>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
            {strikes.map((row) => {
              const strike = row.strike_price;
              const isAtm = strike === atm_strike;
              const isCallItm = strike < underlying_ltp;
              const isPutItm = strike > underlying_ltp;
              const isHighestCallOi = strike === highestCallStrike;
              const isHighestPutOi = strike === highestPutStrike;

              const ceOiPct = (row.ce.oi / maxCeOi) * 100;
              const peOiPct = (row.pe.oi / maxPeOi) * 100;

              return (
                <tr
                  key={strike}
                  className={`table-row-hover transition-colors ${
                    isAtm ? "bg-amber-500/10 font-bold" : ""
                  }`}
                >
                  {/* CALLS COLUMNS */}
                  {(sideFilter === "BOTH" || sideFilter === "CALLS") && (
                    <>
                      {/* OI with bar fill */}
                      <td className={`py-1.5 px-2 text-right relative ${isCallItm ? "bg-slate-800/40" : ""}`}>
                        <div
                          className="absolute inset-y-0 right-0 bg-emerald-500/10 pointer-events-none"
                          style={{ width: `${ceOiPct}%` }}
                        />
                        <span className={`relative z-10 ${isHighestCallOi ? "text-amber-400 font-bold" : "text-slate-300"}`}>
                          {row.ce.oi.toLocaleString("en-IN")}
                          {isHighestCallOi && " 🛡️"}
                        </span>
                      </td>

                      {/* Chg OI */}
                      <td className={`py-1.5 px-2 text-right ${row.ce.change_oi >= 0 ? "text-emerald-400" : "text-rose-400"} ${isCallItm ? "bg-slate-800/40" : ""}`}>
                        {row.ce.change_oi >= 0 ? "+" : ""}{row.ce.change_oi.toLocaleString("en-IN")}
                      </td>

                      {/* Volume */}
                      <td className={`py-1.5 px-2 text-right text-slate-400 ${isCallItm ? "bg-slate-800/40" : ""}`}>
                        {row.ce.volume.toLocaleString("en-IN")}
                      </td>

                      {/* IV */}
                      <td className={`py-1.5 px-2 text-right text-slate-400 ${isCallItm ? "bg-slate-800/40" : ""}`}>
                        {row.ce.iv.toFixed(1)}%
                      </td>

                      {/* Greeks */}
                      {showGreeks && (
                        <>
                          <td className={`py-1.5 px-1 text-right text-indigo-300 ${isCallItm ? "bg-slate-800/40" : ""}`}>
                            {row.ce.greeks.delta.toFixed(2)}
                          </td>
                          <td className={`py-1.5 px-1 text-right text-indigo-300 ${isCallItm ? "bg-slate-800/40" : ""}`}>
                            {row.ce.greeks.gamma.toFixed(4)}
                          </td>
                          <td className={`py-1.5 px-1 text-right text-indigo-300 ${isCallItm ? "bg-slate-800/40" : ""}`}>
                            {row.ce.greeks.theta.toFixed(1)}
                          </td>
                          <td className={`py-1.5 px-1 text-right text-indigo-300 ${isCallItm ? "bg-slate-800/40" : ""}`}>
                            {row.ce.greeks.vega.toFixed(1)}
                          </td>
                        </>
                      )}

                      {/* Bid/Ask */}
                      <td className={`py-1.5 px-2 text-right text-slate-500 text-[10px] ${isCallItm ? "bg-slate-800/40" : ""}`}>
                        {row.ce.bid.toFixed(1)} / {row.ce.ask.toFixed(1)}
                      </td>

                      {/* LTP */}
                      <td className={`py-1.5 px-3 text-right font-bold border-r border-slate-800 ${
                        isCallItm ? "bg-slate-800/60 text-emerald-300" : "text-slate-200"
                      }`}>
                        ₹{row.ce.ltp.toFixed(2)}
                      </td>
                    </>
                  )}

                  {/* CENTER STRIKE */}
                  <td className={`py-1.5 px-4 font-black border-x border-slate-700 select-none ${
                    isAtm ? "bg-amber-400 text-slate-950 shadow-sm" : "bg-slate-900 text-white"
                  }`}>
                    <div className="flex items-center justify-center gap-1">
                      <span>{strike.toLocaleString("en-IN")}</span>
                      {isAtm && <span className="text-[9px] bg-slate-950 text-amber-300 px-1 rounded">ATM</span>}
                    </div>
                  </td>

                  {/* PUTS COLUMNS */}
                  {(sideFilter === "BOTH" || sideFilter === "PUTS") && (
                    <>
                      {/* LTP */}
                      <td className={`py-1.5 px-3 text-left font-bold border-l border-slate-800 ${
                        isPutItm ? "bg-slate-800/60 text-rose-300" : "text-slate-200"
                      }`}>
                        ₹{row.pe.ltp.toFixed(2)}
                      </td>

                      {/* Bid/Ask */}
                      <td className={`py-1.5 px-2 text-left text-slate-500 text-[10px] ${isPutItm ? "bg-slate-800/40" : ""}`}>
                        {row.pe.bid.toFixed(1)} / {row.pe.ask.toFixed(1)}
                      </td>

                      {/* Greeks */}
                      {showGreeks && (
                        <>
                          <td className={`py-1.5 px-1 text-left text-indigo-300 ${isPutItm ? "bg-slate-800/40" : ""}`}>
                            {row.pe.greeks.delta.toFixed(2)}
                          </td>
                          <td className={`py-1.5 px-1 text-left text-indigo-300 ${isPutItm ? "bg-slate-800/40" : ""}`}>
                            {row.pe.greeks.gamma.toFixed(4)}
                          </td>
                          <td className={`py-1.5 px-1 text-left text-indigo-300 ${isPutItm ? "bg-slate-800/40" : ""}`}>
                            {row.pe.greeks.theta.toFixed(1)}
                          </td>
                          <td className={`py-1.5 px-1 text-left text-indigo-300 ${isPutItm ? "bg-slate-800/40" : ""}`}>
                            {row.pe.greeks.vega.toFixed(1)}
                          </td>
                        </>
                      )}

                      {/* IV */}
                      <td className={`py-1.5 px-2 text-left text-slate-400 ${isPutItm ? "bg-slate-800/40" : ""}`}>
                        {row.pe.iv.toFixed(1)}%
                      </td>

                      {/* Volume */}
                      <td className={`py-1.5 px-2 text-left text-slate-400 ${isPutItm ? "bg-slate-800/40" : ""}`}>
                        {row.pe.volume.toLocaleString("en-IN")}
                      </td>

                      {/* Chg OI */}
                      <td className={`py-1.5 px-2 text-left ${row.pe.change_oi >= 0 ? "text-emerald-400" : "text-rose-400"} ${isPutItm ? "bg-slate-800/40" : ""}`}>
                        {row.pe.change_oi >= 0 ? "+" : ""}{row.pe.change_oi.toLocaleString("en-IN")}
                      </td>

                      {/* OI with bar fill */}
                      <td className={`py-1.5 px-2 text-left relative ${isPutItm ? "bg-slate-800/40" : ""}`}>
                        <div
                          className="absolute inset-y-0 left-0 bg-rose-500/10 pointer-events-none"
                          style={{ width: `${peOiPct}%` }}
                        />
                        <span className={`relative z-10 ${isHighestPutOi ? "text-amber-400 font-bold" : "text-slate-300"}`}>
                          {row.pe.oi.toLocaleString("en-IN")}
                          {isHighestPutOi && " 🛡️"}
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
