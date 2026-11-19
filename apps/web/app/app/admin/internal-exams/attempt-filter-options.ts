import { requireAdmin } from '@/lib/auth/require-admin'
import { formatUtc } from '@/lib/utils/format-utc'
import { sittingModeLabel } from '@/lib/utils/sitting-mode-label'
import { getGroupOptions } from '../students/queries'
import type { AttemptFilterOptions } from './types'

const SITTING_OPTION_LIMIT = 100

type Supabase = Awaited<ReturnType<typeof requireAdmin>>['supabase']

async function loadSubjects(supabase: Supabase): Promise<AttemptFilterOptions['subjects']> {
  const { data, error } = await supabase
    .from('easa_subjects')
    .select('id, name')
    .is('deleted_at', null)
    .order('sort_order')
  if (error) {
    console.error('[getAttemptFilterOptions] subjects error:', error.message)
    throw new Error('Failed to load attempt filter options')
  }
  return data ?? []
}

async function loadSittings(
  supabase: Supabase,
  organizationId: string,
): Promise<AttemptFilterOptions['sittings']> {
  const { data, error } = await supabase
    .from('exam_sittings')
    .select('id, scheduled_at, mode')
    .eq('organization_id', organizationId)
    .order('scheduled_at', { ascending: false })
    .limit(SITTING_OPTION_LIMIT)
  if (error) {
    console.error('[getAttemptFilterOptions] sittings error:', error.message)
    throw new Error('Failed to load attempt filter options')
  }
  return (data ?? []).map((s) => ({
    id: s.id,
    label: `${formatUtc(s.scheduled_at, { dateStyle: 'short', timeStyle: 'short' })} ${sittingModeLabel(
      s.mode === 'in_person' ? 'in_person' : 'remote',
    )}`,
  }))
}

/** Subject, sitting and group choices for the Attempts tab filters (admin only, org-scoped). */
export async function getAttemptFilterOptions(): Promise<AttemptFilterOptions> {
  const { supabase, organizationId } = await requireAdmin()
  const [subjects, sittings, groups] = await Promise.all([
    loadSubjects(supabase),
    loadSittings(supabase, organizationId),
    getGroupOptions(),
  ])
  return { subjects, sittings, groups }
}
