import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataProvider } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal/signal-engine';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getMarketStatus } from '@/lib/market-hours';
import { dispatchPushNotification, NotificationEventType } from '@/lib/notifications/push-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const startWall = Date.now();
  const execId = `nifty-monitor-${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`;

  // 1. Authenticate CRON_SECRET
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', message: 'Invalid or missing CRON_SECRET' },
      { status: 401 }
    );
  }

  // Parse force override (for testing & verification)
  let force = req.nextUrl.searchParams.get('force') === 'true';
  try {
    const body = await req.clone().json();
    if (body?.force === true || body?.force === 'true') {
      force = true;
    }
  } catch {}

  // 2. Market Hours & Holiday Check
  const marketStatus = getMarketStatus();
  if (!force && ['CLOSED_WEEKEND', 'CLOSED_HOLIDAY', 'POST_CLOSE'].includes(marketStatus.session)) {
    return NextResponse.json({
      success: true,
      status: 'MARKET_CLOSED',
      market_status: marketStatus.session,
      reason: marketStatus.holidayName ? `NSE Holiday: ${marketStatus.holidayName}` : 'Market is closed',
      execution_id: execId,
    });
  }

  if (!force && marketStatus.session === 'PRE_OPEN') {
    return NextResponse.json({
      success: true,
      status: 'MARKET_NOT_OPEN',
      market_status: 'PRE_OPEN',
      message: 'Market is in pre-open session (opens at 09:15 IST)',
      execution_id: execId,
    });
  }

  const supabase = getSupabaseAdmin();
  const result: Record<string, any> = {
    execution_id: execId,
    start_time: new Date().toISOString(),
    market_status: marketStatus.session,
    signal_generated: false,
    events_generated: [],
    notifications_sent: 0,
    status: 'SUCCESS',
  };

  try {
    const provider = getMarketDataProvider();

    // 3. Fetch latest market data
    const [quote, chain, candles] = await Promise.all([
      provider.getNiftyQuote(),
      provider.getOptionChain(),
      provider.getHistoricalData('5m', 80),
    ]);

    result.nifty_ltp = quote.ltp;
    result.data_provider = quote.provider;
    result.data_timestamp = quote.timestamp.toISOString();

    const dataAgeSeconds = Math.max(0, Math.round((Date.now() - quote.timestamp.getTime()) / 1000));
    result.data_age_seconds = dataAgeSeconds;

    // 4. Stale data check
    if (dataAgeSeconds > 180) {
      result.status = 'DATA_STALE';
      result.errors = `Data age ${dataAgeSeconds}s exceeds 180s threshold`;
      if (supabase) {
        await recordExecution(supabase, result, startWall);
      }
      return NextResponse.json(result);
    }

    // 5. Persist market quote to Supabase
    if (supabase) {
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
    }

    // 6. Check existing active signals (State Machine)
    let activeSignal: any = null;
    if (supabase) {
      const { data: activeSigs } = await supabase
        .from('signals')
        .select('*')
        .not('status', 'in', '("EXIT","INVALIDATED","NO_TRADE")')
        .order('created_at', { ascending: false })
        .limit(1);

      if (activeSigs && activeSigs.length > 0) {
        activeSignal = activeSigs[0];
      }
    }

    if (activeSignal) {
      // Evaluate State Machine for the active signal
      const currentPrice = quote.ltp;
      const status = activeSignal.status;
      let nextStatus = status;
      let eventType: NotificationEventType | null = null;

      const optPrice = activeSignal.entry_high || 150.0;
      const sl = activeSignal.sl || 0;
      const t1 = activeSignal.target1 || 0;
      const t2 = activeSignal.target2 || 0;

      if (['WATCH', 'WAITING_FOR_ENTRY'].includes(status)) {
        const entryLow = activeSignal.entry_low || 0;
        const entryHigh = activeSignal.entry_high || 0;
        if (entryLow <= optPrice && optPrice <= entryHigh * 1.02) {
          nextStatus = 'ENTRY_TRIGGERED';
          eventType = 'ENTRY_TRIGGERED';
        }
      } else if (status === 'ENTRY_TRIGGERED') {
        nextStatus = 'POSITION_ACTIVE';
      } else if (['POSITION_ACTIVE', 'TARGET1_HIT', 'TRAILING_SL'].includes(status)) {
        if (sl > 0 && optPrice <= sl) {
          nextStatus = 'SL_HIT';
          eventType = 'SL_HIT';
        } else if (t2 > 0 && optPrice >= t2) {
          nextStatus = 'TARGET2_HIT';
          eventType = 'TARGET2_HIT';
        } else if (status === 'POSITION_ACTIVE' && t1 > 0 && optPrice >= t1) {
          nextStatus = 'TARGET1_HIT';
          eventType = 'TARGET1_HIT';
        } else if (status === 'TARGET1_HIT') {
          nextStatus = 'TRAILING_SL';
        }
      } else if (['SL_HIT', 'TARGET2_HIT', 'EXIT_TRIGGERED'].includes(status)) {
        nextStatus = 'EXIT';
      }

      if (nextStatus !== status && supabase) {
        await supabase.from('signals').update({ status: nextStatus }).eq('id', activeSignal.id);

        if (eventType) {
          const idempotencyKey = `${activeSignal.id}_${eventType}`;
          await supabase.from('signal_events').upsert(
            {
              signal_id: activeSignal.id,
              event_type: eventType,
              from_status: status,
              to_status: nextStatus,
              nifty_price: currentPrice,
              idempotency_key: idempotencyKey,
            },
            { onConflict: 'idempotency_key' }
          );

          result.events_generated.push(eventType);

          // Dispatch Push Notification
          const notif = await dispatchPushNotification(activeSignal, eventType);
          if (notif.sentCount > 0) result.notifications_sent += notif.sentCount;
        }
      }
    } else {
      // 7. No active signal: evaluate new signal engine
      const signal = await generateSignal(quote, chain, candles);

      if (signal.signalType !== 'NO_TRADE' && signal.signalScore >= 75 && supabase) {
        const { data: inserted, error: insErr } = await supabase
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
            status: 'WATCH',
          })
          .select()
          .single();

        if (inserted && !insErr) {
          result.signal_generated = true;
          result.signal_id = inserted.id;

          const idempotencyKey = `${inserted.id}_NEW_SIGNAL`;
          await supabase.from('signal_events').upsert(
            {
              signal_id: inserted.id,
              event_type: 'NEW_SIGNAL',
              to_status: 'WATCH',
              nifty_price: signal.niftyPrice,
              idempotency_key: idempotencyKey,
            },
            { onConflict: 'idempotency_key' }
          );
          result.events_generated.push('NEW_SIGNAL');

          const notif = await dispatchPushNotification(inserted, 'NEW_SIGNAL');
          if (notif.sentCount > 0) result.notifications_sent += notif.sentCount;
        }
      }
    }

    if (supabase) {
      await recordExecution(supabase, result, startWall);
    }

    result.duration_ms = Date.now() - startWall;
    return NextResponse.json(result);
  } catch (err: any) {
    result.status = 'FAILED';
    result.errors = err.message;
    result.duration_ms = Date.now() - startWall;
    if (supabase) {
      await recordExecution(supabase, result, startWall);
    }
    return NextResponse.json(result, { status: 500 });
  }
}

async function recordExecution(supabase: any, result: Record<string, any>, startWall: number) {
  try {
    await supabase.from('monitor_executions').insert({
      execution_id: result.execution_id,
      start_time: result.start_time,
      end_time: new Date().toISOString(),
      duration_ms: Date.now() - startWall,
      market_status: result.market_status,
      data_provider: result.data_provider,
      data_timestamp: result.data_timestamp,
      data_age_seconds: result.data_age_seconds,
      signal_generated: result.signal_generated,
      signal_id: result.signal_id,
      events_generated: result.events_generated,
      notifications_sent: result.notifications_sent,
      errors: result.errors,
      status: result.status,
    });
  } catch (e) {
    console.warn('[recordExecution] Failed to insert execution log:', e);
  }
}
