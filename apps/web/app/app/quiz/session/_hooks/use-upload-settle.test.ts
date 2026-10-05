import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DraftAnswer } from '../../types'
import { useUploadSettle } from './use-upload-settle'

const A: DraftAnswer = { selectedOptionId: 'a', responseTimeMs: 100 }
const B: DraftAnswer = { selectedOptionId: 'b', responseTimeMs: 200 }
const C: DraftAnswer = { selectedOptionId: 'c', responseTimeMs: 300 }

function setup(serverAnswers: Record<string, DraftAnswer>) {
  return renderHook(() => useUploadSettle({ current: { serverAnswers } }))
}

describe('useUploadSettle', () => {
  it('has no answers until the first outcome', () => {
    const { result } = setup({ q1: A })

    expect(result.current.settled).toBeNull()
  })

  it('keeps only the local answers the server accepted', () => {
    const { result } = setup({ q1: A })
    result.current.localRef.current = { q2: B, q3: C }

    act(() => result.current.settle(['q2']))

    expect(result.current.settled).toEqual({ q1: A, q2: B })
  })

  it('lets the server answer win over a local one for the same question', () => {
    const { result } = setup({ q1: A })
    result.current.localRef.current = { q1: B }

    act(() => result.current.settle(['q1']))

    expect(result.current.settled).toEqual({ q1: A })
  })

  it('ignores a later outcome once settled', () => {
    const { result } = setup({ q1: A })
    result.current.localRef.current = { q2: B }

    act(() => result.current.settle([]))
    act(() => result.current.settle(['q2']))

    expect(result.current.settled).toEqual({ q1: A })
  })
})
