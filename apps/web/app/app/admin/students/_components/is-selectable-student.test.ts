import { describe, expect, it } from 'vitest'
import type { StudentRow } from '../types'
import { isSelectableStudent, selectionSummary } from './is-selectable-student'

const row = (over: Partial<StudentRow>): StudentRow =>
  ({ role: 'student', deleted_at: null, ...over }) as StudentRow

describe('isSelectableStudent', () => {
  it('accepts an active student', () => {
    expect(isSelectableStudent(row({}))).toBe(true)
  })
  it('rejects a deactivated student', () => {
    expect(isSelectableStudent(row({ deleted_at: '2026-01-01T00:00:00Z' }))).toBe(false)
  })
  it('rejects a non-student role', () => {
    expect(isSelectableStudent(row({ role: 'instructor' }))).toBe(false)
  })
})

describe('selectionSummary', () => {
  const active = row({ id: 'a' })
  const other = row({ id: 'b' })
  const instructor = row({ id: 'c', role: 'instructor' })

  it('counts only selectable rows and reports all selected when every one is picked', () => {
    expect(selectionSummary([active, other, instructor], ['a', 'b'])).toEqual({
      selectableCount: 2,
      allSelected: true,
    })
  })
  it('reports not all selected while a selectable row is unpicked', () => {
    expect(selectionSummary([active, other], ['a'])).toEqual({
      selectableCount: 2,
      allSelected: false,
    })
  })
  it('never reports all selected when no row is selectable', () => {
    expect(selectionSummary([instructor], [])).toEqual({ selectableCount: 0, allSelected: false })
  })
})
