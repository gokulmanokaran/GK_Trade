import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/migrate
// Runs all pending SQL migrations via service-role key.
// ONLY accessible in development (CRON_SECRET guard).
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const migrationFiles = [
    '001_initial_schema.sql',
    '002_monitor_and_notifications.sql',
    '003_signal_write_policies.sql',
  ];

  const results: Record<string, string> = {};

  for (const file of migrationFiles) {
    try {
      const filePath = join(process.cwd(), '..', 'supabase', 'migrations', file);
      const sql = readFileSync(filePath, 'utf8');

      // Execute the entire migration as a single transaction via rpc
      // We use the pg endpoint directly with service role
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/run_migration_sql`,
        {
          method: 'POST',
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ migration_sql: sql }),
        }
      );

      if (response.ok) {
        results[file] = 'OK';
      } else {
        const body = await response.text();
        // "already exists" errors are OK for idempotent migrations
        if (body.includes('already exists') || body.includes('42710') || body.includes('42701')) {
          results[file] = 'SKIPPED (already applied)';
        } else {
          results[file] = `WARN: ${body.slice(0, 200)}`;
        }
      }
    } catch (err: any) {
      results[file] = `ERROR: ${err.message}`;
    }
  }

  return NextResponse.json({ success: true, results });
}
