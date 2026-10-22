'use client'

import dynamic from 'next/dynamic'
import { type ComponentType, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { AnswerInputBoundary } from './answer-input-boundary'

const renderSkeleton = () => <Skeleton className="h-40 w-full" />

// Inline import() lets next/dynamic emit the SSR chunk preload for each input.
const OrderingDynamic = dynamic(() => import('./ordering-input').then((m) => m.OrderingInput), {
  loading: renderSkeleton,
})
const DiagramLabelDynamic = dynamic(
  () => import('./diagram-label-input').then((m) => m.DiagramLabelInput),
  { loading: renderSkeleton },
)

type LazyInput<P extends object> = {
  load: () => Promise<ComponentType<P>>
  dynamicComponent: ComponentType<P>
}

/**
 * next/dynamic suspends on every first render, even with a warm module cache.
 * Once `preload()` has resolved in the browser, a mount renders the loaded
 * component directly. The choice is frozen per mount, so the component type
 * never swaps mid-mount. There is no in-place retry: a failed chunk load shows
 * a reload prompt in the input boundary.
 */
function lazyWithPreload<P extends object>({ load, dynamicComponent }: LazyInput<P>) {
  let loaded: ComponentType<P> | undefined

  async function preload(): Promise<void> {
    const component = await load()
    // Server module state is shared across requests; never let it change the SSR pick.
    if (typeof window !== 'undefined') loaded = component
  }

  function Inner(props: Readonly<P>) {
    const [Picked] = useState(() => loaded ?? dynamicComponent)
    return <Picked {...(props as P)} />
  }

  function Component(props: Readonly<P>) {
    return (
      <AnswerInputBoundary>
        <Inner {...props} />
      </AnswerInputBoundary>
    )
  }

  return { Component, preload }
}

const ordering = lazyWithPreload({
  load: () => import('./ordering-input').then((m) => m.OrderingInput),
  dynamicComponent: OrderingDynamic,
})
const diagramLabel = lazyWithPreload({
  load: () => import('./diagram-label-input').then((m) => m.DiagramLabelInput),
  dynamicComponent: DiagramLabelDynamic,
})

export const OrderingInput = ordering.Component
export const DiagramLabelInput = diagramLabel.Component

const PRELOADERS = {
  ordering: ordering.preload,
  diagram_label: diagramLabel.preload,
}

type DragInputType = keyof typeof PRELOADERS

export function isDragInputType(type: string): type is DragInputType {
  return Object.hasOwn(PRELOADERS, type)
}

/** Fetches only the chunks for the drag-and-drop question types present. */
export async function preloadDragInputs(types: readonly string[]): Promise<void> {
  const present = new Set(types.filter(isDragInputType))
  try {
    await Promise.all([...present].map((type) => PRELOADERS[type]()))
  } catch (error) {
    console.error('[preloadDragInputs] chunk preload failed:', error)
  }
}
