'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { issueInternalExamCode } from '../actions/issue-code'
import type { ExamSubjectOption, OrgStudentOption } from '../types'

type Props = {
  students: OrgStudentOption[]
  subjects: ExamSubjectOption[]
  onIssued: (issued: { code: string; expiresAt: string }) => void
}

export function IssueCodeForm({ students, subjects, onIssued }: Readonly<Props>) {
  const [studentId, setStudentId] = useState<string>('')
  const [subjectId, setSubjectId] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  const studentItems = students.map((s) => ({
    value: s.id,
    label: s.fullName ? `${s.fullName} (${s.email})` : s.email,
  }))
  const subjectItems = subjects.map((s) => ({
    value: s.id,
    label: `${s.code} — ${s.name}`,
  }))

  const canSubmit = studentId !== '' && subjectId !== '' && !isPending

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    startTransition(async () => {
      try {
        const result = await issueInternalExamCode({ studentId, subjectId })
        if (result.success) {
          toast.success('Internal exam code issued')
          onIssued({ code: result.code, expiresAt: result.expiresAt })
          setStudentId('')
          setSubjectId('')
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Failed to issue internal exam code')
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
      data-testid="issue-code-form"
    >
      <div className="grid gap-2">
        <Label htmlFor="student">Student</Label>
        <Select
          value={studentId}
          onValueChange={(v) => v && setStudentId(v)}
          disabled={isPending || students.length === 0}
          items={studentItems}
        >
          <SelectTrigger id="student" aria-label="Student" className="w-full">
            <SelectValue placeholder="Select student" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {studentItems.map((item) => (
              <SelectItem key={item.value} value={item.value} label={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="subject">Subject</Label>
        <Select
          value={subjectId}
          onValueChange={(v) => v && setSubjectId(v)}
          disabled={isPending || subjects.length === 0}
          items={subjectItems}
        >
          <SelectTrigger id="subject" aria-label="Subject" className="w-full">
            <SelectValue placeholder="Select subject" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {subjectItems.map((item) => (
              <SelectItem key={item.value} value={item.value} label={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={!canSubmit}>
        {isPending ? 'Issuing…' : 'Issue code'}
      </Button>
    </form>
  )
}
