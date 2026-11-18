import Link from 'next/link'
import { Heading } from '@/components/ui/heading'
import { requireAdmin } from '@/lib/auth/require-admin'
import { PrintButton } from '../../_components/print-button'
import { PrintCodesCard } from '../../_components/print-codes-card'
import { formatTitleDate } from '../../_utils/format-dates'
import { loadPrintPage } from '../../_utils/load-print-page'
import { SITTING_BASE } from '../../types'

type PageProps = { params: Promise<{ sittingId: string }> }

/** Printable codes of a scheduled or open sitting; plaintext codes, admin only. */
export default async function PrintCodesPage({ params }: Readonly<PageProps>) {
  await requireAdmin()
  const { sittingId, scheduledAt, people } = await loadPrintPage((await params).sittingId)
  return (
    <div className="mx-auto max-w-content space-y-section p-gutter print:p-0">
      <Link href={`${SITTING_BASE}/${sittingId}`} className="text-caption underline print:hidden">
        Back to sitting
      </Link>
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Heading level={1}>Exam codes · {formatTitleDate(scheduledAt)}</Heading>
        <PrintButton />
      </div>
      {people.length === 0 && <p className="text-muted-foreground">No live codes to print.</p>}
      <div className="grid gap-cards sm:grid-cols-2 print:grid-cols-2">
        {people.map((r) => (
          <PrintCodesCard key={r.userId} person={r} scheduledAt={scheduledAt} />
        ))}
      </div>
    </div>
  )
}
