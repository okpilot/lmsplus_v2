import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { StudentRow } from '../types'
import { useStudentDialogs } from './use-student-dialogs'

const student: StudentRow = {
  id: 's1',
  email: 's1@test.local',
  full_name: 'Student One',
  role: 'student',
  organization_id: 'o1',
  last_active_at: null,
  created_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
  login_instructions_sent_at: null,
  temp_password_expires_at: null,
  course_ids: [],
  group_ids: [],
}

describe('useStudentDialogs', () => {
  it('starts with every dialog closed', () => {
    const { result } = renderHook(() => useStudentDialogs())
    expect(result.current.editStudent).toBeNull()
    expect(result.current.toggleStudent).toBeNull()
    expect(result.current.exportStudent).toBeNull()
  })

  it('opens only the edit dialog for the chosen student', () => {
    const { result } = renderHook(() => useStudentDialogs())
    act(() => result.current.setEditStudent(student))
    expect(result.current.editStudent).toBe(student)
    expect(result.current.toggleStudent).toBeNull()
    expect(result.current.exportStudent).toBeNull()
  })

  it('opens only the status dialog for the chosen student', () => {
    const { result } = renderHook(() => useStudentDialogs())
    act(() => result.current.setToggleStudent(student))
    expect(result.current.toggleStudent).toBe(student)
    expect(result.current.editStudent).toBeNull()
    expect(result.current.exportStudent).toBeNull()
  })

  it('opens only the export dialog and closes it again', () => {
    const { result } = renderHook(() => useStudentDialogs())
    act(() => result.current.setExportStudent(student))
    expect(result.current.exportStudent).toBe(student)
    expect(result.current.editStudent).toBeNull()
    expect(result.current.toggleStudent).toBeNull()
    act(() => result.current.setExportStudent(null))
    expect(result.current.exportStudent).toBeNull()
  })
})
