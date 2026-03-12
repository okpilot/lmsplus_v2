'use client'

import type { SubjectOption } from '@/lib/queries/quiz'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { startReviewSession } from '../actions'

type ReviewConfigFormProps = {
  subjects: SubjectOption[]
  dueCount: number
}

export function ReviewConfigForm({ subjects, dueCount }: ReviewConfigFormProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSubject(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleStart() {
    setLoading(true)
    setError(null)

    const subjectIds = selectedIds.size > 0 ? [...selectedIds] : undefined
    const result = await startReviewSession({ subjectIds })

    if (result.success) {
      sessionStorage.setItem(
        'review-session',
        JSON.stringify({ sessionId: result.sessionId, questionIds: result.questionIds }),
      )
      router.push('/app/review/session')
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-3xl font-bold tabular-nums">{dueCount}</p>
        <p className="text-xs text-muted-foreground">Due for review</p>
      </div>

      {subjects.length > 1 && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Filter by subject (optional)</legend>
          <div className="space-y-1.5">
            {subjects.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.has(s.id)}
                  onChange={() => toggleSubject(s.id)}
                  className="rounded border-input"
                />
                {s.code} — {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        disabled={dueCount === 0 || loading}
        onClick={handleStart}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Starting...' : 'Start Smart Review'}
      </button>
    </div>
  )
}
