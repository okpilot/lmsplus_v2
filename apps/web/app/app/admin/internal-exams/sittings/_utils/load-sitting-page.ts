import { notFound, unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  getDeliverablePendingNotices,
  type PendingNotice,
  type UserClient,
} from '../../notice-queries'
import type { SittingParams } from '../parse-sitting-params'
import { resolveSelection } from '../people-queries'
import { getSitting, getSummary, listInvigilatorOptions } from '../queries'
import { getRemoved, getRoster } from '../roster-queries'
import type { Selection } from '../types'
import { groupNotices } from './deliver-notices'

const EMPTY: Selection = { kind: 'empty' }

const isoDay = (iso: string) => new Date(iso).toISOString().slice(0, 10)

async function loadPendingNotices(
  count: number,
  ctx: { supabase: UserClient; organizationId: string; sittingId: string },
): Promise<PendingNotice[] | null> {
  if (count === 0) return []
  try {
    return await getDeliverablePendingNotices(ctx.supabase, ctx.organizationId, ctx.sittingId)
  } catch (e: unknown) {
    unstable_rethrow(e)
    console.error('[loadSittingPage] pending notices failed:', e instanceof Error ? e.message : e)
    return null
  }
}

const groupedCount = (notices: PendingNotice[] | null, rawCount: number) =>
  notices ? groupNotices(notices).length : rawCount

type SittingReadCtx = {
  id: string
  params: SittingParams
  editable: boolean
  popup: 'exams' | 'issue' | null
  summary: { pendingRemovalNotices: number }
  supabase: UserClient
  organizationId: string
}

function editFlags(summary: { status: string; dayEnded: boolean }, params: SittingParams) {
  // Only scheduled and open sittings with a live day have an Edit dialog, the only consumer of the options.
  const editable =
    (summary.status === 'scheduled' || summary.status === 'open') && !summary.dayEnded
  const popup = params.dlg === 'exams' || params.dlg === 'issue' ? params.dlg : null
  return { editable, popup }
}

function readSittingData(ctx: SittingReadCtx) {
  const { id, params, editable, popup } = ctx
  return Promise.all([
    getSitting(id),
    getRoster({ sittingId: id, q: params.q, show: params.show, page: params.page }),
    getRemoved(id),
    editable ? listInvigilatorOptions() : Promise.resolve([]),
    editable && popup ? resolveSelection(id, popup, params.selection) : Promise.resolve(EMPTY),
    loadPendingNotices(ctx.summary.pendingRemovalNotices, {
      supabase: ctx.supabase,
      organizationId: ctx.organizationId,
      sittingId: id,
    }),
  ])
}

/** Everything the sitting page renders; calls `notFound()` for a bad id or a sitting outside the org. */
export async function loadSittingPage(rawId: string, params: SittingParams) {
  const id = z.uuid().safeParse(rawId)
  if (!id.success) notFound()
  // The summary goes first: it lazy-closes and prunes before the roster reads.
  const summary = await getSummary(id.data)
  if (!summary) notFound()
  const { editable, popup } = editFlags(summary, params)
  const admin = await requireAdmin()
  const ctx = { id: id.data, params, summary, editable, popup, ...admin }
  const [sitting, roster, removed, invigilators, selection, notices] = await readSittingData(ctx)
  if (!sitting || !roster || !removed) notFound()
  const notDue = new Date().toISOString().slice(0, 10) < isoDay(sitting.scheduledAt)
  // The banner counts what Send notices can deliver; a failed read falls back to the raw RPC count; one per email.
  return {
    sitting,
    summary: {
      ...summary,
      pendingRemovalNotices: groupedCount(notices, summary.pendingRemovalNotices),
    },
    roster,
    removed,
    invigilators,
    notDue,
    editable,
    selection,
  }
}
