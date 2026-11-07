import type { ActionResult } from '@/lib/action-result'
import type { requireAdmin } from '@/lib/auth/require-admin'

export type AdminSupabase = Awaited<ReturnType<typeof requireAdmin>>['supabase']

/** Null when the parent row exists and is not deleted; otherwise the failure to return. */
export async function checkLiveParent(
  supabase: AdminSupabase,
  parent: { table: 'easa_subjects' | 'easa_topics'; id: string; label: 'topic' | 'subtopic' },
): Promise<ActionResult | null> {
  const { data, error } = await supabase
    .from(parent.table)
    .select('id')
    .eq('id', parent.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.error(`[checkLiveParent] ${parent.label} parent lookup error:`, error.message)
    return { success: false, error: `Failed to create ${parent.label}` }
  }
  return data ? null : { success: false, error: 'Item not found' }
}

/** Live-parent / deleted-row trigger rejections map to "Item not found"; anything else is logged. */
export function writeFailure(
  ctx: { fn: string; op: 'insert' | 'update'; entity: string },
  message: string,
): ActionResult {
  if (message.includes('parent_not_found') || message.includes('item_deleted')) {
    return { success: false, error: 'Item not found' }
  }
  console.error(`[${ctx.fn}] ${ctx.op} error:`, message)
  return {
    success: false,
    error: `Failed to ${ctx.op === 'insert' ? 'create' : 'update'} ${ctx.entity}`,
  }
}
