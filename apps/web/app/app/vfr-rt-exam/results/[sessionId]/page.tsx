import { redirect } from 'next/navigation'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { getVfrRtResults } from '@/lib/queries/vfr-rt-results'
import { VfrRtResultsBreakdown } from '../../_components/vfr-rt-results-breakdown'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ sessionId: string }> }

export default async function VfrRtResultsPage({ params }: Props) {
  await requireAuthUser()
  const { sessionId } = await params
  const results = await getVfrRtResults(sessionId)

  if (!results) redirect('/app/vfr-rt-exam')

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">VFR RT Exam Results</h1>
      <VfrRtResultsBreakdown results={results} />
    </div>
  )
}
