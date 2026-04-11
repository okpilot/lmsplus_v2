'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Configure Exam &mdash; {subject.code} {subject.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Set exam parameters and question distribution for this subject.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="enabled" className="text-sm font-medium">
              Enable exam mode for this subject
            </Label>
          </div>

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

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || !isValid}>
            {isPending ? 'Saving...' : 'Save Config'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
