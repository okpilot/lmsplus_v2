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

describe('OrderingInputItem hover', () => {
  it('has no hover fill when disabled and ungraded', () => {
    sortable.isDragging = false
    render(<OrderingInputItem id="a" text="First" disabled />)
    expect(screen.getByTestId('ordering-item-a').className).not.toContain('hover:bg-muted')
  })

  it('has a hover fill when enabled and ungraded', () => {
    sortable.isDragging = false
    expect(item().className).toContain('hover:bg-muted')
  })
})
