import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { todayIST, getMarketStatus } from '@/lib/market-hours';
import { getMarketDataProvider } from '@/lib/market-data';
import { evaluateConfluence } from '@/lib/signal/confluence-strategy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const today = todayIST();
    const userId = req.headers.get('x-user-id') || req.nextUrl.searchParams.get('userId');

    // 1. Check for active signal in Supabase from today (Strict Read-Only)
    if (supabase) {
      try {
        let query = supabase
          .from('signals')
          .select(`
            *,
            signal_components(*),
            signal_events(*)
          `)
          .gte('created_at', `${today}T00:00:00+05:30`)
          .not('status', 'in', '("EXIT","INVALIDATED","NO_TRADE","DELETED")')
          .order('created_at', { ascending: false });

        const { data: activeSignals, error: dbErr } = await query.limit(5);

        if (!dbErr && activeSignals && activeSignals.length > 0) {
          // If user specified, filter out signals deleted by this user
          let validSignals = activeSignals;
          if (userId) {
            const { data: userDeleted } = await supabase
              .from('user_deleted_signals')
              .select('signal_id')
              .eq('user_id', userId);
            const deletedSet = new Set((userDeleted || []).map((d: any) => d.signal_id));
            validSignals = activeSignals.filter((s: any) => !deletedSet.has(s.id));
          }

          if (validSignals.length > 0) {
            const dbSig = validSignals[0];
            return NextResponse.json({
              success: true,
              hasActiveSignal: true,
              signal: {
                id: dbSig.id,
                signalType: dbSig.signal_type,
                status: dbSig.status,
                strike: dbSig.strike,
                optionType: dbSig.option_type,
                expiry: dbSig.expiry,
                niftyPrice: dbSig.nifty_price,
                entryLow: dbSig.entry_low,
                entryHigh: dbSig.entry_high,
                entryTrigger: dbSig.entry_trigger,
                sl: dbSig.sl,
                slReason: dbSig.sl_reason,
                target1: dbSig.target1,
                target2: dbSig.target2,
                target3: dbSig.target3,
                rrRatio: dbSig.rr_ratio,
                signalScore: dbSig.signal_score,
                confidence: dbSig.confidence,
                regime: dbSig.regime,
                trendDirection: dbSig.trend_direction,
                technicalReason: dbSig.technical_reason,
                oiReason: dbSig.oi_reason,
                chainReason: dbSig.chain_reason,
                createdAt: dbSig.created_at,
              },
              dataQuality: 'LIVE',
            });
          }
        }
      } catch (dbErr) {
        console.warn('[signals/current] Supabase query notice:', dbErr);
      }
    }

    // 2. Real-Time Market Confluence Evaluation (Strictly Read-Only, No DB Writes)
    const provider = getMarketDataProvider();
    const marketStatus = getMarketStatus();

    let quote, chain, candles;
    try {
      [quote, chain, candles] = await Promise.all([
        provider.getNiftyQuote(),
        provider.getOptionChain(),
        provider.getHistoricalData('5m', 80),
      ]);
    } catch (fetchErr: any) {
      return NextResponse.json({
        success: true,
        hasActiveSignal: false,
        signal: null,
        state: 'WAITING_FOR_MARKET_DATA',
        summaryReason: `Market data connection pending: ${fetchErr?.message || 'Connecting to Upstox API'}`,
        dataQuality: 'INSUFFICIENT',
      });
    }

    const dataAgeSeconds = Math.max(0, Math.floor((Date.now() - new Date(quote.timestamp).getTime()) / 1000));
    let dataQuality: 'LIVE' | 'DELAYED' | 'STALE' | 'INSUFFICIENT' = 'LIVE';
    if (quote.isMock) {
      dataQuality = 'DELAYED';
    } else if (dataAgeSeconds > 180) {
      dataQuality = 'STALE';
    }

    const confluence = evaluateConfluence(candles, quote, chain, {
      isMarketOpen: marketStatus.isOpen,
      dataQuality,
      dataSource: quote.provider,
      dataAgeSeconds,
      isLiveData: dataQuality === 'LIVE',
    });

    // 3. Strict Signal Output (NO fake SL, targets, strike, or entry when setup is pending)
    if (confluence.state !== 'ENTRY_TRIGGERED') {
      return NextResponse.json({
        success: true,
        hasActiveSignal: false,
        signal: null,
        confluenceSetup: confluence,
        state: confluence.state,
        summaryReason: confluence.summaryReason,
        unmetReasons: confluence.rejectionReason,
        dataQuality,
      });
    }

    // If genuinely in ENTRY_TRIGGERED in real-time, return the genuine setup without writing to DB in GET
    return NextResponse.json({
      success: true,
      hasActiveSignal: true,
      signal: {
        signalType: confluence.signalType,
        status: 'ENTRY_TRIGGERED',
        strike: confluence.recommendedStrike,
        optionType: confluence.optionType,
        expiry: chain?.expiry,
        niftyPrice: quote.ltp,
        entryLow: confluence.entryPrice ? +(confluence.entryPrice - 2).toFixed(1) : quote.ltp,
        entryHigh: confluence.entryPrice ? +(confluence.entryPrice + 2).toFixed(1) : quote.ltp,
        entryTrigger: `Enter ${confluence.instrumentName || confluence.optionType} at target ₹${confluence.optionLtp ?? 0}`,
        sl: confluence.sl,
        slReason: confluence.invalidationCondition || 'Retest swing or VWAP break',
        target1: confluence.target1,
        target2: confluence.target2,
        rrRatio: confluence.rrRatio,
        signalScore: confluence.confidenceScore,
        confidence: confluence.confidenceScore,
        regime: confluence.direction === 'CE' ? 'BULLISH' : 'BEARISH',
        trendDirection: confluence.direction,
        technicalReason: confluence.summaryReason,
        oiReason: chain?.pcr ? `PCR: ${chain.pcr.toFixed(2)}` : 'OI Analysis',
        chainReason: `ATM: ${chain?.atmStrike ?? Math.round(quote.ltp / 50) * 50}`,
        createdAt: new Date().toISOString(),
      },
      confluenceSetup: confluence,
      dataQuality,
    });
  } catch (err: any) {
    console.error('[API /signals/current]', err);
    return NextResponse.json({
      success: false,
      error: err.message,
      hasActiveSignal: false,
      signal: null,
      state: 'INSUFFICIENT_DATA',
      dataQuality: 'INSUFFICIENT',
    }, { status: 200 });
  }
}
