import { describe, expect, it } from 'vitest'
import type { StudentRow } from '../types'
import { isSelectableStudent } from './is-selectable-student'

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
