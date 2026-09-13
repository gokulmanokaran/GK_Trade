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

    // Query active signal from today (not terminal)
    const { data: activeSignals, error } = await supabase
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

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const currentSignal = activeSignals && activeSignals.length > 0 ? activeSignals[0] : null;

    return NextResponse.json({
      success: true,
      hasActiveSignal: Boolean(currentSignal),
      signal: currentSignal,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
