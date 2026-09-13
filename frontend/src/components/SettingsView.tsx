"use client";

import React, { useState, useEffect } from "react";
import { Settings, Sliders, Shield, Bell, Save, CheckCircle2 } from "lucide-react";

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, string>>({
    min_signal_score: "70",
    min_risk_reward: "1.5",
    risk_per_trade_pct: "1.0",
    default_index: "NIFTY",
    default_timeframe: "5m",
    data_refresh_interval_sec: "5",
    weight_trend: "20",
    weight_momentum: "15",
    weight_vwap: "10",
    weight_price_action: "15",
    weight_volume: "10",
    weight_option_chain: "20",
    weight_volatility: "5",
    weight_risk_reward: "5",
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("http://localhost:8000/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data && Object.keys(data).length > 0) {
          setSettings((prev) => ({ ...prev, ...data }));
        }
      })
      .catch((err) => console.error("Failed to load settings:", err));
  }, []);

  const handleChange = (key: string, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("http://localhost:8000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Save settings error:", err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider">
              OptionPulse System Configuration
            </h3>
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase shadow-lg transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{saved ? "Saved Successfully!" : "Save Changes"}</span>
          </button>
        </div>

        {/* Global Trading Parameters */}
        <div>
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            <span>Risk & Signal Thresholds</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                Minimum Signal Score (0-100)
              </label>
              <input
                type="number"
                value={settings.min_signal_score}
                onChange={(e) => handleChange("min_signal_score", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono text-xs"
              />
              <span className="text-[10px] text-slate-500 block mt-1">Signals below this score output NO TRADE.</span>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                Minimum Risk / Reward
              </label>
              <input
                type="number"
                step="0.1"
                value={settings.min_risk_reward}
                onChange={(e) => handleChange("min_risk_reward", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono text-xs"
              />
              <span className="text-[10px] text-slate-500 block mt-1">Standard minimum 1 : 1.5</span>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                Max Risk Per Trade (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={settings.risk_per_trade_pct}
                onChange={(e) => handleChange("risk_per_trade_pct", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono text-xs"
              />
              <span className="text-[10px] text-slate-500 block mt-1">Recommended 1.0% maximum.</span>
            </div>
          </div>
        </div>

        {/* 100-Point Deterministic Scoring Weight Configuration */}
        <div>
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>100-Point Scoring Model Weights (Must Total 100)</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Trend Weight</label>
              <input
                type="number"
                value={settings.weight_trend}
                onChange={(e) => handleChange("weight_trend", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Momentum Weight</label>
              <input
                type="number"
                value={settings.weight_momentum}
                onChange={(e) => handleChange("weight_momentum", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">VWAP Weight</label>
              <input
                type="number"
                value={settings.weight_vwap}
                onChange={(e) => handleChange("weight_vwap", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Price Action Weight</label>
              <input
                type="number"
                value={settings.weight_price_action}
                onChange={(e) => handleChange("weight_price_action", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Volume Weight</label>
              <input
                type="number"
                value={settings.weight_volume}
                onChange={(e) => handleChange("weight_volume", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Option Chain & OI</label>
              <input
                type="number"
                value={settings.weight_option_chain}
                onChange={(e) => handleChange("weight_option_chain", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Volatility Weight</label>
              <input
                type="number"
                value={settings.weight_volatility}
                onChange={(e) => handleChange("weight_volatility", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">R:R Weight</label>
              <input
                type="number"
                value={settings.weight_risk_reward}
                onChange={(e) => handleChange("weight_risk_reward", e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Polling & Refresh Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Data Polling Interval (Seconds)
            </label>
            <input
              type="number"
              value={settings.data_refresh_interval_sec}
              onChange={(e) => handleChange("data_refresh_interval_sec", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono text-xs"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
              Default Chart Timeframe
            </label>
            <select
              value={settings.default_timeframe}
              onChange={(e) => handleChange("default_timeframe", e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs"
            >
              <option value="1m">1m</option>
              <option value="3m">3m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
            </select>
          </div>
        </div>
      </form>
    </div>
  );
};
