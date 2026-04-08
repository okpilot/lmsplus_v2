'use client'

import { useCallback } from 'react'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TIME_RANGE_OPTIONS } from '../_lib/constants'
import type { TimeRange } from '../types'

type Props = {
  currentRange: TimeRange
}

export function DashboardHeader({ currentRange }: Props) {
  const updateParams = useUpdateSearchParams()

  const handleRangeChange = useCallback(
    (value: string | null) => {
      if (!value) return
      updateParams({
        range: value === '30d' ? null : value,
        page: null,
      })
    },
    [updateParams],
  )

  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Instructor overview of your cohort</p>
      </div>
      <Select value={currentRange} onValueChange={handleRangeChange} items={TIME_RANGE_OPTIONS}>
        <SelectTrigger className="w-40" aria-label="Time range">
          <SelectValue placeholder="Select range" />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} label={opt.label}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
