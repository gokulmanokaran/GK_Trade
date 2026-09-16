import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { todayIST } from '@/lib/market-hours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const searchParams = req.nextUrl.searchParams;

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const dateFilter = searchParams.get('date') || 'all'; // 'all', 'today', '7d', '30d', or 'YYYY-MM-DD'
    const typeFilter = searchParams.get('type') || 'all'; // 'all', 'CALL', 'PUT'
    const statusFilter = searchParams.get('status') || 'all'; // 'all', 'TARGET_HIT', 'SL_HIT', 'ACTIVE', etc.
    const userId = req.headers.get('x-user-id') || searchParams.get('userId');

    if (!supabase) {
      // Fallback: try local FastAPI backend if Supabase is offline
      try {
        const fastApiRes = await fetch(`http://localhost:8000/api/signals/history?limit=${limit}`);
        if (fastApiRes.ok) {
          const fastApiData = await fastApiRes.json();
          return NextResponse.json({
            success: true,
            totalCount: fastApiData.signals?.length || 0,
            page: 1,
            totalPages: 1,
            signals: fastApiData.signals || [],
            source: 'sqlite',
          });
        }
      } catch {}
      return NextResponse.json({
        success: true,
        totalCount: 0,
        page: 1,
        totalPages: 0,
        signals: [],
        message: 'Database persistence layer is not configured.',
      });
    }

    // 1. If userId is provided, get list of signals deleted by this user to exclude them
    let deletedSignalIds: string[] = [];
    if (userId) {
      try {
        const { data: userDeleted } = await supabase
          .from('user_deleted_signals')
          .select('signal_id')
          .eq('user_id', userId);
        deletedSignalIds = (userDeleted || []).map((d: any) => d.signal_id);
      } catch (err) {
        console.warn('[signals/history] user_deleted_signals check notice:', err);
      }
    }

    // 2. Build Supabase query
    let query = supabase
      .from('signals')
      .select(`
        *,
        signal_components(*),
        signal_events(*)
      `, { count: 'exact' })
      .neq('status', 'DELETED')
      .neq('signal_type', 'NO_TRADE');

    // Exclude user-deleted signals
    if (deletedSignalIds.length > 0) {
      query = query.not('id', 'in', `(${deletedSignalIds.map(id => `"${id}"`).join(',')})`);
    }

    // Date filtering
    const today = todayIST();
    if (dateFilter === 'today') {
      query = query.gte('created_at', `${today}T00:00:00+05:30`);
    } else if (dateFilter === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      query = query.gte('created_at', d.toISOString());
    } else if (dateFilter === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      query = query.gte('created_at', d.toISOString());
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
      query = query
        .gte('created_at', `${dateFilter}T00:00:00+05:30`)
        .lte('created_at', `${dateFilter}T23:59:59+05:30`);
    }

    // Type filtering (CALL vs PUT)
    if (typeFilter.toUpperCase() === 'CALL') {
      query = query.or('signal_type.eq.CALL_BUY,option_type.eq.CE');
    } else if (typeFilter.toUpperCase() === 'PUT') {
      query = query.or('signal_type.eq.PUT_BUY,option_type.eq.PE');
    }

    // Status filtering
    if (statusFilter.toUpperCase() === 'TARGET_HIT') {
      query = query.in('status', ['TARGET1_HIT', 'TARGET2_HIT']);
    } else if (statusFilter.toUpperCase() === 'SL_HIT') {
      query = query.eq('status', 'SL_HIT');
    } else if (statusFilter.toUpperCase() === 'ACTIVE') {
      query = query.in('status', ['WATCH', 'WAITING_FOR_ENTRY', 'ENTRY_TRIGGERED', 'POSITION_ACTIVE', 'TRAILING_SL']);
    }

    // Ordering and Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data: signals, count, error } = await query;

    if (error) {
      console.error('[signals/history] Database query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Format signals with complete audit information
    const formattedSignals = (signals || []).map((s: any) => {
      // Extract exact IST time
      const createdDate = s.created_at ? new Date(s.created_at) : null;
      const istTime = createdDate && !isNaN(createdDate.getTime())
        ? createdDate.toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: 'Asia/Kolkata', hour12: true
          }).toUpperCase()
        : '—';
      const istDate = createdDate && !isNaN(createdDate.getTime())
        ? createdDate.toLocaleDateString('en-IN', {
            year: 'numeric', month: 'short', day: '2-digit',
            timeZone: 'Asia/Kolkata'
          })
        : '—';

      return {
        id: s.id,
        date: istDate,
        time: istTime,
        exactTimestamp: s.created_at,
        instrument: s.instrument || 'NIFTY',
        signalType: s.signal_type,
        optionType: s.option_type || (s.signal_type === 'CALL_BUY' ? 'CE' : 'PE'),
        strike: s.strike,
        expiry: s.expiry,
        niftyPrice: s.nifty_price,
        entryPrice: s.entry_low && s.entry_high ? +((s.entry_low + s.entry_high) / 2).toFixed(1) : s.entry_low || 0,
        entryLow: s.entry_low,
        entryHigh: s.entry_high,
        entryTrigger: s.entry_trigger,
        sl: s.sl,
        slReason: s.sl_reason,
        target1: s.target1,
        target2: s.target2,
        target3: s.target3,
        rrRatio: s.rr_ratio,
        signalScore: s.signal_score,
        confidence: s.confidence,
        regime: s.regime,
        trendDirection: s.trend_direction,
        technicalReason: s.technical_reason,
        oiReason: s.oi_reason,
        chainReason: s.chain_reason,
        status: s.status,
        exitTime: s.exited_at,
        exitPrice: s.exit_price,
        exitReason: s.exit_reason,
        simulatedPnl: s.simulated_pnl,
        events: s.signal_events || [],
        components: s.signal_components || [],
      };
    });

    return NextResponse.json({
      success: true,
      totalCount,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      signals: formattedSignals,
    });
  } catch (err: any) {
    console.error('[signals/history] Exception:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}
