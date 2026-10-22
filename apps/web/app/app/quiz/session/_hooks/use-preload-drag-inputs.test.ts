import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPreload } = vi.hoisted(() => ({ mockPreload: vi.fn() }))

vi.mock('../_components/lazy-answer-inputs', () => ({ preloadDragInputs: mockPreload }))

import { usePreloadDragInputs } from './use-preload-drag-inputs'

const q = (question_type: string) => ({ question_type })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('usePreloadDragInputs', () => {
  it('preloads the drag inputs on mount when the session has an ordering question', () => {
    renderHook(() => usePreloadDragInputs([q('multiple_choice'), q('ordering')]))
    expect(mockPreload).toHaveBeenCalledTimes(1)
    expect([...(mockPreload.mock.calls[0]?.[0] ?? [])]).toEqual(['ordering'])
  })

  it('does not preload when the session has no drag-and-drop question', () => {
    renderHook(() => usePreloadDragInputs([q('multiple_choice'), q('short_answer')]))
    expect(mockPreload).not.toHaveBeenCalled()
  })

  it('does not preload again when questions are re-supplied with the same drag types', () => {
    const { rerender } = renderHook(({ qs }) => usePreloadDragInputs(qs), {
      initialProps: { qs: [q('diagram_label')] },
    })
    rerender({ qs: [q('diagram_label'), q('multiple_choice')] })
    expect(mockPreload).toHaveBeenCalledTimes(1)
  })
})
