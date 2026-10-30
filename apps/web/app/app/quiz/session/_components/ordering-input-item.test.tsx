import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const sortable = vi.hoisted(() => ({ isDragging: false }))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: sortable.isDragging,
  }),
}))

import { OrderingInputItem } from './ordering-input-item'

function item() {
  render(<OrderingInputItem id="a" text="First" disabled={false} />)
  return screen.getByTestId('ordering-item-a')
}

describe('OrderingInputItem border while dragging', () => {
  it('is border-primary and not border-input', () => {
    sortable.isDragging = true
    const el = item()
    expect(el).toHaveClass('border-primary')
    expect(el).not.toHaveClass('border-input')
  })

  it('is border-input at rest', () => {
    sortable.isDragging = false
    expect(item()).toHaveClass('border-input')
  })
})
