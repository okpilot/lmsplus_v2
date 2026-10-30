'use client'

import { useDroppable } from '@dnd-kit/core'
import { DiagramLabelChip } from './diagram-label-chip'
import { DIAGRAM_POOL_DROPPABLE_ID, type DiagramLabelChipData } from './diagram-label-input-helpers'

type DiagramLabelPoolProps = Readonly<{
  labels: DiagramLabelChipData[]
  disabled: boolean
}>

/** The pool of not-yet-placed chips. Also a droppable target — dropping a
 *  placed chip back here unplaces it (see DiagramLabelInput.handleDragEnd). */
export function DiagramLabelPool({ labels, disabled }: Readonly<DiagramLabelPoolProps>) {
  const { setNodeRef, isOver } = useDroppable({ id: DIAGRAM_POOL_DROPPABLE_ID, disabled })

  return (
    <div
      ref={setNodeRef}
      data-testid="diagram-label-pool"
      className={`flex min-h-12 flex-wrap gap-2 rounded-card border p-3 ${
        isOver ? 'border-solid border-primary bg-primary/8' : 'border-dashed border-input'
      }`}
    >
      {labels.length === 0 && (
        <span className="text-caption text-muted-foreground">All labels placed</span>
      )}
      {labels.map((label) => (
        <DiagramLabelChip key={label.id} id={label.id} text={label.text} disabled={disabled} />
      ))}
    </div>
  )
}
