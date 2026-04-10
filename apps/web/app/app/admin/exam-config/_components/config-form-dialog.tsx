'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { upsertExamConfig } from '../actions/upsert-exam-config'
import type { SubjectWithConfig } from '../types'
import { DistributionEditor } from './distribution-editor'
import { NumField } from './num-field'

type Props = {
  subject: SubjectWithConfig
  open: boolean
  onOpenChange: (open: boolean) => void
}

type DistRow = { topicId: string; subtopicId: string | null; questionCount: number }

export function ConfigFormDialog({ subject, open, onOpenChange }: Props) {
  const config = subject.config
  const [isPending, startTransition] = useTransition()
  const [totalQuestions, setTotalQuestions] = useState(config?.totalQuestions ?? 16)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(
    config ? Math.floor(config.timeLimitSeconds / 60) : 30,
  )
  const [passMark, setPassMark] = useState(config?.passMark ?? 75)
  const [enabled, setEnabled] = useState(config?.enabled ?? false)
  const [distributions, setDistributions] = useState<DistRow[]>(
    config?.distributions.map((d) => ({
      topicId: d.topicId,
      subtopicId: d.subtopicId,
      questionCount: d.questionCount,
    })) ?? subject.topics.map((t) => ({ topicId: t.id, subtopicId: null, questionCount: 0 })),
  )

  const distributionSum = distributions.reduce((s, d) => s + d.questionCount, 0)
  const isValid = distributionSum === totalQuestions && totalQuestions > 0

  function handleSubmit() {
    startTransition(async () => {
      const result = await upsertExamConfig({
        subjectId: subject.id,
        enabled,
        totalQuestions,
        timeLimitSeconds: timeLimitMinutes * 60,
        passMark,
        distributions: distributions.filter((d) => d.questionCount > 0),
      })
      if (result.success) {
        toast.success('Exam configuration saved')
        onOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Configure Exam &mdash; {subject.code} {subject.name}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm font-medium">Enable exam mode for this subject</span>
          </label>

          <div className="grid grid-cols-3 gap-4">
            <NumField
              label="Total Questions"
              value={totalQuestions}
              min={1}
              max={200}
              onChange={setTotalQuestions}
            />
            <NumField
              label="Time Limit (min)"
              value={timeLimitMinutes}
              min={1}
              max={240}
              onChange={setTimeLimitMinutes}
            />
            <NumField
              label="Pass Mark (%)"
              value={passMark}
              min={1}
              max={100}
              onChange={setPassMark}
            />
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold">Question Distribution</h3>
            <DistributionEditor
              topics={subject.topics}
              distributions={distributions}
              onChange={setDistributions}
            />
            <div
              className={`mt-2 text-sm font-medium ${isValid ? 'text-green-500' : 'text-red-500'}`}
            >
              Total: {distributionSum} / {totalQuestions}
              {isValid ? ' \u2713' : ' (must match total questions)'}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !isValid}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      </div>
    </div>
  )
}
