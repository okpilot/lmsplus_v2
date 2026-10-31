import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_SURFACE } from './floating-surface'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('contains each FLOATING_SURFACE token on the content', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>t</TooltipTrigger>
          <TooltipContent>Tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )
    const cls = screen.getByText('Tip').className
    for (const token of FLOATING_SURFACE.split(' ')) expect(cls).toContain(token)
    expect(cls).toContain('rounded-control')
    expect(cls).toContain('max-w-popover-sm')
  })

  it('opens after the default 600 ms delay on mouse hover', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>t</TooltipTrigger>
          <TooltipContent>Tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )
    const trigger = screen.getByRole('button', { name: 't' })
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' })
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseMove(trigger, { movementX: 5 })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.queryByText('Tip')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.queryByText('Tip')).not.toBeNull()
  })

  it('does not open on touch hover', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>t</TooltipTrigger>
          <TooltipContent>Tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )
    const trigger = screen.getByRole('button', { name: 't' })
    fireEvent.pointerEnter(trigger, { pointerType: 'touch' })
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseMove(trigger, { movementX: 5 })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(screen.queryByText('Tip')).toBeNull()
  })
})
