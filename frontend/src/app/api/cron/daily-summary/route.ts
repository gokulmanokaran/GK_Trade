import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { todayIST } from '@/lib/market-hours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ skipped: true, reason: 'No Supabase configured' });

  const today = todayIST();

  try {
    const { data: signals } = await supabase
      .from('signals')
      .select('*')
      .gte('created_at', `${today}T00:00:00+05:30`)
      .neq('signal_type', 'NO_TRADE');

    const total = signals?.length ?? 0;
    const triggered = signals?.filter((s) => s.status !== 'WATCH' && s.status !== 'WAITING_FOR_ENTRY').length ?? 0;
    const t1 = signals?.filter((s) => ['TARGET1_HIT', 'TARGET2_HIT', 'TRAILING_SL'].includes(s.status)).length ?? 0;
    const t2 = signals?.filter((s) => s.status === 'TARGET2_HIT').length ?? 0;
    const sl = signals?.filter((s) => s.status === 'SL_HIT').length ?? 0;
    const notTriggered = total - triggered;
    const winRate = triggered > 0 ? +((t1 / triggered) * 100).toFixed(1) : null;

    const noTrades = await supabase
      .from('signals')
      .select('id', { count: 'exact' })
      .gte('created_at', `${today}T00:00:00+05:30`)
      .eq('signal_type', 'NO_TRADE');

    const summaryData = {
      date: today,
      instrument: 'NIFTY',
      total_signals: total,
      triggered_signals: triggered,
      target1_hits: t1,
      target2_hits: t2,
      sl_hits: sl,
      not_triggered: notTriggered,
      no_trade_count: noTrades.count ?? 0,
      win_rate: winRate,
      generated_at: new Date().toISOString(),
    };

    await supabase.from('daily_summaries').upsert(summaryData, { onConflict: 'date' });

    return NextResponse.json({ success: true, summary: summaryData });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
