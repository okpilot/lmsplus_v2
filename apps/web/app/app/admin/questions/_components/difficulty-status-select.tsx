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
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
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
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
