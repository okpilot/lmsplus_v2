import { notFound } from 'next/navigation'
import { z } from 'zod'
import type { SittingParams } from '../parse-sitting-params'
import { resolveSelection } from '../people-queries'
import { getSitting, getSummary, listInvigilatorOptions } from '../queries'
import { getRemoved, getRoster } from '../roster-queries'
import type { Selection } from '../types'

const EMPTY: Selection = { kind: 'empty' }

const isoDay = (iso: string) => new Date(iso).toISOString().slice(0, 10)

type SittingReadCtx = {
  id: string
  params: SittingParams
  editable: boolean
  popup: 'exams' | 'issue' | null
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
  const ctx = { id: id.data, params, editable, popup }
  const [sitting, roster, removed, invigilators, selection] = await readSittingData(ctx)
  if (!sitting || !roster || !removed) notFound()
  const notDue = new Date().toISOString().slice(0, 10) < isoDay(sitting.scheduledAt)
  return {
    sitting,
    summary,
    roster,
    removed,
    invigilators,
    notDue,
    editable,
    selection,
  }
}
