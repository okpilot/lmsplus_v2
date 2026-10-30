'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DiagramLabelChipData, DiagramZoneData } from './diagram-label-input-helpers'
import type { Armed } from './diagram-tap-state'

type Result = 'correct' | 'incorrect' | undefined

const BADGE = {
  correct: 'border-success-solid bg-success-solid text-success-foreground',
  incorrect: 'border-danger-solid bg-danger-solid text-danger-foreground',
  idle: 'border-foreground/60 bg-card text-foreground',
  filled: 'border-primary bg-primary text-primary-foreground',
} as const

function badgeTone(result: Result, filled: boolean): keyof typeof BADGE {
  return result ?? (filled ? 'filled' : 'idle')
}

function Badge({ n, tone }: Readonly<{ n: number; tone: keyof typeof BADGE }>) {
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-pill border text-caption font-semibold',
        BADGE[tone],
      )}
    >
      {n}
    </span>
  )
}

/** Numbered badge overlaid on a diagram zone. */
export function DiagramZoneMarker({
  zone,
  n,
  filled,
  result,
}: Readonly<{ zone: DiagramZoneData; n: number; filled: boolean; result: Result }>) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute grid place-items-center"
      style={{
        left: `${zone.x * 100}%`,
        top: `${zone.y * 100}%`,
        width: `${zone.w * 100}%`,
        height: `${zone.h * 100}%`,
      }}
    >
      <Badge n={n} tone={badgeTone(result, filled)} />
    </div>
  )
}

const CHIP =
  'h-8 shrink-0 rounded-inner border bg-card px-3 text-caption font-medium whitespace-nowrap'

function chipTone(armed: boolean, result: Result): string {
  if (result) return result === 'correct' ? 'border-success' : 'border-danger'
  return armed ? 'border-primary bg-primary-soft ring-2 ring-primary/30' : 'border-input'
}

function rowFrame(zoneArmed: boolean, target: boolean, result: Result): string {
  if (result) return result === 'correct' ? 'border-success' : 'border-danger'
  if (zoneArmed) return 'border-primary bg-primary-soft'
  return target ? 'border-primary/60 border-dashed' : 'border-dashed border-input'
}

function rowHint(result: Result, target: boolean): string {
  if (result) return 'Not answered'
  return target ? 'Tap to place here' : 'Tap, then pick a label'
}

/** One numbered answer row: tap to place the armed label or to arm this zone. */
export function DiagramAnswerRow({
  zone,
  n,
  placed,
  armed,
  disabled,
  result,
  canonicalText,
  onTap,
}: Readonly<{
  zone: DiagramZoneData
  n: number
  placed: DiagramLabelChipData | null
  armed: Armed
  disabled: boolean
  result: Result
  canonicalText?: string
  onTap: (zoneId: string) => void
}>) {
  const zoneArmed = armed?.kind === 'zone' && armed.id === zone.id
  const chipArmed = armed?.kind === 'label' && placed != null && armed.id === placed.id
  const target = armed?.kind === 'label' && !chipArmed && !result
  const pressed = zoneArmed || chipArmed
  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        data-testid={`diagram-row-${zone.id}`}
        aria-pressed={pressed}
        data-result={result}
        disabled={disabled}
        onClick={() => onTap(zone.id)}
        className={cn(
          'h-auto min-h-11 w-full justify-start gap-3 rounded-control border px-3 py-2 text-left',
          result && 'disabled:opacity-100',
          rowFrame(zoneArmed, target, result),
        )}
      >
        <span className="sr-only">Zone</span>
        <Badge n={n} tone={badgeTone(result, placed != null)} />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {placed ? (
            <span className={cn(CHIP, 'inline-flex items-center', chipTone(chipArmed, result))}>
              {placed.text}
            </span>
          ) : (
            <span className="text-caption text-muted-foreground">{rowHint(result, target)}</span>
          )}
          {result === 'incorrect' && canonicalText && (
            <span className="text-caption">
              → <span className="font-semibold">{canonicalText}</span>
            </span>
          )}
        </span>
        {result && <span className="sr-only">, {result}</span>}
      </Button>
    </li>
  )
}

/** Single-line sideways-scrolling pool of unplaced labels, pinned near the viewport bottom. */
export function DiagramTapPool({
  labels,
  armed,
  placedArmed,
  disabled,
  onTapLabel,
  onTapPool,
}: Readonly<{
  labels: DiagramLabelChipData[]
  armed: Armed
  /** True when the armed label is currently placed in a zone. */
  placedArmed: boolean
  disabled: boolean
  onTapLabel: (id: string) => void
  onTapPool: () => void
}>) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: background tap returns an armed placed label to the pool for pointer users
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard path is the Return to pool button
    <div
      data-testid="diagram-tap-pool"
      onClick={disabled ? undefined : onTapPool}
      className="sticky bottom-(--pool-bottom) z-sticky flex min-h-12 flex-nowrap items-center gap-2 overflow-x-auto rounded-card border border-input bg-card p-2 shadow-raised [scrollbar-width:none]"
    >
      {placedArmed && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onTapPool()
          }}
          className={cn(CHIP, 'border-primary')}
        >
          Return to pool
        </Button>
      )}
      {labels.length === 0 && !placedArmed && (
        <span className="text-caption text-muted-foreground">All labels placed</span>
      )}
      {labels.map((l) => (
        <Button
          key={l.id}
          type="button"
          variant="toggle"
          aria-pressed={armed?.kind === 'label' && armed.id === l.id}
          data-testid={`diagram-tap-chip-${l.id}`}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onTapLabel(l.id)
          }}
          className={cn(
            CHIP,
            'border-input aria-pressed:bg-primary-soft aria-pressed:ring-2 aria-pressed:ring-primary/30',
          )}
        >
          {l.text}
        </Button>
      ))}
    </div>
  )
}
