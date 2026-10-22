'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const loadOrderingInput = () => import('./ordering-input')
const loadDiagramLabelInput = () => import('./diagram-label-input')

function AnswerInputSkeleton() {
  return <Skeleton className="h-40 w-full" />
}

export const OrderingInput = dynamic(() => loadOrderingInput().then((m) => m.OrderingInput), {
  loading: () => <AnswerInputSkeleton />,
})

export const DiagramLabelInput = dynamic(
  () => loadDiagramLabelInput().then((m) => m.DiagramLabelInput),
  { loading: () => <AnswerInputSkeleton /> },
)

/** Starts fetching only the chunks for the drag-and-drop question types present. */
export function preloadDragInputs(types: ReadonlySet<string> | string[]): Promise<unknown> {
  const present = new Set(types)
  const loads: Promise<unknown>[] = []
  if (present.has('ordering')) loads.push(loadOrderingInput())
  if (present.has('diagram_label')) loads.push(loadDiagramLabelInput())
  // A failed preload falls back to the dynamic() load at render time.
  return Promise.all(loads).catch(() => {})
}
