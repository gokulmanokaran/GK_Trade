import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { todayIST } from '@/lib/market-hours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const today = todayIST();
    const userId = req.headers.get('x-user-id') || req.nextUrl.searchParams.get('userId');

    let allSignals: any[] = [];
    let timelineEvents: any[] = [];

    // Fetch genuine signals exclusively from the database
    if (supabase) {
      try {
        const { data: signals, error: sigErr } = await supabase
          .from('signals')
          .select(`
            *,
            signal_components(*),
            signal_events(*)
          `)
          .gte('created_at', `${today}T00:00:00+05:30`)
          .neq('status', 'DELETED')
          .order('created_at', { ascending: true });

        if (sigErr) {
          console.error('[signals/today] Database fetch error:', sigErr);
        } else if (signals && signals.length > 0) {
          // If user specified, filter out signals deleted by this user
          let userFilteredSignals = signals;
          if (userId) {
            const { data: userDeleted } = await supabase
              .from('user_deleted_signals')
              .select('signal_id')
              .eq('user_id', userId);
            const deletedSet = new Set((userDeleted || []).map((d: any) => d.signal_id));
            userFilteredSignals = signals.filter((s: any) => !deletedSet.has(s.id));
          }

          allSignals = userFilteredSignals;
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
        console.error('[signals/today] Supabase fetch error:', e);
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
