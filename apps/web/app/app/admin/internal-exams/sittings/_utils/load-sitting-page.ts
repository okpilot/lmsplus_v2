import { notFound } from 'next/navigation'
import { z } from 'zod'
import type { SittingParams } from '../parse-sitting-params'
import { resolveSelection } from '../people-queries'
import { getSitting, getSummary, listInvigilatorOptions } from '../queries'
import { getRemoved, getRoster } from '../roster-queries'
import type { Selection } from '../types'

const EMPTY: Selection = { kind: 'empty' }

const isoDay = (iso: string) => new Date(iso).toISOString().slice(0, 10)

/** Everything the sitting page renders; calls `notFound()` for a bad id or a sitting outside the org. */
export async function loadSittingPage(rawId: string, params: SittingParams) {
  const id = z.uuid().safeParse(rawId)
  if (!id.success) notFound()
  // The summary goes first: it lazy-closes and prunes before the roster reads.
  const summary = await getSummary(id.data)
  if (!summary) notFound()
  // Only scheduled and open sittings with a live day have an Edit dialog, the only consumer of the options.
  const editable =
    (summary.status === 'scheduled' || summary.status === 'open') && !summary.dayEnded
  const popup = params.dlg === 'exams' || params.dlg === 'issue' ? params.dlg : null
  const [sitting, roster, removed, invigilators, selection] = await Promise.all([
    getSitting(id.data),
    getRoster({ sittingId: id.data, q: params.q, show: params.show, page: params.page }),
    getRemoved(id.data),
    editable ? listInvigilatorOptions() : Promise.resolve([]),
    editable && popup ? resolveSelection(id.data, popup, params.selection) : Promise.resolve(EMPTY),
  ])
  if (!sitting || !roster || !removed) notFound()
  const notDue = new Date().toISOString().slice(0, 10) < isoDay(sitting.scheduledAt)
  return { sitting, summary, roster, removed, invigilators, notDue, editable, selection }
}
