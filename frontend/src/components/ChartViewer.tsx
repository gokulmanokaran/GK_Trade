"use client";

import React, { useEffect, useRef, useState } from "react";
import { LineChart, BarChart2, Eye, RefreshCw, Maximize2 } from "lucide-react";

interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

interface ChartViewerProps {
  symbol: string;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  candles: Candle[];
  indicators: any;
  onRefresh: () => void;
}

export const ChartViewer: React.FC<ChartViewerProps> = ({
  symbol,
  timeframe,
  setTimeframe,
  candles,
  indicators,
  onRefresh,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndicators, setActiveIndicators] = useState({
    ema9: true,
    ema20: true,
    ema50: false,
    vwap: true,
    supertrend: true,
    volume: true,
    rsi: true,
  });

  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null);

  const timeframes = ["1m", "3m", "5m", "15m", "30m", "1H", "1D"];

  useEffect(() => {
    if (!candles || candles.length === 0 || !chartContainerRef.current) return;

    let chart: any = null;

    // Dynamically load lightweight-charts to prevent SSR window reference errors
    import("lightweight-charts").then(({ createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries }) => {
      if (!chartContainerRef.current) return;
      chartContainerRef.current.innerHTML = "";

      const width = chartContainerRef.current.clientWidth;
      const height = 450;

      chart = createChart(chartContainerRef.current, {
        width: width,
        height: height,
        layout: {
          background: { type: ColorType.Solid, color: "#090d16" },
          textColor: "#94a3b8",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#1e293b" },
          horzLines: { color: "#1e293b" },
        },
        timeScale: {
          borderColor: "#334155",
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: "#334155",
        },
      });

      // Format candles for lightweight-charts: { time: UNIX_TIMESTAMP, open, high, low, close }
      const sortedCandles = [...candles].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const formattedData = sortedCandles.map((c, i) => {
        const d = new Date(c.timestamp);
        const timeSec = Math.floor(d.getTime() / 1000) + (i * 60); // fallback incremental seconds
        return {
          time: timeSec as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        };
      });

      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        borderUpColor: "#10b981",
        borderDownColor: "#ef4444",
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
      });

      candlestickSeries.setData(formattedData);

      // Volume Series
      if (activeIndicators.volume) {
        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: "#38bdf8",
          priceFormat: { type: "volume" },
          priceScaleId: "",
          scaleMargins: { top: 0.82, bottom: 0 },
        });

        const volumeData = sortedCandles.map((c, i) => {
          const d = new Date(c.timestamp);
          const timeSec = Math.floor(d.getTime() / 1000) + (i * 60);
          return {
            time: timeSec as any,
            value: c.volume || 1000,
            color: c.close >= c.open ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)",
          };
        });
        volumeSeries.setData(volumeData);
      }

      // VWAP line
      if (activeIndicators.vwap) {
        const vwapSeries = chart.addSeries(LineSeries, {
          color: "#a855f7",
          lineWidth: 2,
          title: "VWAP",
        });
        const vwapData = sortedCandles
          .filter((c) => c.vwap !== undefined)
          .map((c, i) => {
            const d = new Date(c.timestamp);
            const timeSec = Math.floor(d.getTime() / 1000) + (i * 60);
            return { time: timeSec as any, value: c.vwap! };
          });
        if (vwapData.length > 0) vwapSeries.setData(vwapData);
      }

      // Crosshair move handler
      chart.subscribeCrosshairMove((param: any) => {
        if (!param.time) {
          setHoverCandle(null);
          return;
        }
        const dataPoint = param.seriesData.get(candlestickSeries);
        if (dataPoint) {
          setHoverCandle({
            timestamp: new Date((param.time as number) * 1000).toLocaleTimeString(),
            open: dataPoint.open,
            high: dataPoint.high,
            low: dataPoint.low,
            close: dataPoint.close,
            volume: 0,
          });
        }
      });

      chart.timeScale().fitContent();

      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        if (chart) chart.remove();
      };
    });
  }, [candles, activeIndicators]);

  const activeCandle = hoverCandle || (candles && candles.length > 0 ? candles[candles.length - 1] : null);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Chart Top Toolbar */}
      <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Symbol, Timeframes */}
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-sm text-white">{symbol}</span>
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all ${
                  timeframe === tf
                    ? "bg-emerald-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Live Inspection Bar */}
        {activeCandle && (
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-400">O: <strong className="text-white">{activeCandle.open.toFixed(2)}</strong></span>
            <span className="text-slate-400">H: <strong className="text-emerald-400">{activeCandle.high.toFixed(2)}</strong></span>
            <span className="text-slate-400">L: <strong className="text-rose-400">{activeCandle.low.toFixed(2)}</strong></span>
            <span className="text-slate-400">C: <strong className="text-white">{activeCandle.close.toFixed(2)}</strong></span>
            {activeCandle.vwap && (
              <span className="text-slate-400">VWAP: <strong className="text-purple-400">{activeCandle.vwap.toFixed(2)}</strong></span>
            )}
          </div>
        )}

        {/* Right: Indicator toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveIndicators((prev) => ({ ...prev, vwap: !prev.vwap }))}
            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
              activeIndicators.vwap
                ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                : "bg-slate-900 text-slate-500 border-slate-800"
            }`}
          >
            VWAP
          </button>
          <button
            onClick={() => setActiveIndicators((prev) => ({ ...prev, volume: !prev.volume }))}
            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
              activeIndicators.volume
                ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                : "bg-slate-900 text-slate-500 border-slate-800"
            }`}
          >
            VOL
          </button>
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
            title="Refresh Candles"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Chart Canvas Container */}
      <div ref={chartContainerRef} className="w-full h-[450px]" />

      {/* RSI and Indicator Status Footer */}
      {indicators && (
        <div className="bg-slate-950/90 border-t border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-4">
            <span>RSI(14): <strong className={indicators.rsi_14 > 60 ? "text-emerald-400" : indicators.rsi_14 < 40 ? "text-rose-400" : "text-amber-400"}>{indicators.rsi_14?.toFixed(1) || "-"}</strong></span>
            <span>MACD: <strong className="text-white">{indicators.macd?.toFixed(2) || "-"}</strong> (Hist: <strong className={indicators.macd_hist >= 0 ? "text-emerald-400" : "text-rose-400"}>{indicators.macd_hist?.toFixed(2) || "-"}</strong>)</span>
            <span>ATR(14): <strong className="text-white">{indicators.atr_14?.toFixed(1) || "-"}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span>Supertrend:</span>
            <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${indicators.supertrend_direction === "BULLISH" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"}`}>
              {indicators.supertrend_direction || "NEUTRAL"} (₹{indicators.supertrend || "-"})
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
