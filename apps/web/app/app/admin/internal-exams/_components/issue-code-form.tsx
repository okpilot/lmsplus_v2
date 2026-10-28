'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
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
  onIssued: (issued: { codeId: string; code: string; expiresAt: string }) => void
}

function useIssueCode(onIssued: Props['onIssued']) {
  const [studentId, setStudentId] = useState<string>('')
  const [subjectId, setSubjectId] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  const canSubmit = studentId !== '' && subjectId !== ''

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    startTransition(async () => {
      try {
        const result = await issueInternalExamCode({ studentId, subjectId })
        if (result.success) {
          toast.success('Internal exam code issued')
          onIssued({ codeId: result.codeId, code: result.code, expiresAt: result.expiresAt })
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

  return { studentId, setStudentId, subjectId, setSubjectId, isPending, canSubmit, handleSubmit }
}

export function IssueCodeForm({ students, subjects, onIssued }: Readonly<Props>) {
  const { studentId, setStudentId, subjectId, setSubjectId, isPending, canSubmit, handleSubmit } =
    useIssueCode(onIssued)

  const studentItems = students.map((s) => ({
    value: s.id,
    label: s.fullName ? `${s.fullName} (${s.email})` : s.email,
  }))
  const subjectItems = subjects.map((s) => ({
    value: s.id,
    label: `${s.code} — ${s.name}`,
  }))

  return (
    <Card>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
          data-testid="issue-code-form"
        >
          <PickField
            id="student"
            label="Student"
            placeholder="Select student"
            value={studentId}
            onChange={setStudentId}
            disabled={isPending || students.length === 0}
            items={studentItems}
          />

          <PickField
            id="subject"
            label="Subject"
            placeholder="Select subject"
            value={subjectId}
            onChange={setSubjectId}
            disabled={isPending || subjects.length === 0}
            items={subjectItems}
          />

          <LoadingButton
            type="submit"
            disabled={!canSubmit}
            loading={isPending}
            loadingText="Issuing…"
          >
            Issue code
          </LoadingButton>
        </form>
      </CardContent>
    </Card>
  )
}

type PickFieldProps = {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  items: { value: string; label: string }[]
}

function PickField({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  items,
}: Readonly<PickFieldProps>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => v && onChange(v)}
        disabled={disabled}
        items={items}
      >
        <SelectTrigger id={id} aria-label={label} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
