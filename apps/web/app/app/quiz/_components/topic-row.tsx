'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

type TopicRowProps = {
  code: string
  name: string
  count: number
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
  indented?: boolean
}

export function TopicRow({
  code,
  name,
  count,
  checked,
  onCheckedChange,
  isExpanded,
  onToggleExpand,
  indented,
}: TopicRowProps) {
  return (
    <div className={`flex items-center gap-2 py-1.5 ${indented ? 'pl-7' : ''}`}>
      {onToggleExpand ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ) : (
        !indented && <span className="w-5" />
      )}
      <Checkbox checked={checked} onCheckedChange={(c) => onCheckedChange(c === true)} />
      <span className={`flex-1 text-sm ${checked ? 'text-foreground' : 'text-muted-foreground'}`}>
        {code} — {name}
      </span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </div>
  )
}
