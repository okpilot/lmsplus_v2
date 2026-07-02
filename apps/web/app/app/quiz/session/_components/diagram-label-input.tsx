'use client'

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import {
  allPlacementsCorrect,
  canonicalTextFor,
  DIAGRAM_POOL_DROPPABLE_ID,
  type DiagramLabelChipData,
  type DiagramMapping,
  type DiagramZoneData,
  placeLabel,
  placementFromSubmitted,
  poolLabels,
  serializeMapping,
  unplaceLabel,
  zoneResult,
} from './diagram-label-input-helpers'
import { DiagramLabelPool } from './diagram-label-pool'
import { DiagramLabelZone } from './diagram-label-zone'
import { getDiagramComponent } from './diagrams/registry'

type DiagramLabelInputProps = Readonly<{
  /** Logical image_ref key resolved via the diagram registry (fail-closed if unknown). */
  imageRef: string
  zones: DiagramZoneData[]
  labels: DiagramLabelChipData[]
  onSubmit: (mapping: DiagramMapping[]) => void
  disabled: boolean
  submitting?: boolean
  submitted?: boolean
  /** Canonical zone_id -> label_id pairs, revealed once submitted. */
  correctMapping?: DiagramMapping[]
  /** The student's previously submitted placement, restored on revisit. */
  submittedMapping?: DiagramMapping[]
}>

export function DiagramLabelInput({
  imageRef,
  zones,
  labels,
  onSubmit,
  disabled,
  submitting = false,
  submitted = false,
  correctMapping,
  submittedMapping,
}: DiagramLabelInputProps) {
  const [placement, setPlacement] = useState<Map<string, string>>(() =>
    placementFromSubmitted(zones, labels, submitted, submittedMapping),
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const locked = submitted
  const graded = locked && correctMapping != null
  const allCorrect = graded && allPlacementsCorrect(placement, correctMapping)
  const DiagramArt = getDiagramComponent(imageRef)
  const pool = poolLabels(labels, placement)
  const itemsDisabled = locked || disabled || submitting

  function handleDragEnd(event: DragEndEvent) {
    // Defense-in-depth, mirrors OrderingInput.handleDragEnd: ignore drops once
    // locked/mid-check/disabled, so the displayed placement can't diverge from
    // what the server actually graded.
    if (locked || disabled || submitting) return
    const { active, over } = event
    if (!over) return
    const labelId = String(active.id)
    const overId = String(over.id)
    if (overId === DIAGRAM_POOL_DROPPABLE_ID) {
      setPlacement((prev) => unplaceLabel(prev, labelId))
      return
    }
    setPlacement((prev) => placeLabel(prev, overId, labelId))
  }

  function handleSubmit() {
    onSubmit(serializeMapping(placement))
  }

  // Fail closed on an unknown image_ref: alert only, no drop-zones/pool/Submit.
  if (!DiagramArt) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground"
      >
        This diagram could not be loaded. Please refresh the page.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-border bg-card p-2">
          <DiagramArt />
          {zones.map((zone) => (
            <DiagramLabelZone
              key={zone.id}
              zone={zone}
              placedLabel={labels.find((l) => l.id === placement.get(zone.id)) ?? null}
              disabled={itemsDisabled}
              result={graded ? zoneResult(zone.id, placement, correctMapping) : undefined}
              canonicalText={graded ? canonicalTextFor(zone.id, labels, correctMapping) : undefined}
            />
          ))}
        </div>

        {!locked && <DiagramLabelPool labels={pool} disabled={itemsDisabled} />}
      </DndContext>

      {graded && (
        <p data-testid="diagram-label-result" role="status" aria-live="polite" className="sr-only">
          {allCorrect ? 'Correct' : 'Incorrect'}
        </p>
      )}

      {!locked && (
        <button
          type="button"
          disabled={disabled || submitting}
          aria-busy={submitting || undefined}
          onClick={handleSubmit}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {submitting && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            Submit Answer
          </span>
        </button>
      )}
    </div>
  )
}
