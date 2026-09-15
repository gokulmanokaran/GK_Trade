import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { todayIST, getMarketStatus } from '@/lib/market-hours';
import { getMarketDataProvider } from '@/lib/market-data';
import { evaluateConfluence, calculateORB } from '@/lib/signal/confluence-strategy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const today = todayIST();
    let allSignals: any[] = [];
    let timelineEvents: any[] = [];

    // 1. Try to fetch from Supabase
    if (supabase) {
      try {
        const { data: signals } = await supabase
          .from('signals')
          .select(`
            *,
            signal_components(*),
            signal_events(*)
          `)
          .gte('created_at', `${today}T00:00:00+05:30`)
          .neq('status', 'DELETED')
          .order('created_at', { ascending: true });

        if (signals && signals.length > 0) {
          allSignals = signals;
          for (const sig of allSignals) {
            if (sig.signal_events && Array.isArray(sig.signal_events)) {
              for (const evt of sig.signal_events) {
                timelineEvents.push({
                  ...evt,
                  signal_type: sig.signal_type,
                  strike: sig.strike,
                  option_type: sig.option_type,
                  entry_low: sig.entry_low,
                  entry_high: sig.entry_high,
                  sl: sig.sl,
                  target1: sig.target1,
                  target2: sig.target2,
                  signal_score: sig.signal_score,
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('[signals/today] Supabase fetch error, generating session timeline:', e);
      }
    }

    // 2. If no signals stored in DB, synthesize today's session timeline events from candles
    if (allSignals.length === 0) {
      try {
        const provider = getMarketDataProvider();
        const marketStatus = getMarketStatus();
        const [quote, chain, candles] = await Promise.all([
          provider.getNiftyQuote(),
          provider.getOptionChain(),
          provider.getHistoricalData('5m', 80),
        ]);

        const { orbHigh, orbLow } = calculateORB(candles);
        const confluence = evaluateConfluence(candles, quote, chain, {
          isMarketOpen: marketStatus.isOpen,
          dataQuality: quote.isMock ? 'DELAYED' : 'LIVE',
        });

        // Add session opening range event
        if (orbHigh !== null && orbLow !== null) {
          timelineEvents.push({
            id: 'evt-orb-open',
            event_type: 'ORB_ESTABLISHED',
            details: `15-Min Opening Range: High ${orbHigh.toFixed(1)} | Low ${orbLow.toFixed(1)}`,
            created_at: `${today}T09:30:00+05:30`,
            status: 'WATCH',
          });
        }

        // Add confluence state event
        timelineEvents.push({
          id: 'evt-confluence-status',
          event_type: confluence.state,
          details: confluence.summaryReason,
          created_at: new Date().toISOString(),
          status: confluence.state,
        });

        if (confluence.state === 'ENTRY_TRIGGERED') {
          allSignals.push({
            id: `today-${Date.now()}`,
            signal_type: confluence.signalType,
            status: confluence.state,
            strike: confluence.recommendedStrike,
            option_type: confluence.optionType,
            nifty_price: quote.ltp,
            entry_low: confluence.entryPrice,
            entry_high: confluence.entryPrice,
            sl: confluence.sl,
            target1: confluence.target1,
            target2: confluence.target2,
            rr_ratio: confluence.rrRatio,
            signal_score: confluence.confidenceScore,
            technical_reason: confluence.summaryReason,
            created_at: new Date().toISOString(),
          });
        }
      } catch (candleErr) {
        console.warn('[signals/today] Candle evaluation fallback error:', candleErr);
      }
    }

    const triggeredSignals = allSignals.filter((s: any) =>
      ['ENTRY_TRIGGERED', 'POSITION_ACTIVE', 'TARGET1_HIT', 'TRAILING_SL', 'TARGET2_HIT', 'SL_HIT', 'EXIT'].includes(s.status)
    );

    const missedSignals = allSignals.filter((s: any) =>
      s.signal_type !== 'NO_TRADE' && s.signal_score >= 70 && ['WATCH', 'WAITING_FOR_ENTRY', 'INVALIDATED'].includes(s.status)
    );

    timelineEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return NextResponse.json({
      success: true,
      date: today,
      totalCount: allSignals.length,
      signals: allSignals,
      triggeredSignals,
      missedSignals,
      timelineEvents,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      signals: [],
      triggeredSignals: [],
      missedSignals: [],
      timelineEvents: [],
    }, { status: 200 });
  }
}
