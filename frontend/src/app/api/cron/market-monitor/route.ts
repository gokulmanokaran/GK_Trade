import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataProvider } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal/signal-engine';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { shouldRunCron } from '@/lib/market-hours';

// Secured cron endpoint — called by Vercel Cron
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only run during market hours
  if (!shouldRunCron()) {
    return NextResponse.json({ skipped: true, reason: 'Outside market hours' });
  }

  const supabase = getSupabaseAdmin();
  const startTime = Date.now();
  const results: Record<string, any> = {};

  try {
    const provider = getMarketDataProvider();

    // 1. Fetch market data
    const [quote, chain, candles] = await Promise.all([
      provider.getNiftyQuote(),
      provider.getOptionChain(),
      provider.getHistoricalData('5m', 100),
    ]);
    results.dataFetched = true;
    results.provider = quote.provider;
    results.niftyLTP = quote.ltp;

    // 2. Generate signal
    const signal = await generateSignal(quote, chain, candles);
    results.signalType = signal.signalType;
    results.signalScore = signal.signalScore;
    results.noTradeReason = signal.noTradeReason;

    // 3. Persist to Supabase
    if (supabase) {
      // Log market quote
      await supabase.from('market_quotes').insert({
        instrument: 'NIFTY',
        ltp: quote.ltp,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        prev_close: quote.prevClose,
        change: quote.change,
        change_pct: quote.changePct,
        volume: quote.volume,
        vwap: quote.vwap,
        provider: quote.provider,
        data_timestamp: quote.timestamp.toISOString(),
      });

      // Persist signal if it has a score (i.e., it's real, not just a market-closed status)
      if (signal.signalType !== 'NO_TRADE' || signal.signalScore === 0) {
        const { data: insertedSignal, error: signalErr } = await supabase
          .from('signals')
          .insert({
            instrument: 'NIFTY',
            signal_type: signal.signalType,
            expiry: signal.expiry,
            strike: signal.strike,
            option_type: signal.optionType,
            nifty_price: signal.niftyPrice,
            entry_low: signal.entryLow,
            entry_high: signal.entryHigh,
            entry_trigger: signal.entryTrigger,
            sl: signal.sl,
            sl_reason: signal.slReason,
            target1: signal.target1,
            target2: signal.target2,
            rr_ratio: signal.rrRatio,
            signal_score: signal.signalScore,
            confidence: signal.confidence,
            regime: signal.regime,
            trend_direction: signal.trendDirection,
            technical_reason: signal.technicalReason,
            oi_reason: signal.oiReason,
            chain_reason: signal.chainReason,
            liquidity_ok: signal.liquidityOk,
            no_trade_reason: signal.noTradeReason,
            status: signal.status,
          })
          .select()
          .single();

        if (insertedSignal && !signalErr) {
          results.signalId = insertedSignal.id;

          // Insert score components
          const components = Object.entries(signal.scoreBreakdown)
            .filter(([k]) => k !== 'total')
            .map(([component, score]) => ({
              signal_id: insertedSignal.id,
              component,
              score: score as number,
              max_score: getMaxScore(component),
              passed: (score as number) > 0,
            }));

          await supabase.from('signal_components').insert(components);

          // Insert signal event
          const idempotencyKey = `${insertedSignal.id}_NEW_SIGNAL`;
          await supabase.from('signal_events').upsert({
            signal_id: insertedSignal.id,
            event_type: 'NEW_SIGNAL',
            to_status: signal.status,
            nifty_price: signal.niftyPrice,
            reason: signal.technicalReason,
            idempotency_key: idempotencyKey,
          }, { onConflict: 'idempotency_key' });
        }
      }

      // Update existing active signals: check SL/target hits
      await updateActiveSignals(supabase, quote);
    }

    results.durationMs = Date.now() - startTime;
    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[CRON market-monitor]', err);

    if (supabase) {
      await supabase.from('system_logs').insert({
        level: 'ERROR',
        category: 'cron',
        message: err.message,
        data: { stack: err.stack?.slice(0, 500) },
      });
    }

    return NextResponse.json({ success: false, error: err.message, ...results }, { status: 500 });
  }
}

async function updateActiveSignals(supabase: any, quote: { ltp: number }) {
  const { data: activeSignals } = await supabase
    .from('signals')
    .select('*')
    .in('status', ['WATCH', 'WAITING_FOR_ENTRY', 'ENTRY_TRIGGERED', 'POSITION_ACTIVE', 'TARGET1_HIT', 'TRAILING_SL']);

  if (!activeSignals?.length) return;

  for (const sig of activeSignals) {
    const currentPrice = quote.ltp;
    let newStatus = sig.status;
    let eventType: string | null = null;

    if (sig.signal_type === 'CALL_BUY' || sig.signal_type === 'PUT_BUY') {
      // Check entry trigger (simplified: use underlying price proximity)
      if (sig.status === 'WATCH' || sig.status === 'WAITING_FOR_ENTRY') {
        // Entry: NIFTY within 0.3% of entry zone
        if (sig.nifty_price && Math.abs(currentPrice - sig.nifty_price) / sig.nifty_price < 0.003) {
          newStatus = 'ENTRY_TRIGGERED';
          eventType = 'ENTRY_TRIGGERED';
        }
      }

      if (sig.status === 'ENTRY_TRIGGERED' || sig.status === 'POSITION_ACTIVE') {
        // We use underlying price as proxy for option movement direction
        // Real implementation would track option LTP
        const estimatedOptionPrice = sig.entry_high; // placeholder

        if (sig.sl && estimatedOptionPrice <= sig.sl) {
          newStatus = 'SL_HIT';
          eventType = 'SL_HIT';
        } else if (sig.target2 && estimatedOptionPrice >= sig.target2) {
          newStatus = 'TARGET2_HIT';
          eventType = 'TARGET2_HIT';
        } else if (sig.target1 && estimatedOptionPrice >= sig.target1 && sig.status !== 'TARGET1_HIT') {
          newStatus = 'TARGET1_HIT';
          eventType = 'TARGET1_HIT';
        }
      }
    }

    if (newStatus !== sig.status) {
      await supabase.from('signals').update({ status: newStatus }).eq('id', sig.id);

      if (eventType) {
        const idempotencyKey = `${sig.id}_${eventType}`;
        await supabase.from('signal_events').upsert({
          signal_id: sig.id,
          event_type: eventType,
          from_status: sig.status,
          to_status: newStatus,
          nifty_price: currentPrice,
          idempotency_key: idempotencyKey,
        }, { onConflict: 'idempotency_key' });
      }
    }
  }
}

function getMaxScore(component: string): number {
  const map: Record<string, number> = {
    trend: 20, priceAction: 15, vwap: 10, momentum: 10,
    volume: 10, optionChain: 15, oi: 10, volatility: 5, liquidity: 5,
  };
  return map[component] ?? 10;
}
