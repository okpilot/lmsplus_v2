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
}: Readonly<DiagramLabelZoneProps>) {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id, disabled })

  const baseBg = isOver && !result ? '' : 'bg-background/70'
  const borderClass =
    result === 'correct'
      ? 'border-success'
      : result === 'incorrect'
        ? 'border-danger'
        : isOver
          ? 'border-solid border-primary bg-primary/8'
          : 'border-dashed border-input'

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
      className={`absolute flex items-center justify-center rounded-inner border p-0.5 ${baseBg} ${borderClass}`}
    >
      {placedLabel ? (
        <DiagramLabelChip
          id={placedLabel.id}
          text={placedLabel.text}
          disabled={disabled}
          result={result}
        />
      ) : (
        <span className="text-overline tracking-normal text-muted-foreground">Drop</span>
      )}
      {result === 'incorrect' && canonicalText && (
        <span
          data-testid={`diagram-label-canonical-${zone.id}`}
          className="absolute left-0 top-full z-10 mt-0.5 whitespace-nowrap rounded-inner bg-card px-1 text-overline leading-none tracking-normal text-foreground shadow-raised"
        >
          {canonicalText}
        </span>
      )}
    </div>
  )
}
