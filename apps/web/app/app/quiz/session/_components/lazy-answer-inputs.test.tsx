import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const loads = vi.hoisted(() => ({ ordering: 0, diagram: 0 }))

vi.mock('./ordering-input', () => {
  loads.ordering += 1
  return { OrderingInput: () => <div data-testid="ordering-input" /> }
})

vi.mock('./diagram-label-input', () => {
  loads.diagram += 1
  return { DiagramLabelInput: () => <div data-testid="diagram-label-input" /> }
})

import { DiagramLabelInput, OrderingInput, preloadDragInputs } from './lazy-answer-inputs'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('preloadDragInputs', () => {
  it('loads only the ordering input for an ordering-only session', async () => {
    await preloadDragInputs(new Set(['ordering']))
    expect(loads.ordering).toBe(1)
    expect(loads.diagram).toBe(0)
  })

  it('loads nothing when no drag-and-drop question is present', async () => {
    await preloadDragInputs(new Set(['multiple_choice']))
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
