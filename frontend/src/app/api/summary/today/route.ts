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

    // Query all signals today
    const { data: signals, error: sigErr } = await supabase
      .from('signals')
      .select('*')
      .gte('created_at', `${today}T00:00:00+05:30`);

    if (sigErr) {
      return NextResponse.json({ success: false, error: sigErr.message }, { status: 500 });
    }

    const allSignals = signals || [];
    const validSignals = allSignals.filter((s: any) => s.signal_type !== 'NO_TRADE' && s.status !== 'DELETED');

    const totalSignals = validSignals.length;
    let triggeredSignals = 0;
    let target1Hits = 0;
    let target2Hits = 0;
    let slHits = 0;
    let invalidatedSignals = 0;
    let notTriggered = 0;
    let simulatedPnl = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let dominantRegime = 'SIDEWAYS';

    for (const s of validSignals) {
      if (s.regime) dominantRegime = s.regime;

      const status = s.status;
      if (['ENTRY_TRIGGERED', 'POSITION_ACTIVE', 'TARGET1_HIT', 'TRAILING_SL', 'TARGET2_HIT', 'SL_HIT', 'EXIT'].includes(status)) {
        triggeredSignals++;
      } else if (status === 'INVALIDATED') {
        invalidatedSignals++;
      } else if (['WATCH', 'WAITING_FOR_ENTRY'].includes(status)) {
        notTriggered++;
      }

      if (status === 'TARGET1_HIT') {
        target1Hits++;
        totalWins++;
        // Simulated P&L: difference between target1 and entry_high * lot size (50)
        const entry = Number(s.entry_high || s.entry_low || 100);
        const t1 = Number(s.target1 || entry * 1.25);
        simulatedPnl += (t1 - entry) * 50;
      } else if (status === 'TARGET2_HIT' || (status === 'EXIT' && s.target2 && s.exit_price && s.exit_price >= s.target2)) {
        target2Hits++;
        totalWins++;
        const entry = Number(s.entry_high || s.entry_low || 100);
        const t2 = Number(s.target2 || entry * 1.5);
        simulatedPnl += (t2 - entry) * 50;
      } else if (status === 'SL_HIT' || (status === 'EXIT' && s.sl && s.exit_price && s.exit_price <= s.sl)) {
        slHits++;
        totalLosses++;
        const entry = Number(s.entry_high || s.entry_low || 100);
        const sl = Number(s.sl || entry * 0.8);
        simulatedPnl -= (entry - sl) * 50;
      }
    }

    const closedTrades = totalWins + totalLosses;
    const winRate = closedTrades > 0 ? Math.round((totalWins / closedTrades) * 100) : 0;

    return NextResponse.json({
      success: true,
      date: today,
      isSimulatedResult: true,
      disclaimer: 'SIMULATED / PAPER RESULT ONLY. Never trade with real funds based on simulated past metrics.',
      summary: {
        totalSignals,
        triggeredSignals,
        target1Hits,
        target2Hits,
        slHits,
        invalidatedSignals,
        notTriggered,
        simulatedPnl: Math.round(simulatedPnl),
        winRate,
        marketRegime: dominantRegime,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
