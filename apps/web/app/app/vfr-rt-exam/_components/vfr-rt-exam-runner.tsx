'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import { ExamCountdownTimer } from '@/app/app/quiz/_components/exam-countdown-timer'
import { parseStartedAt } from '@/app/app/quiz/session/_utils/parse-started-at'
import { Button } from '@/components/ui/button'
import type { VfrRtQuestion } from '@/lib/queries/vfr-rt-exam'
import { useVfrRtAnswers } from '../_hooks/use-vfr-rt-answers'
import { buildVfrRtPayload } from '../_utils/build-vfr-rt-payload'
import { buildPartSegments, partForType } from '../_utils/vfr-rt-parts'
import { submitVfrRtExam } from '../actions/submit'
import { PartProgress } from './part-progress'
import { VfrRtPartNav } from './vfr-rt-part-nav'
import { VfrRtQuestionView } from './vfr-rt-question'

type VfrRtExamRunnerProps = {
  sessionId: string
  startedAt: string
  timeLimitSeconds: number
  questions: VfrRtQuestion[]
}

export function VfrRtExamRunner({
  sessionId,
  startedAt,
  timeLimitSeconds,
  questions,
}: VfrRtExamRunnerProps) {
  const router = useRouter()
  const { answers, setMc, setShort, setBlank } = useVfrRtAnswers(sessionId)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Synchronous one-shot gate: isPending is async React state, so a manual
  // Finish click and a simultaneous timer expiry could both pass an isPending
  // check before React commits. The ref blocks the second caller in the same frame.
  const submittedRef = useRef(false)

  const segments = useMemo(() => buildPartSegments(questions, answers), [questions, answers])

  function handleSubmit() {
    if (isPending || submittedRef.current) return
    submittedRef.current = true
    setError(null)
    startTransition(async () => {
      const payload = buildVfrRtPayload(questions, answers)
      const result = await submitVfrRtExam({ sessionId, answers: payload })
      if (result.success) {
        router.push(result.redirect_to)
        return
      }
      submittedRef.current = false // allow retry after a failed submit
      setError(result.error)
    })
  }

  // The in-progress page only renders the runner with a non-empty question set
  // (the RPC returns ≥1 question or the page redirects). currentIndex is clamped
  // to [0, length-1], so this guard is unreachable in practice.
  const question = questions[currentIndex]
  if (!question) return null
  const headingId = `vfr-q-${question.id}`

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">VFR Radiotelephony Exam</h1>
        <ExamCountdownTimer
          timeLimitSeconds={timeLimitSeconds}
          startedAt={parseStartedAt(startedAt)}
          onExpired={handleSubmit}
        />
      </header>

      <PartProgress segments={segments} />

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <h2 id={headingId} className="text-base font-medium">
          {partForType(question.question_type).label} · Question {question.question_number}
        </h2>
        <p className="text-sm text-muted-foreground">{question.question_text}</p>
        <VfrRtQuestionView
          question={question}
          headingId={headingId}
          answer={answers[question.id]}
          setMc={setMc}
          setShort={setShort}
          setBlank={setBlank}
        />
      </section>

      <VfrRtPartNav
        currentIndex={currentIndex}
        total={questions.length}
        partLabel={partForType(question.question_type).label}
        onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        onNext={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
      />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        Finish &amp; submit exam
      </Button>
    </main>
  )
}
