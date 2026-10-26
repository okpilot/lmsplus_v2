import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setStudentCourses } from './set-student-courses'

const STUDENT_ID = '00000000-0000-4000-a000-000000000009'
const COURSE_ID = 'c0a5e000-0000-4000-8000-000000000002'

const mockRpc = vi.fn()
const supabase = { rpc: mockRpc } as unknown as Parameters<typeof setStudentCourses>[0]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setStudentCourses', () => {
  it('calls set_student_enrolments with the student and course ids and returns ok', async () => {
    mockRpc.mockResolvedValue({ error: null })

    const result = await setStudentCourses(supabase, STUDENT_ID, [COURSE_ID])

    expect(mockRpc).toHaveBeenCalledWith('set_student_enrolments', {
      p_student_id: STUDENT_ID,
      p_course_ids: [COURSE_ID],
    })
    expect(result).toEqual({ ok: true })
  })

  it.each([
    ['not_admin', 'Admin permission required'],
    ['admin_not_found', 'Admin permission required'],
    ['student_not_found', 'Student not found in your organization'],
    ['course_not_found', 'Unknown course'],
    ['invalid_input', 'Invalid input'],
  ])('maps RPC error %s to "%s"', async (code, message) => {
    mockRpc.mockResolvedValue({ error: { message: code } })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await setStudentCourses(supabase, STUDENT_ID, [])

    expect(result).toEqual({ ok: false, error: message })
  })

  it('logs with the [setStudentCourses] prefix on failure', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'boom' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await setStudentCourses(supabase, STUDENT_ID, [])

    expect(result.ok).toBe(false)
    expect(spy.mock.calls[0]?.[0]).toContain('[setStudentCourses]')
  })
})
