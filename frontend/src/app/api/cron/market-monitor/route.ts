import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Frequent cron has been removed from Vercel Hobby plan.
  // Use POST /api/monitor/nifty for external scheduler / watchdog calls.
  return NextResponse.json({
    status: 'DEPRECATED',
    message: 'Frequent Vercel Cron removed for Vercel Hobby plan. Use POST /api/monitor/nifty or persistent monitoring daemon.',
  });
}
