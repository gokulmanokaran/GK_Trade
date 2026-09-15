import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataProvider } from '@/lib/market-data';
import { generateSignal } from '@/lib/signal/signal-engine';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { todayIST } from '@/lib/market-hours';

export const runtime = 'nodejs';
// No cache — always fresh signal
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const provider = getMarketDataProvider();

    const [quote, chain, candles] = await Promise.all([
      provider.getNiftyQuote(),
      provider.getOptionChain(),
      provider.getHistoricalData('5m', 100),
    ]);

    const signal = await generateSignal(quote, chain, candles);

    // Try to fetch today's signals from Supabase
    const supabase = getSupabaseAdmin();
    let todaySignals: any[] = [];
    let latestStoredSignal: any = null;

    if (supabase) {
      const today = todayIST();
      const { data } = await supabase
        .from('signals')
        .select('*, signal_components(*)')
        .gte('created_at', `${today}T00:00:00+05:30`)
        .neq('status', 'DELETED')
        .order('created_at', { ascending: false })
        .limit(20);
      todaySignals = data ?? [];
      latestStoredSignal = todaySignals[0] ?? null;
    }

    return NextResponse.json({
      success: true,
      data: {
        currentSignal: {
          ...signal,
          createdAt: signal.createdAt.toISOString(),
        },
        todaySignals,
        latestStoredSignal,
        quote: { ...quote, timestamp: quote.timestamp.toISOString() },
        isMockData: quote.isMock,
      },
    });
  } catch (err: any) {
    console.error('[API /signals]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
