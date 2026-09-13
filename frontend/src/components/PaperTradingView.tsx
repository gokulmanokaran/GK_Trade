"use client";

import React, { useState, useEffect } from "react";
import {
  Briefcase, PlusCircle, XCircle, TrendingUp,
  TrendingDown, CheckCircle2, ShieldCheck, DollarSign
} from "lucide-react";

interface PaperTrade {
  id: number;
  symbol: string;
  instrument: string;
  direction: string;
  entry_price: number;
  current_price: number;
  entry_time: string;
  quantity: number;
  lots: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  trailing_sl?: number;
  exit_price?: number;
  status: string;
  pnl: number;
  pnl_pct: number;
}

export const PaperTradingView: React.FC = () => {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [virtualCapital, setVirtualCapital] = useState(100000);
  const [totalPnl, setTotalPnl] = useState(0);
  const [openPositionsCount, setOpenPositionsCount] = useState(0);
  const [showManualModal, setShowManualModal] = useState(false);

  // Manual trade form state
  const [formSymbol, setFormSymbol] = useState("NIFTY");
  const [formInstrument, setFormInstrument] = useState("NIFTY 25450 CE");
  const [formDirection, setFormDirection] = useState("BUY");
  const [formEntry, setFormEntry] = useState(185.0);
  const [formLots, setFormLots] = useState(1);
  const [formSl, setFormSl] = useState(145.0);
  const [formT1, setFormT1] = useState(225.0);
  const [formT2, setFormT2] = useState(270.0);

  const fetchTrades = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/paper-trades");
      const data = await res.json();
      if (data.trades) {
        setTrades(data.trades);
        setVirtualCapital(data.virtual_capital);
        setTotalPnl(data.total_pnl);
        setOpenPositionsCount(data.open_positions);
      }
    } catch (e) {
      console.error("Failed to load paper trades:", e);
    }
  };

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 3000);
    return () => clearInterval(interval);
  }, []);

  const closeTrade = async (id: number, currentPrice: number) => {
    try {
      await fetch(`http://localhost:8000/api/paper-trades/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exit_price: currentPrice }),
      });
      fetchTrades();
    } catch (e) {
      console.error("Failed to close position:", e);
    }
  };

  const submitManualTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const lotSize = formSymbol === "BANKNIFTY" ? 15 : 25;
    try {
      await fetch("http://localhost:8000/api/paper-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: formSymbol,
          instrument: formInstrument,
          direction: formDirection,
          entry_price: formEntry,
          quantity: formLots * lotSize,
          lots: formLots,
          stop_loss: formSl,
          target_1: formT1,
          target_2: formT2,
        }),
      });
      setShowManualModal(false);
      fetchTrades();
    } catch (err) {
      console.error("Failed to submit manual trade:", err);
    }
  };

  const openTrades = trades.filter((t) => t.status === "OPEN");
  const closedTrades = trades.filter((t) => t.status === "CLOSED");

  return (
    <div className="space-y-6">
      {/* Portfolio Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
            Virtual Capital
          </span>
          <span className="font-mono text-2xl font-black text-white">
            ₹{virtualCapital.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">Starting: ₹100,000</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
            Total Simulated P&L
          </span>
          <span className={`font-mono text-2xl font-black ${totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">Realized + Unrealized</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
            Open Positions
          </span>
          <span className="font-mono text-2xl font-black text-white">
            {openPositionsCount}
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">Active Positions</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-center">
          <button
            onClick={() => setShowManualModal(true)}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition-all active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Place Custom Paper Order</span>
          </button>
        </div>
      </div>

      {/* Open Positions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-emerald-400" />
            <span>Active Paper Trading Positions ({openTrades.length})</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">Simulated Orders (No Real Broker Integration)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left font-mono">
            <thead className="table-header border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Instrument</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Lots (Qty)</th>
                <th className="py-2.5 px-3">Entry ₹</th>
                <th className="py-2.5 px-3">Current ₹</th>
                <th className="py-2.5 px-3">Stop Loss</th>
                <th className="py-2.5 px-3">Target 1</th>
                <th className="py-2.5 px-3">Target 2</th>
                <th className="py-2.5 px-3 text-right">Unrealized P&L</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-[11px]">
              {openTrades.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-slate-500">
                    No active open positions. Generate a signal on Dashboard or place a custom order above.
                  </td>
                </tr>
              ) : (
                openTrades.map((t) => (
                  <tr key={t.id} className="table-row-hover">
                    <td className="py-2.5 px-3 font-bold text-white">{t.instrument}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{t.lots} ({t.quantity})</td>
                    <td className="py-2.5 px-3 text-white">₹{t.entry_price.toFixed(2)}</td>
                    <td className="py-2.5 px-3 font-bold text-white">₹{t.current_price.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-rose-400">₹{t.stop_loss.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-emerald-400">₹{t.target_1.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-emerald-400">₹{t.target_2.toFixed(2)}</td>
                    <td className={`py-2.5 px-3 text-right font-black ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.pnl >= 0 ? "+" : ""}₹{t.pnl.toFixed(2)} ({t.pnl >= 0 ? "+" : ""}{t.pnl_pct.toFixed(2)}%)
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => closeTrade(t.id, t.current_price)}
                        className="px-2.5 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white text-[10px] font-bold transition-all"
                      >
                        Exit Position
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Closed Positions Table */}
      {closedTrades.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="bg-slate-950 p-4 border-b border-slate-800">
            <h3 className="font-bold text-xs text-white uppercase tracking-wider">
              Closed Trade History ({closedTrades.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left font-mono">
              <thead className="table-header border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Instrument</th>
                  <th className="py-2 px-3">Qty</th>
                  <th className="py-2 px-3">Entry ₹</th>
                  <th className="py-2 px-3">Exit ₹</th>
                  <th className="py-2 px-3 text-right">Realized P&L</th>
                  <th className="py-2 px-3 text-right">Return %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[11px]">
                {closedTrades.map((t) => (
                  <tr key={t.id} className="table-row-hover">
                    <td className="py-2 px-3 text-white font-bold">{t.instrument}</td>
                    <td className="py-2 px-3 text-slate-400">{t.quantity}</td>
                    <td className="py-2 px-3 text-slate-300">₹{t.entry_price.toFixed(2)}</td>
                    <td className="py-2 px-3 text-white">₹{t.exit_price ? t.exit_price.toFixed(2) : "-"}</td>
                    <td className={`py-2 px-3 text-right font-bold ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.pnl >= 0 ? "+" : ""}₹{t.pnl.toFixed(2)}
                    </td>
                    <td className={`py-2 px-3 text-right font-bold ${t.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Trade Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white uppercase">New Paper Trade Order</h3>
              <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitManualTrade} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 uppercase font-semibold">Instrument Name</label>
                <input
                  type="text"
                  value={formInstrument}
                  onChange={(e) => setFormInstrument(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 uppercase font-semibold">Entry Premium (₹)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formEntry}
                    onChange={(e) => setFormEntry(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 uppercase font-semibold">Lots</label>
                  <input
                    type="number"
                    min="1"
                    value={formLots}
                    onChange={(e) => setFormLots(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-rose-400 block mb-1 uppercase font-semibold">Stop Loss (₹)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formSl}
                    onChange={(e) => setFormSl(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-rose-400 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-emerald-400 block mb-1 uppercase font-semibold">Target 1 (₹)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formT1}
                    onChange={(e) => setFormT1(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-emerald-400 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-emerald-400 block mb-1 uppercase font-semibold">Target 2 (₹)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formT2}
                    onChange={(e) => setFormT2(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-emerald-400 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase transition-all"
                >
                  Confirm Virtual Execution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
