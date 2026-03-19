'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SubjectOption = {
  id: string
  code: string
  name: string
  short: string
  questionCount: number
}

type SubjectSelectProps = {
  subjects: SubjectOption[]
  value: string
  onValueChange: (value: string) => void
}

export function SubjectSelect({ subjects, value, onValueChange }: SubjectSelectProps) {
  const selected = subjects.find((s) => s.id === value)
  const displayLabel = selected ? `${selected.code} — ${selected.name}` : undefined

  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-medium">Subject</span>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) onValueChange(v)
        }}
      >
        <SelectTrigger className="w-full rounded-[10px]">
          <SelectValue placeholder="Select a subject...">{displayLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {subjects.map((s) => {
            const label = `${s.code} — ${s.name}`
            return (
              <SelectItem key={s.id} value={s.id} label={label}>
                {label}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
