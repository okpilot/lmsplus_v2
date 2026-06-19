'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { startVfrRtExam } from '@/app/app/vfr-rt-exam/actions/start'
import { LoadingButton } from '@/components/ui/loading-button'

type Props = {
  subjectId: string
  subjectName: string
}

export function VfrRtExamBriefing({ subjectId, subjectName }: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleStart() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await startVfrRtExam({ subjectId })
        if (result.success) {
          router.push(`/app/vfr-rt-exam/in-progress/${result.sessionId}`)
          return
        }
        setError(result.error)
      } catch {
        setError('Something went wrong. Please try again.')
      }
    })
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">{subjectName}</h2>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            This mock exam assesses your VFR radiotelephony proficiency for Slovenian airspace in
            three parts:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong className="text-foreground">Part 1 — Acronyms & Short Answer</strong>: 8
              questions
            </li>
            <li>
              <strong className="text-foreground">Part 2 — Dialog Fill-in</strong>: 9 questions
            </li>
            <li>
              <strong className="text-foreground">Part 3 — Multiple Choice</strong>: 8 questions
            </li>
          </ul>
          <p>
            <strong className="text-foreground">Time limit:</strong> 30 minutes.
          </p>
          <p>
            <strong className="text-foreground">Pass mark:</strong> ≥75% in every part. You must
            pass all three parts to pass the exam.
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <LoadingButton
        onClick={handleStart}
        loading={isPending}
        loadingText="Starting…"
        className="w-full"
      >
        Start exam
      </LoadingButton>
    </div>
  )
}
