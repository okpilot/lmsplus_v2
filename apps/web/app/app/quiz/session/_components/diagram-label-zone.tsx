'use client'

import { useDroppable } from '@dnd-kit/core'
import { DiagramLabelChip } from './diagram-label-chip'
import type { DiagramLabelChipData, DiagramZoneData } from './diagram-label-input-helpers'

type DiagramLabelZoneProps = Readonly<{
  zone: DiagramZoneData
  placedLabel: DiagramLabelChipData | null
  /** Also lock during `submitting`/session-submit — mirrors OrderingInputItem. */
  disabled: boolean
  result?: 'correct' | 'incorrect'
  /** The canonical label text for this zone, revealed when the zone is wrong. */
  canonicalText?: string
  /** Generic, index-based accessible name — must never reveal the answer. */
  ariaLabel: string
}>

/** A single droppable drop-zone box, absolutely positioned over the diagram
 *  artwork via the delivered fraction coordinates (x/y/w/h are 0..1). */
export function DiagramLabelZone({
  zone,
  placedLabel,
  disabled,
  result,
  canonicalText,
  ariaLabel,
}: DiagramLabelZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id, disabled })

  const borderClass =
    result === 'correct'
      ? 'border-emerald-500/60'
      : result === 'incorrect'
        ? 'border-destructive/60'
        : isOver
          ? 'border-primary'
          : 'border-dashed border-muted-foreground/50'

  return (
    // biome-ignore lint/a11y/useSemanticElements: an absolutely-positioned droppable box can't be a <fieldset> (layout + legend semantics); role="group" is the correct grouping role here
    <div
      ref={setNodeRef}
      role="group"
      aria-label={ariaLabel}
      data-testid={`diagram-label-zone-${zone.id}`}
      data-result={result ?? ''}
      style={{
        left: `${zone.x * 100}%`,
        top: `${zone.y * 100}%`,
        width: `${zone.w * 100}%`,
        height: `${zone.h * 100}%`,
      }}
      className={`absolute flex items-center justify-center rounded-md border-2 bg-background/70 p-0.5 ${borderClass}`}
    >
      {placedLabel ? (
        <DiagramLabelChip
          id={placedLabel.id}
          text={placedLabel.text}
          disabled={disabled}
          result={result}
        />
      ) : (
        <span className="text-[10px] text-muted-foreground">Drop</span>
      )}
      {result === 'incorrect' && canonicalText && (
        <span
          data-testid={`diagram-label-canonical-${zone.id}`}
          className="absolute -bottom-4 left-0 whitespace-nowrap text-[10px] font-medium text-muted-foreground"
        >
          {canonicalText}
        </span>
      )}
    </div>
  )
}
