'use client'

import { useId } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DIFFICULTY_ITEMS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const STATUS_ITEMS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
]

type Props = {
  difficulty: string
  status: string
  isPending: boolean
  onDifficultyChange: (v: string | null) => void
  onStatusChange: (v: string | null) => void
}

export function DifficultyStatusSelect({
  difficulty,
  status,
  isPending,
  onDifficultyChange,
  onStatusChange,
}: Readonly<Props>) {
  const difficultyId = useId()
  const statusId = useId()
  return (
    <div className="grid grid-cols-2 gap-stack-lg [&>div]:min-w-0 [&_[data-slot=select-trigger]]:w-full">
      <div>
        <Label htmlFor={difficultyId} className="mb-1 block">
          Difficulty
        </Label>
        <Select
          value={difficulty}
          onValueChange={onDifficultyChange}
          disabled={isPending}
          items={DIFFICULTY_ITEMS}
        >
          <SelectTrigger id={difficultyId} aria-label="Difficulty">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="easy" label="Easy">
              Easy
            </SelectItem>
            <SelectItem value="medium" label="Medium">
              Medium
            </SelectItem>
            <SelectItem value="hard" label="Hard">
              Hard
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={statusId} className="mb-1 block">
          Status
        </Label>
        <Select
          value={status}
          onValueChange={onStatusChange}
          disabled={isPending}
          items={STATUS_ITEMS}
        >
          <SelectTrigger id={statusId} aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft" label="Draft">
              Draft
            </SelectItem>
            <SelectItem value="active" label="Active">
              Active
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
