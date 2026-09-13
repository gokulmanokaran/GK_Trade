"use client";

import React, { useEffect, useState } from "react";
import {
  LayoutDashboard, TableProperties, Zap, LineChart,
  BarChart2, History, Briefcase, Settings, RotateCcw,
  Clock, Wifi, Shield
} from "lucide-react";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedSymbol: string;
  setSelectedSymbol: (sym: string) => void;
  marketStatus: {
    status: string;
    is_open: boolean;
    ist_time: string;
    is_delayed: boolean;
    data_age_seconds: number;
    message: string;
  };
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedSymbol,
  setSelectedSymbol,
  marketStatus,
  onRefresh,
  isRefreshing,
}) => {
  const [istClock, setIstClock] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: "Asia/Kolkata",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      };
      setIstClock(new Intl.DateTimeFormat("en-GB", options).format(now) + " IST");
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "optionchain", label: "Option Chain", icon: TableProperties },
    { id: "signals", label: "Signals", icon: Zap },
    { id: "charts", label: "Charts", icon: LineChart },
    { id: "analysis", label: "Analysis", icon: BarChart2 },
    { id: "backtesting", label: "Backtesting", icon: History },
    { id: "papertrading", label: "Paper Trading", icon: Briefcase },
    { id: "history", label: "History", icon: RotateCcw },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const symbols = ["NIFTY", "BANKNIFTY", "FINNIFTY"];

  return (
    <header className="bg-slate-950 border-b border-slate-800/80 sticky top-0 z-50 shadow-md">
      {/* Top Banner: Logo, Index Selector, Status, Clock */}
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
        {/* Logo & Symbol Selector */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white">OPTION<span className="text-emerald-400">PULSE</span></span>
                <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">PRO</span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">Indian Options Market Intelligence</p>
            </div>
          </div>

          {/* Index Selector Tabs */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {symbols.map((sym) => (
              <button
                key={sym}
                onClick={() => setSelectedSymbol(sym)}
                className={`px-3 py-1 rounded-md text-xs font-semibold tracking-wide transition-all ${
                  selectedSymbol === sym
                    ? "bg-emerald-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Status, Clock, Refresh */}
        <div className="flex items-center gap-3">
          {/* Market Status Badge */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                marketStatus.status === "MARKET OPEN"
                  ? "bg-emerald-400 animate-ping"
                  : marketStatus.status === "PRE-MARKET"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-slate-500"
              }`}
            />
            <span className="font-medium text-slate-300">
              {marketStatus.status}
            </span>
            {marketStatus.is_delayed && (
              <span className="text-[10px] text-amber-400 font-mono bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                DELAYED
              </span>
            )}
          </div>

          {/* Clock & Age */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/60 px-2.5 py-1 rounded border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{istClock || marketStatus.ist_time}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Age: {marketStatus.data_age_seconds}s</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-all disabled:opacity-50"
            title="Refresh Market Data"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-400" : "text-slate-400"}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <nav className="border-t border-slate-800/60 bg-slate-950/90 overflow-x-auto scrollbar-none">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all ${
                  isActive
                    ? "border-emerald-400 text-emerald-400 bg-emerald-500/5 font-semibold"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : "text-slate-500"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
