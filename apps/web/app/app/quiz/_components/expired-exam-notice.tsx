'use client'

import { useRouter } from 'next/navigation'

type Props = {
  sessionId: string
}

export function ExpiredExamNotice({ sessionId }: Props) {
  const router = useRouter()

  function handleViewResults() {
    router.push(`/app/quiz/report?session=${sessionId}`)
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
      <p className="text-sm font-medium text-foreground">Practice Exam expired</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Your exam time has ended. View your results below.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleViewResults}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
        >
          View Results
        </button>
      </div>
    </div>
  )
}
