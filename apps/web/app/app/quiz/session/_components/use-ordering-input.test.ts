import type { DragEndEvent } from '@dnd-kit/core'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrderingInput } from './use-ordering-input'

const ITEMS = [
  { id: 'mayday', text: 'MAYDAY MAYDAY MAYDAY' },
  { id: 'callsign', text: 'Speedbird 123' },
  { id: 'nature', text: 'engine failure' },
]

function makeOpts(overrides: Partial<Parameters<typeof useOrderingInput>[0]> = {}) {
  return {
    items: ITEMS,
    onSubmit: vi.fn(),
    disabled: false,
    submitting: false,
    submitted: false,
    ...overrides,
  }
}

function dragEnd(activeId: string, overId: string): DragEndEvent {
  return { active: { id: activeId }, over: { id: overId } } as unknown as DragEndEvent
}

describe('useOrderingInput', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('starts with the delivered item order', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts()))
    expect(result.current.order.map((it) => it.id)).toEqual(['mayday', 'callsign', 'nature'])
  })

  it('restores the submitted order when submitted with a valid submittedOrder', () => {
    const { result } = renderHook(() =>
      useOrderingInput(
        makeOpts({ submitted: true, submittedOrder: ['nature', 'mayday', 'callsign'] }),
      ),
    )
    expect(result.current.order.map((it) => it.id)).toEqual(['nature', 'mayday', 'callsign'])
  })

  it('reports locked as true once submitted', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts({ submitted: true })))
    expect(result.current.locked).toBe(true)
  })

  it('reports locked as false before submission', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts()))
    expect(result.current.locked).toBe(false)
  })

  it('reports graded as false until a correctOrder is provided', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts({ submitted: true })))
    expect(result.current.graded).toBe(false)
  })

  it('reports graded as true once submitted with a correctOrder', () => {
    const { result } = renderHook(() =>
      useOrderingInput(
        makeOpts({ submitted: true, correctOrder: ['mayday', 'callsign', 'nature'] }),
      ),
    )
    expect(result.current.graded).toBe(true)
  })

  it('reports allCorrect true when the order matches correctOrder exactly', () => {
    const { result } = renderHook(() =>
      useOrderingInput(
        makeOpts({ submitted: true, correctOrder: ['mayday', 'callsign', 'nature'] }),
      ),
    )
    expect(result.current.allCorrect).toBe(true)
  })

  it('reports allCorrect false when any slot mismatches correctOrder', () => {
    const { result } = renderHook(() =>
      useOrderingInput(
        makeOpts({ submitted: true, correctOrder: ['mayday', 'nature', 'callsign'] }),
      ),
    )
    expect(result.current.allCorrect).toBe(false)
  })

  // ---- slotResult -------------------------------------------------------

  it('slotResult returns undefined for every index before grading', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts()))
    expect(result.current.slotResult(0)).toBeUndefined()
  })

  it('slotResult marks a matching slot correct and a mismatched slot incorrect', () => {
    const { result } = renderHook(() =>
      useOrderingInput(
        makeOpts({ submitted: true, correctOrder: ['mayday', 'nature', 'callsign'] }),
      ),
    )
    expect(result.current.slotResult(0)).toBe('correct')
    expect(result.current.slotResult(1)).toBe('incorrect')
    expect(result.current.slotResult(2)).toBe('incorrect')
  })

  // ---- handleDragEnd ------------------------------------------------------

  it('reorders on a valid drag-end between two distinct items', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts()))
    act(() => result.current.handleDragEnd(dragEnd('mayday', 'callsign')))
    expect(result.current.order.map((it) => it.id)).toEqual(['callsign', 'mayday', 'nature'])
  })

  it('does nothing when active and over are the same item', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts()))
    act(() => result.current.handleDragEnd(dragEnd('mayday', 'mayday')))
    expect(result.current.order.map((it) => it.id)).toEqual(['mayday', 'callsign', 'nature'])
  })

  it('is a no-op once locked (submitted)', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts({ submitted: true })))
    act(() => result.current.handleDragEnd(dragEnd('mayday', 'callsign')))
    expect(result.current.order.map((it) => it.id)).toEqual(['mayday', 'callsign', 'nature'])
  })

  it('is a no-op while the parent session submit is disabled', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts({ disabled: true })))
    act(() => result.current.handleDragEnd(dragEnd('mayday', 'callsign')))
    expect(result.current.order.map((it) => it.id)).toEqual(['mayday', 'callsign', 'nature'])
  })

  it('is a no-op while this answer is being checked (submitting)', () => {
    const { result } = renderHook(() => useOrderingInput(makeOpts({ submitting: true })))
    act(() => result.current.handleDragEnd(dragEnd('mayday', 'callsign')))
    expect(result.current.order.map((it) => it.id)).toEqual(['mayday', 'callsign', 'nature'])
  })

  // ---- handleSubmit -------------------------------------------------------

  it('calls onSubmit with the current order ids', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() => useOrderingInput(makeOpts({ onSubmit })))
    act(() => result.current.handleDragEnd(dragEnd('mayday', 'callsign')))
    act(() => result.current.handleSubmit())
    expect(onSubmit).toHaveBeenCalledWith(['callsign', 'mayday', 'nature'])
  })
})
