import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getSitting, getSummary, listInvigilatorOptions } from '../queries'

const isoDay = (iso: string) => new Date(iso).toISOString().slice(0, 10)

/** Everything the sitting page renders; calls `notFound()` for a bad id or a sitting outside the org. */
export async function loadSittingPage(rawId: string) {
  const id = z.uuid().safeParse(rawId)
  if (!id.success) notFound()
  const summary = await getSummary(id.data)
  if (!summary) notFound()
  // Only scheduled and open sittings have an Edit dialog, the only consumer of the options.
  const editable = summary.status === 'scheduled' || summary.status === 'open'
  const [sitting, invigilators] = await Promise.all([
    getSitting(id.data),
    editable ? listInvigilatorOptions() : Promise.resolve([]),
  ])
  if (!sitting) notFound()
  const notDue = new Date().toISOString().slice(0, 10) < isoDay(sitting.scheduledAt)
  return { sitting, summary, invigilators, notDue }
}
