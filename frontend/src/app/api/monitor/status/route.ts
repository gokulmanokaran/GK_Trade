import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getMarketStatus } from '@/lib/market-hours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const marketStatus = getMarketStatus();

    let lastExecution: any = null;
    let lastQuote: any = null;
    let hasActiveSignal = false;

    if (supabase) {
      // Get last monitor execution
      const { data: executions } = await supabase
        .from('monitor_executions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (executions && executions.length > 0) {
        lastExecution = executions[0];
      }

      // Get last quote
      const { data: quotes } = await supabase
        .from('market_quotes')
        .select('*')
        .order('data_timestamp', { ascending: false })
        .limit(1);

      if (quotes && quotes.length > 0) {
        lastQuote = quotes[0];
      }

      // Check active signal
      const { data: activeSigs } = await supabase
        .from('signals')
        .select('id')
        .not('status', 'in', '("EXIT","INVALIDATED","NO_TRADE")')
        .limit(1);

      hasActiveSignal = Boolean(activeSigs && activeSigs.length > 0);
    }

    const now = Date.now();
    let dataAgeSeconds = 0;
    if (lastQuote?.data_timestamp) {
      dataAgeSeconds = Math.max(0, Math.round((now - new Date(lastQuote.data_timestamp).getTime()) / 1000));
    }

    const isStale = dataAgeSeconds > 180;
    const isHealthy = Boolean(lastExecution && lastExecution.status === 'SUCCESS' && !isStale);

    return NextResponse.json({
      status: isHealthy ? 'healthy' : isStale ? 'stale' : 'operational',
      market_status: marketStatus.session,
      provider_status: lastQuote?.provider ? (isStale ? 'stale' : 'connected') : 'standby',
      last_execution: lastExecution?.created_at || null,
      last_market_update: lastQuote?.data_timestamp || null,
      data_age_seconds: dataAgeSeconds,
      last_signal_evaluation: lastExecution?.created_at || null,
      processing_time_ms: lastExecution?.duration_ms || 120,
      active_signal: hasActiveSignal,
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', error: err.message }, { status: 500 });
  }
}
