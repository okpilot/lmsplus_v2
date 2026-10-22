import * as Sentry from '@sentry/nextjs'
import { act, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const loads = vi.hoisted(() => ({ ordering: 0, diagram: 0 }))

vi.mock('./ordering-input', () => {
  loads.ordering += 1
  return { OrderingInput: () => <div data-testid="ordering-input" /> }
})

vi.mock('./diagram-label-input', () => {
  loads.diagram += 1
  return { DiagramLabelInput: () => <div data-testid="diagram-label-input" /> }
})

import { DiagramLabelInput, OrderingInput } from './lazy-answer-inputs'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('preloadDragInputs', () => {
  async function freshPreload() {
    vi.resetModules()
    loads.ordering = 0
    loads.diagram = 0
    vi.doMock('./ordering-input', () => {
      loads.ordering += 1
      return { OrderingInput: () => <div data-testid="ordering-input" /> }
    })
    vi.doMock('./diagram-label-input', () => {
      loads.diagram += 1
      return { DiagramLabelInput: () => <div data-testid="diagram-label-input" /> }
    })
    return (await import('./lazy-answer-inputs')).preloadDragInputs
  }

  it('loads only the ordering input for an ordering-only session', async () => {
    const preload = await freshPreload()
    await preload(['ordering'])
    expect(loads.ordering).toBe(1)
    expect(loads.diagram).toBe(0)
  })

  it('loads only the diagram label input for a diagram-label-only session', async () => {
    const preload = await freshPreload()
    await preload(['diagram_label'])
    expect(loads.ordering).toBe(0)
    expect(loads.diagram).toBe(1)
  })

  it('loads both inputs when both drag types are present', async () => {
    const preload = await freshPreload()
    await preload(['ordering', 'diagram_label'])
    expect(loads.ordering).toBe(1)
    expect(loads.diagram).toBe(1)
  })

  it('loads nothing when no drag-and-drop question is present', async () => {
    const preload = await freshPreload()
    await preload(['multiple_choice'])
    expect(loads.ordering).toBe(0)
    expect(loads.diagram).toBe(0)
  })
})

describe('lazy drag inputs', () => {
  it('renders the ordering input once its chunk has loaded', async () => {
    render(<OrderingInput {...({} as unknown as ComponentProps<typeof OrderingInput>)} />)
    expect(await screen.findByTestId('ordering-input')).toBeInTheDocument()
  })

  it('renders the diagram label input once its chunk has loaded', async () => {
    render(<DiagramLabelInput {...({} as unknown as ComponentProps<typeof DiagramLabelInput>)} />)
    expect(await screen.findByTestId('diagram-label-input')).toBeInTheDocument()
  })
})

type LazyModule = typeof import('./lazy-answer-inputs')

async function freshModule(orderingFactory?: () => Record<string, unknown>): Promise<LazyModule> {
  vi.resetModules()
  vi.doMock(
    './ordering-input',
    orderingFactory ?? (() => ({ OrderingInput: () => <div data-testid="real">real</div> })),
  )
  vi.doMock('./diagram-label-input', () => ({ DiagramLabelInput: () => <div /> }))
  return import('./lazy-answer-inputs')
}

const noProps = {} as ComponentProps<LazyModule['OrderingInput']>

describe('preloaded drag input', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the real input on its first commit once preloaded', async () => {
    const mod = await freshModule()
    await mod.preloadDragInputs(['ordering'])
    const host = document.createElement('div')
    const root = createRoot(host)
    flushSync(() => root.render(<mod.OrderingInput {...noProps} />))
    expect(host.querySelector('[data-testid="real"]')).not.toBeNull()
    expect(host.querySelector('.animate-pulse')).toBeNull()
    act(() => root.unmount())
  })

  it('shows a placeholder then the input when mounted before the preload', async () => {
    const mod = await freshModule()
    const { container } = render(<mod.OrderingInput {...noProps} />)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
    expect(await screen.findByTestId('real')).toBeInTheDocument()
  })

  it('logs a failed preload', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = await freshModule(() => {
      throw new Error('boom')
    })
    await expect(mod.preloadDragInputs(['ordering'])).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledWith('[preloadDragInputs] chunk preload failed:', expect.any(Error))
  })

  it('does not report a failed preload to Sentry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = await freshModule(() => {
      throw new Error('boom')
    })
    await mod.preloadDragInputs(['ordering'])
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('does not change what the next render picks when a load resolves without a window', async () => {
    const mod = await freshModule()
    vi.stubGlobal('window', undefined)
    await mod.preloadDragInputs(['ordering'])
    vi.unstubAllGlobals()
    const { container } = render(<mod.OrderingInput {...noProps} />)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('recognises only the drag-and-drop question types', async () => {
    const mod = await freshModule()
    expect(mod.isDragInputType('ordering')).toBe(true)
    expect(mod.isDragInputType('multiple_choice')).toBe(false)
  })
})
