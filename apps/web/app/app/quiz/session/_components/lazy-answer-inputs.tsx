'use client'

import dynamic from 'next/dynamic'
import { type ComponentType, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

function AnswerInputSkeleton() {
  return <Skeleton className="h-40 w-full" />
}

/**
 * next/dynamic suspends on every first render, even with a warm module cache.
 * Once `preload()` has resolved in the browser, a mount renders the loaded
 * component directly. The choice is frozen per mount, so the component type
 * never swaps mid-mount. A failed load replaces the cached rejection so a
 * fresh mount imports again.
 */
function lazyWithPreload<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | undefined
  const makeDynamic = (): ComponentType<P> =>
    dynamic<P>(
      async () => {
        try {
          return await load()
        } catch (error) {
          Dynamic = makeDynamic()
          throw error
        }
      },
      { loading: () => <AnswerInputSkeleton /> },
    )
  let Dynamic = makeDynamic()

  async function preload(): Promise<void> {
    const component = await load()
    // Server module state is shared across requests; never let it change the SSR pick.
    if (typeof window !== 'undefined') loaded = component
  }

  function Component(props: Readonly<P>) {
    const [Picked] = useState(() => loaded ?? Dynamic)
    return <Picked {...(props as P)} />
  }

  return { Component, preload }
}

const ordering = lazyWithPreload(() => import('./ordering-input').then((m) => m.OrderingInput))
const diagramLabel = lazyWithPreload(() =>
  import('./diagram-label-input').then((m) => m.DiagramLabelInput),
)

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
