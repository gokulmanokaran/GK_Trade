import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { todayIST, getMarketStatus } from '@/lib/market-hours';
import { getMarketDataProvider } from '@/lib/market-data';
import { evaluateConfluence, ConfluenceSignalResult } from '@/lib/signal/confluence-strategy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const today = todayIST();

    // 1. Try to query active signal from today in Supabase
    if (supabase) {
      try {
        const { data: activeSignals } = await supabase
          .from('signals')
          .select(`
            *,
            signal_components(*),
            signal_events(*)
          `)
          .gte('created_at', `${today}T00:00:00+05:30`)
          .not('status', 'in', '("EXIT","INVALIDATED","NO_TRADE")')
          .order('created_at', { ascending: false })
          .limit(1);

        if (activeSignals && activeSignals.length > 0) {
          const dbSig = activeSignals[0];
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
      } catch (dbErr) {
        console.warn('[signals/current] Supabase query failed, falling back to on-demand evaluation:', dbErr);
      }
    }

    // 2. On-Demand Confluence Evaluation (No blank screen, Rule 16)
    const provider = getMarketDataProvider();
    const marketStatus = getMarketStatus();

    const [quote, chain, candles] = await Promise.all([
      provider.getNiftyQuote(),
      provider.getOptionChain(),
      provider.getHistoricalData('5m', 80),
    ]);

    const dataAgeSeconds = Math.max(0, Math.floor((Date.now() - new Date(quote.timestamp).getTime()) / 1000));
    
    // Determine honest data quality (Rules 3, 17, 18)
    let dataQuality: 'LIVE' | 'DELAYED' | 'STALE' | 'INSUFFICIENT' = 'LIVE';
    if (quote.isMock) {
      dataQuality = 'DELAYED';
    } else if (dataAgeSeconds > 3600) {
      dataQuality = 'STALE';
    } else if (quote.provider === 'yahoo' || dataAgeSeconds > 60) {
      dataQuality = 'DELAYED';
    }

    const isLiveData = dataQuality === 'LIVE';

    const confluence = evaluateConfluence(candles, quote, chain, {
      isMarketOpen: marketStatus.isOpen,
      dataQuality,
      dataSource: quote.provider,
      dataAgeSeconds,
      isLiveData,
    });

    // ── Fix 2: Persist ENTRY_TRIGGERED signals to Supabase ─────────────────
    // Only save when a real entry is confirmed. Use insert (not upsert) but
    // guard against duplicates by checking if same strike+signal_type already
    // exists in the last 60 minutes.
    if (supabase && confluence.state === 'ENTRY_TRIGGERED') {
      try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        const { data: existing } = await supabase
          .from('signals')
          .select('id')
          .eq('strike', confluence.recommendedStrike ?? 0)
          .eq('signal_type', confluence.signalType)
          .gte('created_at', oneHourAgo)
          .neq('status', 'DELETED')
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from('signals').insert({
            signal_type: confluence.signalType,
            status: 'ENTRY_TRIGGERED',
            strike: confluence.recommendedStrike,
            option_type: confluence.optionType,
            expiry: chain?.expiry ?? 'Weekly',
            nifty_price: quote.ltp,
            entry_low: confluence.entryPrice ? +(confluence.entryPrice - 2).toFixed(1) : quote.ltp,
            entry_high: confluence.entryPrice ? +(confluence.entryPrice + 2).toFixed(1) : quote.ltp,
            entry_trigger: `Enter ${confluence.instrumentName ?? confluence.optionType} at target ₹${confluence.optionLtp ?? 0}`,
            sl: confluence.sl,
            sl_reason: confluence.invalidationCondition ?? 'Retest swing or VWAP break',
            target1: confluence.target1,
            target2: confluence.target2,
            rr_ratio: confluence.rrRatio,
            signal_score: confluence.confidenceScore,
            confidence: confluence.confidenceScore,
            regime: confluence.direction === 'CE' ? 'BULLISH' : 'BEARISH',
            trend_direction: confluence.direction,
            technical_reason: confluence.summaryReason,
            oi_reason: chain?.pcr ? `PCR: ${chain.pcr.toFixed(2)}` : 'OI Analysis',
            chain_reason: `ATM: ${chain?.atmStrike ?? Math.round(quote.ltp / 50) * 50}`,
            created_at: now.toISOString(),
          });
          console.log('[signals/current] Saved ENTRY_TRIGGERED signal to Supabase:', confluence.signalType, confluence.recommendedStrike);
        }
      } catch (saveErr) {
        console.warn('[signals/current] Failed to save signal to Supabase (non-fatal):', saveErr);
      }
    }


    const fallbackSignal = {
      id: `live-${Date.now()}`,
      signalType: confluence.signalType,
      status: confluence.state,
      strike: confluence.recommendedStrike ?? Math.round(quote.ltp / 50) * 50,
      optionType: confluence.optionType ?? (confluence.direction === 'CE' ? 'CE' : 'PE'),
      expiry: chain?.expiry ?? 'Current Expiry',
      niftyPrice: quote.ltp,
      entryLow: confluence.entryPrice ? +(confluence.entryPrice - 2).toFixed(1) : quote.ltp,
      entryHigh: confluence.entryPrice ? +(confluence.entryPrice + 2).toFixed(1) : quote.ltp,
      entryTrigger: confluence.state === 'ENTRY_TRIGGERED'
        ? `Enter ${confluence.instrumentName} at ₹${confluence.optionLtp ?? 0} with target ₹${confluence.target1}`
        : (confluence.rejectionReason ?? confluence.summaryReason),
      sl: confluence.sl ?? quote.ltp - 25,
      slReason: confluence.invalidationCondition ?? 'Retest swing or VWAP break',
      target1: confluence.target1 ?? quote.ltp + 35,
      target2: confluence.target2 ?? quote.ltp + 55,
      rrRatio: confluence.rrRatio ?? 1.5,
      signalScore: confluence.confidenceScore,
      confidence: confluence.confidenceScore,
      regime: confluence.direction === 'CE' ? 'BULLISH' : confluence.direction === 'PE' ? 'BEARISH' : 'CHOPPY_SIDEWAYS',
      trendDirection: confluence.direction,
      technicalReason: confluence.summaryReason,
      oiReason: chain?.pcr ? `PCR at ${chain.pcr.toFixed(2)}` : 'OI Analysis',
      chainReason: `ATM: ${chain?.atmStrike ?? Math.round(quote.ltp / 50) * 50}`,
      noTradeReason: confluence.rejectionReason ?? undefined,
      createdAt: new Date().toISOString(),
      confluenceSetup: confluence,
      dataQuality,
      dataAgeSeconds,
      isLiveData,
    };

    return NextResponse.json({
      success: true,
      hasActiveSignal: confluence.state === 'ENTRY_TRIGGERED',
      signal: fallbackSignal,
      confluenceSetup: confluence,
      dataQuality,
    });
  } catch (err: any) {
    console.error('[API /signals/current]', err);
    return NextResponse.json({
      success: false,
      error: err.message,
      signal: null,
      state: 'INSUFFICIENT_DATA',
      dataQuality: 'INSUFFICIENT',
    }, { status: 200 }); // Return 200 with error structure to prevent frontend hard crash
  }
}
