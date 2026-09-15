import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/signals/[id]
// Soft-deletes a signal by setting status = 'DELETED'.
// The signal will no longer appear in any feed but is preserved for audit.
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing signal id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // If no Supabase (dev/mock mode), just return success so the UI can do
  // an optimistic local-state removal.
  if (!supabase) {
    return NextResponse.json({ success: true, deleted: id, mode: 'local_only' });
  }

  const { error } = await supabase
    .from('signals')
    .update({ status: 'DELETED', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[DELETE /api/signals/[id]]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: id });
}
