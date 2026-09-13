"use client";

import React, { useState } from "react";
import { Calculator, AlertTriangle, ShieldCheck, DollarSign } from "lucide-react";

interface PositionCalculatorProps {
  defaultEntry?: number;
  defaultSl?: number;
  lotSize?: number;
}

export const PositionCalculator: React.FC<PositionCalculatorProps> = ({
  defaultEntry = 185.0,
  defaultSl = 145.0,
  lotSize = 25,
}) => {
  const [capital, setCapital] = useState<number>(100000);
  const [riskPct, setRiskPct] = useState<number>(1.0);
  const [entryPrice, setEntryPrice] = useState<number>(defaultEntry);
  const [slPrice, setSlPrice] = useState<number>(defaultSl);

  const riskAmount = (capital * riskPct) / 100.0;
  const riskPerUnit = Math.max(0.05, entryPrice - slPrice);

  // Position sizing in lots
  const rawLots = Math.floor(riskAmount / (riskPerUnit * lotSize));
  const lots = Math.max(1, rawLots);
  const totalQuantity = lots * lotSize;
  const totalCapitalRequired = totalQuantity * entryPrice;
  const maxLoss = totalQuantity * riskPerUnit;
  const capitalExposurePct = ((totalCapitalRequired / capital) * 100).toFixed(1);

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-emerald-400" />
          <h3 className="font-bold text-sm text-white uppercase tracking-wide">
            Risk & Position Sizing Engine
          </h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
          Lot Size: {lotSize}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
            Trading Capital (₹)
          </label>
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
            Max Risk Per Trade (%)
          </label>
          <input
            type="number"
            step="0.1"
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
            Entry Premium (₹)
          </label>
          <input
            type="number"
            step="0.5"
            value={entryPrice}
            onChange={(e) => setEntryPrice(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
            Stop Loss Premium (₹)
          </label>
          <input
            type="number"
            step="0.5"
            value={slPrice}
            onChange={(e) => setSlPrice(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-sm text-rose-400 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Calculated Results Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
        <div>
          <span className="text-[10px] text-slate-400 uppercase block font-medium">Recommended Lots</span>
          <span className="font-mono text-lg font-black text-emerald-400">{lots} Lots ({totalQuantity} Qty)</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase block font-medium">Max Loss on SL</span>
          <span className="font-mono text-lg font-black text-rose-400">₹{maxLoss.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase block font-medium">Capital Required</span>
          <span className="font-mono text-lg font-bold text-white">₹{totalCapitalRequired.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase block font-medium">Capital Exposure</span>
          <span className="font-mono text-lg font-bold text-slate-300">{capitalExposurePct}%</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>Strict adherence to risk parameters safeguards against drawdowns. Never deploy more than your configured risk per trade.</span>
      </div>
    </div>
  );
};
