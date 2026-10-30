'use client'

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '../_hooks/use-media-query'
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
import { DiagramAnswerRow, DiagramTapPool, DiagramZoneMarker } from './diagram-tap-list'
import { type Armed, tapLabel, tapPool, tapRow } from './diagram-tap-state'
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
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
}: Readonly<DiagramLabelInputProps>) {
  const [placement, setPlacement] = useState<Map<string, string>>(() =>
    placementFromSubmitted(zones, labels, submitted, submittedMapping),
  )

  const [armed, setArmed] = useState<Armed>(null)
  const phone = useMediaQuery('(max-width: 639.98px)')

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
    // locked/mid-check/disabled so displayed placement can't diverge from graded.
    if (itemsDisabled) return
    const { active, over } = event
    if (!over) return // closestCenter always resolves a nearest droppable; guards the zero-zone case only
    const labelId = String(active.id)
    const overId = String(over.id)
    if (overId === DIAGRAM_POOL_DROPPABLE_ID) {
      setPlacement((prev) => unplaceLabel(prev, labelId))
      return
    }
    setPlacement((prev) => placeLabel(prev, overId, labelId))
  }

  function applyTap(next: { placement: Map<string, string>; armed: Armed }) {
    setPlacement(next.placement)
    setArmed(next.armed)
  }

  function handleSubmit() {
    if (placement.size > 0) onSubmit(serializeMapping(placement))
  }

  // Fail closed on an unknown image_ref: alert only, no drop-zones/pool/Submit.
  if (!DiagramArt) {
    return (
      <Alert role="alert" tone="neutral">
        <AlertDescription>
          This diagram could not be loaded. Please refresh the page.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="relative aspect-video w-full overflow-hidden rounded-control border border-border bg-card p-2">
          <DiagramArt />
          {phone
            ? zones.map((zone, i) => (
                <DiagramZoneMarker
                  key={zone.id}
                  zone={zone}
                  n={i + 1}
                  filled={placement.has(zone.id)}
                  result={graded ? zoneResult(zone.id, placement, correctMapping) : undefined}
                />
              ))
            : zones.map((zone, i) => (
                <DiagramLabelZone
                  key={zone.id}
                  zone={zone}
                  ariaLabel={`Drop zone ${i + 1} of ${zones.length}`}
                  placedLabel={labels.find((l) => l.id === placement.get(zone.id)) ?? null}
                  disabled={itemsDisabled}
                  result={graded ? zoneResult(zone.id, placement, correctMapping) : undefined}
                  canonicalText={
                    graded ? canonicalTextFor(zone.id, labels, correctMapping) : undefined
                  }
                />
              ))}
        </div>

        {phone && (
          <ol className="space-y-2">
            {zones.map((zone, i) => (
              <DiagramAnswerRow
                key={zone.id}
                zone={zone}
                n={i + 1}
                placed={labels.find((l) => l.id === placement.get(zone.id)) ?? null}
                armed={armed}
                disabled={itemsDisabled}
                result={graded ? zoneResult(zone.id, placement, correctMapping) : undefined}
                canonicalText={
                  graded ? canonicalTextFor(zone.id, labels, correctMapping) : undefined
                }
                onTap={(zoneId) => applyTap(tapRow({ placement, armed }, zoneId))}
              />
            ))}
          </ol>
        )}
        {!locked && phone && (
          <DiagramTapPool
            labels={pool}
            armed={armed}
            disabled={itemsDisabled}
            onTapLabel={(id) => applyTap(tapLabel({ placement, armed }, id))}
            onTapPool={() => applyTap(tapPool({ placement, armed }))}
          />
        )}
        {!locked && !phone && <DiagramLabelPool labels={pool} disabled={itemsDisabled} />}
      </DndContext>

      {graded && (
        <p data-testid="diagram-label-result" role="status" aria-live="polite" className="sr-only">
          {allCorrect ? 'Correct' : 'Incorrect'}
        </p>
      )}

      {!locked && (
        <Button
          type="button"
          disabled={disabled || submitting || placement.size === 0}
          aria-busy={submitting || undefined}
          onClick={handleSubmit}
          className="w-full"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <BusyLabel busy={submitting}>Submit Answer</BusyLabel>
          </span>
        </Button>
      )}
    </div>
  )
}
