'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

type TopicRowProps = {
  code: string
  name: string
  count: number
  filteredCount: number | null
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
  filteredCount,
  checked,
  onCheckedChange,
  isExpanded,
  onToggleExpand,
  indented,
}: TopicRowProps) {
  return (
    <div className={`flex items-center gap-2 py-1.5 pr-3 ${indented ? 'pl-14' : 'pl-2'}`}>
      {onToggleExpand ? (
        <button
          type="button"
          aria-expanded={isExpanded}
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
      <span className="text-xs text-muted-foreground">
        {filteredCount !== null ? (
          <>
            <span className="font-medium text-foreground">{filteredCount}</span>/{count}
          </>
        ) : (
          count
        )}
      </span>
    </div>
  )
}
