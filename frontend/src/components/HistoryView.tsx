"use client";

import React, { useState, useEffect } from "react";
import { RotateCcw, Target, Shield, CheckCircle2, XCircle } from "lucide-react";

export const HistoryView: React.FC = () => {
  const [signals, setSignals] = useState<any[]>([]);
  const [filterSym, setFilterSym] = useState<string>("");

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/signals/today");
      const data = await res.json();
      if (data.signals) setSignals(data.signals);
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [filterSym]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="bg-slate-950 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-emerald-400" />
          <h3 className="font-bold text-xs text-white uppercase tracking-wider">
            Deterministic Signal Audit History ({signals.length})
          </h3>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterSym("")}
            className={`px-2.5 py-1 rounded text-xs font-semibold ${
              filterSym === "" ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-400"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterSym("NIFTY")}
            className={`px-2.5 py-1 rounded text-xs font-semibold ${
              filterSym === "NIFTY" ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-400"
            }`}
          >
            NIFTY
          </button>
          <button
            onClick={() => setFilterSym("BANKNIFTY")}
            className={`px-2.5 py-1 rounded text-xs font-semibold ${
              filterSym === "BANKNIFTY" ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-400"
            }`}
          >
            BANKNIFTY
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left font-mono">
          <thead className="table-header border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Time</th>
              <th className="py-2.5 px-3">Instrument</th>
              <th className="py-2.5 px-3">Direction</th>
              <th className="py-2.5 px-3">Entry Zone</th>
              <th className="py-2.5 px-3">Stop Loss</th>
              <th className="py-2.5 px-3">Target 1</th>
              <th className="py-2.5 px-3">Target 2</th>
              <th className="py-2.5 px-3">Score / Conf</th>
              <th className="py-2.5 px-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-[11px]">
            {signals.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-500">
                  No signals recorded yet. Active signals generate automatically as market conditions evaluate.
                </td>
              </tr>
            ) : (
              signals.map((s) => (
                <tr key={s.id} className="table-row-hover">
                  <td className="py-2 px-3 text-slate-400">{s.timestamp || s.date}</td>
                  <td className="py-2 px-3 text-white font-bold">{s.instrument}</td>
                  <td className="py-2 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      s.direction.includes("CALL") ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"
                    }`}>
                      {s.direction}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-white">{s.entry_zone}</td>
                  <td className="py-2 px-3 text-rose-400">₹{s.stop_loss}</td>
                  <td className="py-2 px-3 text-emerald-400">₹{s.target_1}</td>
                  <td className="py-2 px-3 text-emerald-400">₹{s.target_2}</td>
                  <td className="py-2 px-3 text-slate-300">{s.score}/100 ({s.confidence}%)</td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-emerald-400 border border-slate-700">
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
