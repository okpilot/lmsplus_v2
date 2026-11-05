import { describe, expect, it } from 'vitest'
import type { StudentRow } from '../types'
import { buildStudentPayload, canSubmitStudent } from './student-form-payload'

const COURSE_A = '00000000-0000-4000-a000-0000000000a1'
const COURSE_B = '00000000-0000-4000-a000-0000000000b2'

const STUDENT = {
  id: '00000000-0000-4000-a000-000000000001',
  email: 'alice@example.com',
  full_name: 'Alice',
  role: 'student',
  course_ids: [COURSE_A, COURSE_B],
} as StudentRow

describe('buildStudentPayload', () => {
  it('builds the create payload from the form fields', () => {
    expect(
      buildStudentPayload({
        student: undefined,
        email: 'new@example.com',
        fullName: 'New',
        role: 'student',
        courseIds: [COURSE_A],
      }),
    ).toEqual({
      email: 'new@example.com',
      full_name: 'New',
      role: 'student',
      course_ids: [COURSE_A],
    })
  })

  it('builds the update payload with course_ids undefined when the course set is unchanged', () => {
    const payload = buildStudentPayload({
      student: STUDENT,
      email: STUDENT.email,
      fullName: 'Alice B',
      role: 'student',
      courseIds: [COURSE_B, COURSE_A],
    })
    expect(payload).toEqual({ id: STUDENT.id, full_name: 'Alice B', role: 'student' })
    expect((payload as { course_ids?: unknown }).course_ids).toBeUndefined()
  })

  it('builds the update payload with course_ids when the course set changed', () => {
    const payload = buildStudentPayload({
      student: STUDENT,
      email: STUDENT.email,
      fullName: 'Alice',
      role: 'student',
      courseIds: [COURSE_A],
    })
    expect(payload).toEqual({
      id: STUDENT.id,
      full_name: 'Alice',
      role: 'student',
      course_ids: [COURSE_A],
    })
  })
})

describe('canSubmitStudent', () => {
  const create = (email: string, fullName: string) =>
    buildStudentPayload({ student: undefined, email, fullName, role: 'student', courseIds: [] })
  const edit = (fullName: string) =>
    buildStudentPayload({
      student: STUDENT,
      email: STUDENT.email,
      fullName,
      role: 'student',
      courseIds: STUDENT.course_ids,
    })

  it('rejects create with an empty email', () => {
    expect(canSubmitStudent(create('', 'New'), false)).toBe(false)
  })

  it('rejects create with an empty full name', () => {
    expect(canSubmitStudent(create('new@example.com', ''), false)).toBe(false)
  })

  it('accepts create with a valid email and name', () => {
    expect(canSubmitStudent(create('new@example.com', 'New'), false)).toBe(true)
  })

  it('rejects edit with a cleared full name', () => {
    expect(canSubmitStudent(edit(''), true)).toBe(false)
  })

  it('accepts edit with a name', () => {
    expect(canSubmitStudent(edit('Alice B'), true)).toBe(true)
  })
})
