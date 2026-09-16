import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// DELETE /api/signals/[id]
// Permanently deletes a signal and associated events/components from the database.
// Supports user-level deletion tracking if userId is provided.
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing signal id' }, { status: 400 });
    }

    // Validate UUID format to prevent database syntax errors
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: `Invalid signal ID format: "${id}". Expected valid UUID.` },
        { status: 400 }
      );
    }

    const userId = req.headers.get('x-user-id') || req.nextUrl.searchParams.get('userId');
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      // If running against local FastAPI backend, attempt delete there
      try {
        const fastApiRes = await fetch(`http://localhost:8000/api/signals/${id}`, { method: 'DELETE' });
        if (fastApiRes.ok) {
          return NextResponse.json({ success: true, deleted: id, target: 'sqlite' });
        }
      } catch {}
      return NextResponse.json(
        { success: false, error: 'Database persistence layer unavailable.' },
        { status: 503 }
      );
    }

    // 1. If userId is provided, record deletion in user_deleted_signals for user-level isolation
    if (userId) {
      try {
        await supabase.from('user_deleted_signals').upsert({
          user_id: userId,
          signal_id: id,
          deleted_at: new Date().toISOString(),
        });
      } catch (userDelErr) {
        console.warn('[DELETE /api/signals/[id]] User isolation notice:', userDelErr);
      }
    }

    // 2. Cascade delete children in case ON DELETE CASCADE is disabled or pending
    try {
      await supabase.from('signal_events').delete().eq('signal_id', id);
      await supabase.from('signal_components').delete().eq('signal_id', id);
    } catch (cascadeErr) {
      console.warn('[DELETE /api/signals/[id]] Cascade cleanup notice:', cascadeErr);
    }

    // 3. Delete the signal record from database
    const { error } = await supabase.from('signals').delete().eq('id', id);

    if (error) {
      console.error('[DELETE /api/signals/[id]] Database error:', error);
      // If hard-delete fails (e.g. RLS constraint), fall back to soft-delete
      const { error: softErr } = await supabase
        .from('signals')
        .update({ status: 'DELETED', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (softErr) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    console.log(`[DELETE /api/signals/[id]] Successfully deleted signal ${id}`);
    return NextResponse.json({ success: true, deleted: id });
  } catch (err: any) {
    console.error('[DELETE /api/signals/[id]] Exception:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
