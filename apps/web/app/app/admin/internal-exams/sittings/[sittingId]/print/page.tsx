import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { Heading } from '@/components/ui/heading'
import { requireAdmin } from '@/lib/auth/require-admin'
import { PrintButton } from '../../_components/print-button'
import { PrintCodesCard } from '../../_components/print-codes-card'
import { formatTitleDate } from '../../_utils/format-dates'
import { getSummary } from '../../queries'
import { getRosterAll } from '../../roster-queries'
import { SITTING_BASE } from '../../types'

type PageProps = { params: Promise<{ sittingId: string }> }

const LIVE: ReadonlySet<string> = new Set(['waiting', 'ready'])

/** Printable codes of a scheduled or open sitting; plaintext codes, admin only. */
export default async function PrintCodesPage({ params }: Readonly<PageProps>) {
  await requireAdmin()
  const id = z.uuid().safeParse((await params).sittingId)
  if (!id.success) notFound()
  const summary = await getSummary(id.data)
  if (!summary || summary.dayEnded) notFound()
  if (summary.status !== 'scheduled' && summary.status !== 'open') notFound()
  const people = (await getRosterAll(id.data))
    .map((r) => ({ ...r, entries: r.entries.filter((e) => e.code && LIVE.has(e.status)) }))
    .filter((r) => r.entries.length > 0)
  return (
    <div className="mx-auto max-w-content space-y-section p-gutter print:p-0">
      <Link href={`${SITTING_BASE}/${id.data}`} className="text-caption underline print:hidden">
        Back to sitting
      </Link>
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Heading level={1}>Exam codes · {formatTitleDate(summary.scheduledAt)}</Heading>
        <PrintButton />
      </div>
      {people.length === 0 && <p className="text-muted-foreground">No live codes to print.</p>}
      <div className="grid gap-cards sm:grid-cols-2 print:grid-cols-2">
        {people.map((r) => (
          <PrintCodesCard key={r.userId} person={r} scheduledAt={summary.scheduledAt} />
        ))}
      </div>
    </div>
  )
}
