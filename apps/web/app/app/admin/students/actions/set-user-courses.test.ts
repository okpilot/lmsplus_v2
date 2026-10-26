import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setUserCourses } from './set-user-courses'

const USER_ID = '00000000-0000-4000-a000-000000000009'
const COURSE_ID = 'c0a5e000-0000-4000-8000-000000000002'

const mockRpc = vi.fn()
const supabase = { rpc: mockRpc } as unknown as Parameters<typeof setUserCourses>[0]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setUserCourses', () => {
  it('calls set_user_enrolments with the user and course ids and returns ok', async () => {
    mockRpc.mockResolvedValue({ error: null })

    const result = await setUserCourses(supabase, USER_ID, [COURSE_ID])

    expect(mockRpc).toHaveBeenCalledWith('set_user_enrolments', {
      p_user_id: USER_ID,
      p_course_ids: [COURSE_ID],
    })
    expect(result).toEqual({ ok: true })
  })

  it.each([
    ['not_admin', 'Admin permission required'],
    ['admin_not_found', 'Admin permission required'],
    ['user_not_found', 'User not found in your organization'],
    ['course_not_found', 'Unknown course'],
    ['invalid_input', 'Invalid input'],
  ])('maps RPC error %s to "%s"', async (code, message) => {
    mockRpc.mockResolvedValue({ error: { message: code } })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await setUserCourses(supabase, USER_ID, [])

    expect(result).toEqual({ ok: false, error: message })
  })

  it('logs with the [setUserCourses] prefix on failure', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'boom' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await setUserCourses(supabase, USER_ID, [])

    expect(result.ok).toBe(false)
    expect(spy.mock.calls[0]?.[0]).toContain('[setUserCourses]')
  })
})
