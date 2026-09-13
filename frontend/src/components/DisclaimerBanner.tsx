"use client";

import React from "react";
import { ShieldAlert } from "lucide-react";

export const DisclaimerBanner: React.FC = () => {
  return (
    <div className="bg-slate-900/90 border-t border-slate-800 text-slate-400 px-4 py-2.5 text-xs flex items-center justify-between gap-3 shadow-inner">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong className="text-slate-300 font-semibold">Regulatory & Risk Notice:</strong> OptionPulse provides market-analysis and decision-support information only. It does not provide guaranteed returns, does not promise accuracy, and does not execute trades. Trading Indian equity/index derivatives involves substantial financial risk. Users are solely responsible for their manual trade execution and risk management.
        </span>
      </div>
      <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-500 shrink-0 font-mono">
        <span>STRICTLY DECISION-SUPPORT ONLY</span>
      </div>
    </div>
  );
};
