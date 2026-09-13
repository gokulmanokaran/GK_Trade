import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataProvider } from '@/lib/market-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const expiry = searchParams.get('expiry') || undefined;

    const provider = getMarketDataProvider();
    const [chain, expiries] = await Promise.all([
      provider.getOptionChain(expiry),
      provider.getExpiries(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...chain,
        expiry: chain.expiry,
        timestamp: chain.timestamp.toISOString(),
        availableExpiries: expiries,
        providerStatus: chain.isMock ? 'MOCK' : 'LIVE',
      },
    });
  } catch (err: any) {
    console.error('[API /market/option-chain]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
