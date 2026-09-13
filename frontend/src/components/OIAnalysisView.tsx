"use client";

import React from "react";
import {
  BarChart2, Shield, Target, TrendingUp, TrendingDown,
  Activity, ArrowUpRight, ArrowDownRight, Layers, Info
} from "lucide-react";

interface OIAnalysisProps {
  oiData: any;
  srLevels: any;
}

export const OIAnalysisView: React.FC<OIAnalysisProps> = ({ oiData, srLevels }) => {
  if (!oiData || !srLevels) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
        <p>Loading institutional Open Interest analytics...</p>
      </div>
    );
  }

  const pcr = oiData.pcr || 1.0;
  const isPcrBullish = pcr >= 1.15;
  const isPcrBearish = pcr <= 0.85;

  return (
    <div className="space-y-6">
      {/* Top Metrics: PCR, Max Pain, Total Call OI, Total Put OI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* PCR Metric */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase font-semibold">Put / Call Ratio (PCR)</span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`font-mono text-3xl font-black ${isPcrBullish ? "text-emerald-400" : isPcrBearish ? "text-rose-400" : "text-amber-400"}`}>
              {pcr.toFixed(2)}
            </span>
            <span className={`text-xs font-bold uppercase ${isPcrBullish ? "text-emerald-400" : isPcrBearish ? "text-rose-400" : "text-amber-400"}`}>
              {oiData.bias} BIAS
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {isPcrBullish
              ? "Elevated PCR indicates strong Put writing, reflecting potential underlying support floor."
              : isPcrBearish
              ? "Subdued PCR signals Call writing dominance, suggesting potential resistance overhead."
              : "Balanced positioning between buyers and option writers."}
          </p>
        </div>

        {/* Max Pain */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase font-semibold">Max Pain Strike</span>
            <Target className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="font-mono text-3xl font-black text-indigo-400">
            {oiData.max_pain?.toLocaleString("en-IN") || "-"}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Theoretical strike price where option sellers face minimal total loss at expiry.
          </p>
        </div>

        {/* Highest Call OI (Resistance Wall) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase font-semibold">Call OI Ceiling (Resistance)</span>
            <ArrowUpRight className="w-4 h-4 text-rose-400" />
          </div>
          <div className="font-mono text-2xl font-black text-rose-400">
            {oiData.highest_call_oi_strike?.toLocaleString("en-IN") || "-"}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {oiData.highest_call_oi_volume?.toLocaleString("en-IN")} Call contracts concentrated.
          </p>
        </div>

        {/* Highest Put OI (Support Wall) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase font-semibold">Put OI Floor (Support)</span>
            <ArrowDownRight className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-mono text-2xl font-black text-emerald-400">
            {oiData.highest_put_oi_strike?.toLocaleString("en-IN") || "-"}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {oiData.highest_put_oi_volume?.toLocaleString("en-IN")} Put contracts concentrated.
          </p>
        </div>
      </div>

      {/* Institutional Support & Resistance Levels Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wide">
              Institutional Support & Resistance Structure
            </h3>
          </div>
          <span className="text-xs text-slate-400">Blended Pivots + OI Concentration</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="bg-slate-950 p-3 rounded-xl border border-rose-900/40">
            <span className="text-[10px] uppercase font-bold text-rose-400 block mb-1">Major Resistance (R2)</span>
            <span className="font-mono text-lg font-black text-rose-400">{srLevels.major_resistance?.toLocaleString("en-IN")}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-rose-950/60">
            <span className="text-[10px] uppercase font-bold text-rose-300 block mb-1">Minor Resistance (R1)</span>
            <span className="font-mono text-lg font-bold text-rose-300">{srLevels.minor_resistance?.toLocaleString("en-IN")}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-700">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Pivot Point (PP)</span>
            <span className="font-mono text-lg font-bold text-white">{srLevels.pivot_point?.toLocaleString("en-IN")}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-emerald-950/60">
            <span className="text-[10px] uppercase font-bold text-emerald-300 block mb-1">Minor Support (S1)</span>
            <span className="font-mono text-lg font-bold text-emerald-300">{srLevels.minor_support?.toLocaleString("en-IN")}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-emerald-900/40 col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">Major Support (S2)</span>
            <span className="font-mono text-lg font-black text-emerald-400">{srLevels.major_support?.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      {/* Buildup Dynamics & AI Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dominant Buildup Activity */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h4 className="text-xs font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Option Buildup Breakdown</span>
          </h4>
          <div className="space-y-3">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Call Side Dominant Activity:</span>
                <span className="font-bold text-white text-sm">{oiData.dominant_ce_buildup || "Neutral Activity"}</span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Fresh Chg OI: {oiData.highest_call_chg_oi_strike?.toLocaleString("en-IN")}
              </span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Put Side Dominant Activity:</span>
                <span className="font-bold text-white text-sm">{oiData.dominant_pe_buildup || "Neutral Activity"}</span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Fresh Chg OI: {oiData.highest_put_chg_oi_strike?.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>

        {/* Natural Language Insights */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h4 className="text-xs font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-400" />
            <span>OI Confluence Insights</span>
          </h4>
          <div className="space-y-2 text-xs text-slate-300">
            {oiData.bullet_insights ? (
              oiData.bullet_insights.map((insight: string, idx: number) => (
                <div key={idx} className="flex items-start gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>{insight}</span>
                </div>
              ))
            ) : (
              <p className="text-slate-400">{oiData.narrative}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
