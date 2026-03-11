'use client'

import type { SubjectOption } from '@/lib/queries/quiz'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { startQuizSession } from '../actions'

type QuizConfigFormProps = {
  subjects: SubjectOption[]
}

export function QuizConfigForm({ subjects }: QuizConfigFormProps) {
  const router = useRouter()
  const [subjectId, setSubjectId] = useState('')
  const [count, setCount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    if (!subjectId) return
    setLoading(true)
    setError(null)

    const result = await startQuizSession({
      subjectId,
      topicId: null,
      count,
    })

    if (result.success) {
      sessionStorage.setItem(
        'quiz-session',
        JSON.stringify({ sessionId: result.sessionId, questionIds: result.questionIds }),
      )
      router.push('/app/quiz/session')
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  const selectedSubject = subjects.find((s) => s.id === subjectId)
  const maxQuestions = selectedSubject?.questionCount ?? 10

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="subject" className="mb-1.5 block text-sm font-medium">
          Subject
        </label>
        <select
          id="subject"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select a subject...</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name} ({s.questionCount} questions)
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="count" className="mb-1.5 block text-sm font-medium">
          Number of questions
        </label>
        <input
          id="count"
          type="number"
          min={1}
          max={Math.min(maxQuestions, 50)}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        {selectedSubject && (
          <p className="mt-1 text-xs text-muted-foreground">
            Up to {Math.min(maxQuestions, 50)} available
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        disabled={!subjectId || loading}
        onClick={handleStart}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Starting...' : 'Start Quiz'}
      </button>
    </div>
  )
}
