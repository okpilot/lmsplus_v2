import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getSummary } from '../queries'
import { getRosterAll } from '../roster-queries'
import { LIVE_ENTRY_STATUSES } from '../types'

/** People with at least one live coded exam of a scheduled or open sitting; `notFound()` otherwise. Caller guards admin. */
export async function loadPrintPage(rawId: string) {
  const id = z.uuid().safeParse(rawId)
  if (!id.success) notFound()
  const summary = await getSummary(id.data)
  if (!summary || summary.dayEnded) notFound()
  if (summary.status !== 'scheduled' && summary.status !== 'open') notFound()
  const people = (await getRosterAll(id.data))
    .filter((r) => !r.deactivated)
    .map((r) => ({
      ...r,
      entries: r.entries.filter((e) => e.code && LIVE_ENTRY_STATUSES.has(e.status)),
    }))
    .filter((r) => r.entries.length > 0)
  return { sittingId: id.data, scheduledAt: summary.scheduledAt, people }
}
