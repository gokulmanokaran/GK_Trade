"use client";

import React, { useState } from "react";
import {
  History, Play, TrendingUp, TrendingDown,
  Award, AlertTriangle, BarChart3, CheckCircle2
} from "lucide-react";

interface BacktestingViewProps {
  selectedSymbol: string;
}

export const BacktestingView: React.FC<BacktestingViewProps> = ({ selectedSymbol }) => {
  const [symbol, setSymbol] = useState(selectedSymbol || "NIFTY");
  const [timeframe, setTimeframe] = useState("5m");
  const [minScore, setMinScore] = useState(70);
  const [targetMult, setTargetMult] = useState(1.5);
  const [slMult, setSlMult] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runBacktest = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe,
          min_score: minScore,
          target_multiplier: targetMult,
          sl_multiplier: slMult,
        }),
      });
      const data = await res.json();
      if (data.summary) {
        setResults(data.summary);
      }
    } catch (e) {
      console.error("Backtest failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Strategy Control Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wide">
              Quantitative Strategy Backtest Studio
            </h3>
          </div>
          <span className="text-xs text-slate-400">Deterministic Confluence Strategy</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Instrument
            </label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="NIFTY">NIFTY</option>
              <option value="BANKNIFTY">BANKNIFTY</option>
              <option value="FINNIFTY">FINNIFTY</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Timeframe
            </label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="1m">1m</option>
              <option value="3m">3m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Min Signal Score
            </label>
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Target Multiplier (R:R)
            </label>
            <input
              type="number"
              step="0.1"
              value={targetMult}
              onChange={(e) => setTargetMult(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              SL Multiplier
            </label>
            <input
              type="number"
              step="0.1"
              value={slMult}
              onChange={(e) => setSlMult(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Initial Simulated Capital: ₹100,000 | 1 Lot Position Execution
          </span>
          <button
            onClick={runBacktest}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition-all active:scale-95 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isLoading ? "Running Simulation..." : "Run Backtest"}</span>
          </button>
        </div>
      </div>

      {/* Results KPIs */}
      {results && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Win Rate</span>
              <span className="font-mono text-xl font-black text-emerald-400">{results.win_rate}%</span>
              <span className="text-[10px] text-slate-500 block">{results.winning_trades}W / {results.losing_trades}L</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Profit Factor</span>
              <span className="font-mono text-xl font-black text-white">{results.profit_factor}</span>
              <span className="text-[10px] text-slate-500 block">Gross W / Gross L</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Max Drawdown</span>
              <span className="font-mono text-xl font-black text-rose-400">-{results.max_drawdown}%</span>
              <span className="text-[10px] text-slate-500 block">Peak to Trough</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Net Simulated P&L</span>
              <span className={`font-mono text-xl font-black ${results.net_simulated_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                ₹{results.net_simulated_pnl.toLocaleString("en-IN")}
              </span>
              <span className="text-[10px] text-slate-500 block">Total Return</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Avg Win / Loss</span>
              <span className="font-mono text-xs font-bold text-white block">W: ₹{results.avg_win}</span>
              <span className="font-mono text-xs font-bold text-rose-400 block">L: ₹{results.avg_loss}</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Streak</span>
              <span className="font-mono text-xs font-bold text-emerald-400 block">{results.consecutive_wins} Max Wins</span>
              <span className="font-mono text-xs font-bold text-rose-400 block">{results.consecutive_losses} Max Losses</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Total Trades</span>
              <span className="font-mono text-xl font-bold text-white">{results.total_trades}</span>
              <span className="text-[10px] text-slate-500 block">Executed</span>
            </div>
          </div>

          {/* Equity Curve Table / Sparkline */}
          {results.equity_curve && results.equity_curve.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                Simulated Equity Curve
              </h4>
              <div className="h-28 flex items-end gap-1.5 pt-4 pb-2 border-b border-slate-800 overflow-x-auto">
                {results.equity_curve.map((pt: any, i: number) => {
                  const minEq = 90000;
                  const maxEq = 120000;
                  const heightPct = Math.max(10, Math.min(100, ((pt.equity - minEq) / (maxEq - minEq)) * 100));
                  return (
                    <div
                      key={i}
                      className="group relative flex-1 min-w-[12px] bg-slate-800 hover:bg-emerald-400 transition-all rounded-t"
                      style={{ height: `${heightPct}%` }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950 text-white font-mono text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-20 border border-slate-700">
                        ₹{pt.equity.toLocaleString("en-IN")} ({pt.time})
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-2">
                <span>Start: ₹100,000</span>
                <span>Final: ₹{results.equity_curve[results.equity_curve.length - 1]?.equity.toLocaleString("en-IN")}</span>
              </div>
            </div>
          )}

          {/* Trade Log Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-slate-950 p-4 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Simulated Trade Executions ({results.trades?.length} Trades)
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left font-mono">
                <thead className="table-header border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Instrument</th>
                    <th className="py-2.5 px-3">Direction</th>
                    <th className="py-2.5 px-3">Entry Time</th>
                    <th className="py-2.5 px-3">Entry ₹</th>
                    <th className="py-2.5 px-3">Exit Time</th>
                    <th className="py-2.5 px-3">Exit ₹</th>
                    <th className="py-2.5 px-3 text-right">P&L (₹)</th>
                    <th className="py-2.5 px-3 text-right">Return %</th>
                    <th className="py-2.5 px-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-[11px]">
                  {results.trades?.map((t: any) => (
                    <tr key={t.trade_num} className="table-row-hover">
                      <td className="py-2 px-3 text-slate-500">{t.trade_num}</td>
                      <td className="py-2 px-3 text-white font-bold">{t.instrument}</td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.direction.includes("CALL") ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"
                        }`}>
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400">{t.entry_time}</td>
                      <td className="py-2 px-3 text-white">₹{t.entry_price}</td>
                      <td className="py-2 px-3 text-slate-400">{t.exit_time}</td>
                      <td className="py-2 px-3 text-white">₹{t.exit_price}</td>
                      <td className={`py-2 px-3 text-right font-bold ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {t.pnl >= 0 ? "+" : ""}₹{t.pnl}
                      </td>
                      <td className={`py-2 px-3 text-right font-bold ${t.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct}%
                      </td>
                      <td className="py-2 px-3 text-slate-400">{t.exit_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{results.disclaimer}</span>
          </div>
        </div>
      )}
    </div>
  );
};
