import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const sortable = vi.hoisted(() => ({
  isDragging: false,
  activatorRef: vi.fn(),
  onKeyDown: vi.fn(),
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: { onKeyDown: sortable.onKeyDown },
    setNodeRef: () => {},
    setActivatorNodeRef: sortable.activatorRef,
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

describe('OrderingInputItem drag handle is a bare Button', () => {
  it('hands the rendered button to setActivatorNodeRef', () => {
    sortable.isDragging = false
    sortable.activatorRef.mockClear()
    item()
    const handle = screen.getByRole('button', { name: /reorder/i })
    expect(sortable.activatorRef).toHaveBeenCalledWith(handle)
    expect(handle).toHaveAttribute('type', 'button')
  })

  it('forwards keydown to the dnd-kit listener', () => {
    sortable.isDragging = false
    sortable.onKeyDown.mockClear()
    item()
    fireEvent.keyDown(screen.getByRole('button', { name: /reorder/i }), { key: ' ' })
    expect(sortable.onKeyDown).toHaveBeenCalled()
  })

  it('keeps grab/touch classes, select-none, focus ring and no press shift', () => {
    sortable.isDragging = false
    item()
    const tokens = screen.getByRole('button', { name: /reorder/i }).className.split(/\s+/)
    expect(tokens).toContain('cursor-grab')
    expect(tokens).toContain('touch-none')
    expect(tokens).toContain('select-none')
    expect(tokens).toContain('focus-visible:outline-focus')
    expect(tokens).not.toContain('active:translate-y-px')
  })
})
