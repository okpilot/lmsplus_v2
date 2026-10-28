'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  // When false, the label shows only `name` (e.g. VFR RT parts, whose codes are
  // internal slugs). Defaults to true so EASA pickers keep their meaningful codes.
  showCode?: boolean
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
  showCode = true,
}: Readonly<TopicRowProps>) {
  return (
    <div className={`flex items-center gap-2 py-1.5 pr-3 ${indented ? 'pl-16' : 'pl-2'}`}>
      {onToggleExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-expanded={isExpanded}
          aria-label={`Toggle ${code} ${name}`}
          onClick={onToggleExpand}
          className="text-muted-foreground"
        >
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </Button>
      ) : (
        !indented && <span className="w-7" />
      )}
      <Checkbox checked={checked} onCheckedChange={(c) => onCheckedChange(c === true)} />
      <span className={`flex-1 text-sm ${checked ? 'text-foreground' : 'text-muted-foreground'}`}>
        {showCode ? `${code} — ${name}` : name}
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
