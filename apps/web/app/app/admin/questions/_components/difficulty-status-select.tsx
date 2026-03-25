'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Difficulty</span>
        <Select value={difficulty} onValueChange={onDifficultyChange} disabled={isPending}>
          <SelectTrigger aria-label="Difficulty">
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
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Status</span>
        <Select value={status} onValueChange={onStatusChange} disabled={isPending}>
          <SelectTrigger aria-label="Status">
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
