import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useScopedSelection } from './use-scoped-selection'

type Props = { scope: string; ids: string[] }

function setup(initial: Props) {
  return renderHook(({ scope, ids }: Props) => useScopedSelection(scope, ids), {
    initialProps: initial,
  })
}

describe('useScopedSelection', () => {
  it('clears the selection when the scope changes', () => {
    const { result, rerender } = setup({ scope: 'A', ids: ['1', '2'] })
    act(() => result.current.toggle('1'))
    expect(result.current.selectedIds).toEqual(['1'])

    rerender({ scope: 'B', ids: ['1', '2'] })

    expect(result.current.selectedIds).toEqual([])
  })

  it('stays empty when returning to the original scope', () => {
    const { result, rerender } = setup({ scope: 'A', ids: ['1', '2'] })
    act(() => result.current.toggle('1'))

    rerender({ scope: 'B', ids: ['1', '2'] })
    rerender({ scope: 'A', ids: ['1', '2'] })

    expect(result.current.selectedIds).toEqual([])
  })

  it('drops an id that is no longer visible under the same scope', () => {
    const { result, rerender } = setup({ scope: 'A', ids: ['1', '2'] })
    act(() => result.current.toggle('1'))
    act(() => result.current.toggle('2'))

    rerender({ scope: 'A', ids: ['2'] })

    expect(result.current.selectedIds).toEqual(['2'])
  })

  it('does not re-select a row that left and later returned under the same scope', () => {
    const { result, rerender } = setup({ scope: 'A', ids: ['1', '2'] })
    act(() => result.current.toggle('1'))

    rerender({ scope: 'A', ids: ['2'] })
    rerender({ scope: 'A', ids: ['1', '2'] })

    expect(result.current.selectedIds).toEqual([])
  })

  it('selects all visible rows with toggleAll after a selected row vanished', () => {
    const { result, rerender } = setup({ scope: 'A', ids: ['1', '2', '3'] })
    act(() => result.current.toggle('1'))
    rerender({ scope: 'A', ids: ['2', '3'] })

    act(() => result.current.toggleAll())

    expect(result.current.selectedIds).toEqual(['2', '3'])
  })

  it('clears every row with toggleAll when all visible rows are selected', () => {
    const { result } = setup({ scope: 'A', ids: ['1', '2'] })
    act(() => result.current.toggleAll())
    expect(result.current.selectedIds).toEqual(['1', '2'])

    act(() => result.current.toggleAll())

    expect(result.current.selectedIds).toEqual([])
  })

  it('clears the selection with clear', () => {
    const { result } = setup({ scope: 'A', ids: ['1', '2'] })
    act(() => result.current.toggleAll())

    act(() => result.current.clear())

    expect(result.current.selectedIds).toEqual([])
  })
})
