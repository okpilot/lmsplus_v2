'use client'

import { Meter as MeterPrimitive } from '@base-ui/react/meter'
import { Progress as ProgressPrimitive } from '@base-ui/react/progress'

import { cn } from '@/lib/utils'

export type StatusTone = 'success' | 'caution' | 'danger'
export type MeterTone = 'primary' | StatusTone

const FILL: Record<MeterTone, string> = {
  primary: 'bg-primary',
  success: 'bg-success-solid',
  caution: 'bg-caution-solid',
  danger: 'bg-danger-solid',
}

const ROOT_CLASS = 'block h-2 w-full'
const TRACK_CLASS = 'block h-full w-full overflow-hidden rounded-full bg-muted'
const INDICATOR_CLASS = 'block h-full rounded-full transition-all'

type BarProps = Readonly<{
  value: number
  label: string
  className?: string
}>

/** A measured value on a known scale (mastery, score). Fill colour may carry a status tone. */
function Meter({ value, label, tone = 'primary', className }: BarProps & { tone?: MeterTone }) {
  return (
    <MeterPrimitive.Root
      value={value}
      aria-label={label}
      render={<span />}
      className={cn(ROOT_CLASS, className)}
    >
      <MeterPrimitive.Track render={<span />} className={TRACK_CLASS}>
        <MeterPrimitive.Indicator render={<span />} className={cn(INDICATOR_CLASS, FILL[tone])} />
      </MeterPrimitive.Track>
    </MeterPrimitive.Root>
  )
}

/** Position through a task (question N of M, answered so far). Always the primary colour. */
function Progress({ value, label, className }: BarProps) {
  return (
    <ProgressPrimitive.Root
      value={value}
      aria-label={label}
      render={<span />}
      className={cn(ROOT_CLASS, className)}
    >
      <ProgressPrimitive.Track render={<span />} className={TRACK_CLASS}>
        <ProgressPrimitive.Indicator
          render={<span />}
          className={cn(INDICATOR_CLASS, FILL.primary)}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Meter, Progress }
