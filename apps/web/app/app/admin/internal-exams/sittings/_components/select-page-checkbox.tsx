'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

type Props = {
  /** Rows that can be ticked. */
  total: number
  ticked: number
  disabled?: boolean
  label?: string
  onChange: (checked: boolean) => void
}

/** Header checkbox: checked when every tickable row is ticked, indeterminate when some are. */
export function SelectPageCheckbox({
  total,
  ticked,
  disabled,
  label = 'Select this page',
  onChange,
}: Readonly<Props>) {
  const all = total > 0 && ticked === total
  return (
    <Label className="text-caption text-foreground">
      <Checkbox
        aria-label={`Select all ${total} shown`}
        checked={all}
        indeterminate={ticked > 0 && !all}
        disabled={disabled || total === 0}
        onCheckedChange={(c) => onChange(c === true)}
      />
      {label}
    </Label>
  )
}
