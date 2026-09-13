import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { todayIST } from '@/lib/market-hours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 });
    }

    const today = todayIST();

    // Fetch all signals created today with their components and events
    const { data: signals, error: sigErr } = await supabase
      .from('signals')
      .select(`
        *,
        signal_components(*),
        signal_events(*)
      `)
      .gte('created_at', `${today}T00:00:00+05:30`)
      .order('created_at', { ascending: true });

    if (sigErr) {
      return NextResponse.json({ success: false, error: sigErr.message }, { status: 500 });
    }

    // Separate triggered vs missed/not triggered signals
    const allSignals = signals || [];
    const triggeredSignals = allSignals.filter((s: any) =>
      ['ENTRY_TRIGGERED', 'POSITION_ACTIVE', 'TARGET1_HIT', 'TRAILING_SL', 'TARGET2_HIT', 'SL_HIT', 'EXIT'].includes(s.status)
    );

    const missedSignals = allSignals.filter((s: any) =>
      s.signal_type !== 'NO_TRADE' && s.signal_score >= 75 && ['WATCH', 'WAITING_FOR_ENTRY', 'INVALIDATED'].includes(s.status)
    );

    // Flatten all events today for the signal timeline
    const timelineEvents: any[] = [];
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

    // Sort events chronologically
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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
