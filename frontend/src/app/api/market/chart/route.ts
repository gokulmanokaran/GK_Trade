import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataProvider } from '@/lib/market-data';
import { calculateAllIndicators } from '@/lib/analysis/technical';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get('timeframe') || '5m';
    const limit = Math.min(200, parseInt(searchParams.get('limit') || '80'));

    const provider = getMarketDataProvider();
    const candles = await provider.getHistoricalData(timeframe, limit);

    const indicators = calculateAllIndicators(candles);

    return NextResponse.json({
      success: true,
      data: {
        timeframe,
        candles: candles.map((c) => ({
          ...c,
          timestamp: c.timestamp.toISOString(),
        })),
        indicators,
        count: candles.length,
      },
    });
  } catch (err: any) {
    console.error('[API /market/chart]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
