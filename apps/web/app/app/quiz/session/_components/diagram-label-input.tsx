'use client'

import { type ComponentType, useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'
import {
  allPlacementsCorrect,
  canonicalTextFor,
  type DiagramLabelChipData,
  type DiagramMapping,
  type DiagramZoneData,
  placementFromSubmitted,
  poolLabels,
  serializeMapping,
  zoneResult,
} from './diagram-label-input-helpers'
import { DiagramAnswerRow, DiagramTapPool, DiagramZoneMarker } from './diagram-tap-list'
import {
  type Armed,
  newlyPlacedZone,
  type TapState,
  tapLabel,
  tapPool,
  tapRow,
} from './diagram-tap-state'
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

type DiagramBoardProps = Readonly<{
  Art: ComponentType
  zones: DiagramZoneData[]
  labels: DiagramLabelChipData[]
  placement: Map<string, string>
  armed: Armed
  disabled: boolean
  /** Set only once graded. */
  correctMapping?: DiagramMapping[]
  onTapRow: (zoneId: string) => void
}>

/** Diagram art with numbered zone markers, plus the numbered answer rows. */
function DiagramBoard({
  Art,
  zones,
  labels,
  placement,
  armed,
  disabled,
  correctMapping,
  onTapRow,
}: Readonly<DiagramBoardProps>) {
  const resultFor = (zoneId: string) =>
    correctMapping ? zoneResult(zoneId, placement, correctMapping) : undefined
  return (
    <>
      <div className="relative aspect-video w-full overflow-hidden rounded-control border border-border bg-card p-2">
        <Art />
        {zones.map((zone, i) => (
          <DiagramZoneMarker
            key={zone.id}
            zone={zone}
            n={i + 1}
            filled={placement.has(zone.id)}
            result={resultFor(zone.id)}
          />
        ))}
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {zones.map((zone, i) => (
          <DiagramAnswerRow
            key={zone.id}
            zone={zone}
            n={i + 1}
            placed={labels.find((l) => l.id === placement.get(zone.id)) ?? null}
            armed={armed}
            disabled={disabled}
            result={resultFor(zone.id)}
            canonicalText={
              correctMapping ? canonicalTextFor(zone.id, labels, correctMapping) : undefined
            }
            onTap={onTapRow}
          />
        ))}
      </ol>
    </>
  )
}

/** Graded live region, or the Submit button while answering. */
function DiagramFooter({
  graded,
  allCorrect,
  locked,
  submitDisabled,
  submitting,
  onSubmit,
}: Readonly<{
  graded: boolean
  allCorrect: boolean
  locked: boolean
  submitDisabled: boolean
  submitting: boolean
  onSubmit: () => void
}>) {
  return (
    <>
      {graded && (
        <p data-testid="diagram-label-result" role="status" aria-live="polite" className="sr-only">
          {allCorrect ? 'Correct' : 'Incorrect'}
        </p>
      )}
      {!locked && (
        <Button
          type="button"
          disabled={submitDisabled}
          aria-busy={submitting || undefined}
          onClick={onSubmit}
          className="w-full"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <BusyLabel busy={submitting}>Submit Answer</BusyLabel>
          </span>
        </Button>
      )}
    </>
  )
}

/** Placement + armed state for tap-to-place; focus follows a newly placed label to its row. */
function useDiagramTap(initial: () => Map<string, string>) {
  const [placement, setPlacement] = useState(initial)
  const [armed, setArmed] = useState<Armed>(null)
  const [focusZone, setFocusZone] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusZone == null) return
    rootRef.current?.querySelector<HTMLElement>(`[data-testid="diagram-row-${focusZone}"]`)?.focus()
    setFocusZone(null)
  }, [focusZone])

  function applyTap(next: TapState) {
    setFocusZone(newlyPlacedZone(placement, next.placement))
    setPlacement(next.placement)
    setArmed(next.armed)
  }

  return { placement, armed, rootRef, applyTap }
}

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
  const { placement, armed, rootRef, applyTap } = useDiagramTap(() =>
    placementFromSubmitted(zones, labels, submitted, submittedMapping),
  )

  const locked = submitted
  const graded = locked && correctMapping != null
  const allCorrect = graded && allPlacementsCorrect(placement, correctMapping)
  const DiagramArt = getDiagramComponent(imageRef)
  const pool = poolLabels(labels, placement)
  const itemsDisabled = locked || disabled || submitting

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
    <div ref={rootRef} className="space-y-3">
      <DiagramBoard
        Art={DiagramArt}
        zones={zones}
        labels={labels}
        placement={placement}
        armed={armed}
        disabled={itemsDisabled}
        correctMapping={graded ? correctMapping : undefined}
        onTapRow={(zoneId) => applyTap(tapRow({ placement, armed }, zoneId))}
      />
      {!locked && (
        <DiagramTapPool
          labels={pool}
          armed={armed}
          placedArmed={armed?.kind === 'label' && [...placement.values()].includes(armed.id)}
          disabled={itemsDisabled}
          onTapLabel={(id) => applyTap(tapLabel({ placement, armed }, id))}
          onTapPool={() => applyTap(tapPool({ placement, armed }))}
        />
      )}

      <DiagramFooter
        graded={graded}
        allCorrect={allCorrect}
        locked={locked}
        submitDisabled={disabled || submitting || placement.size === 0}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
