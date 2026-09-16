import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataProvider } from '@/lib/market-data';
import { getMarketStatus } from '@/lib/market-hours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const provider = getMarketDataProvider();
    const [quote, status] = await Promise.all([
      provider.getNiftyQuote(),
      provider.getMarketStatus(),
    ]);

    const ageSeconds = Math.floor((Date.now() - new Date(quote.timestamp).getTime()) / 1000);

    return NextResponse.json({
      success: true,
      data: {
        ...quote,
        timestamp: quote.timestamp.toISOString(),
        dataAge: ageSeconds,
        isStale: ageSeconds > 30 && status.isOpen,
        marketStatus: status,
        providerStatus: quote.isMock ? 'MOCK' : 'LIVE',
      },
    });
  } catch (err: any) {
    console.error('[API /market/quote]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
