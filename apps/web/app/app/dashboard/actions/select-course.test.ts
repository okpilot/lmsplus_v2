import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireAuthUser, mockGetMyCourses, mockCookieSet, mockRevalidatePath } = vi.hoisted(
  () => ({
    mockRequireAuthUser: vi.fn(),
    mockGetMyCourses: vi.fn(),
    mockCookieSet: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }),
)

vi.mock('@/lib/auth/require-auth-user', () => ({ requireAuthUser: mockRequireAuthUser }))
vi.mock('@/lib/queries/my-courses', () => ({ getMyCourses: mockGetMyCourses }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mockCookieSet }) }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import { selectDashboardCourse } from './select-course'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAuthUser.mockResolvedValue({ id: 'u1' })
  mockGetMyCourses.mockResolvedValue([
    { id: 'c1', code: 'PPL_A', short: 'PPL', name: 'PPL(A)' },
    { id: 'c2', code: 'VFR_RT', short: 'RT', name: 'VFR RT' },
  ])
})

describe('selectDashboardCourse', () => {
  it('sets the dashboard_course cookie and revalidates for an enrolled code', async () => {
    const result = await selectDashboardCourse({ code: 'VFR_RT' })
    expect(result).toEqual({ success: true })
    expect(mockCookieSet).toHaveBeenCalledWith(
      'dashboard_course',
      'VFR_RT',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/app' }),
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/dashboard')
  })

  it.each([
    ['lowercase code', { code: 'ppl_a' }],
    ['empty code', { code: '' }],
    ['21-char code', { code: 'A'.repeat(21) }],
    ['missing code', {}],
    ['non-object input', 'PPL_A'],
  ])('rejects %s without setting the cookie', async (_name, input) => {
    const result = await selectDashboardCourse(input)
    expect(result.success).toBe(false)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('rejects a well-formed code the caller is not enrolled in', async () => {
    const result = await selectDashboardCourse({ code: 'ATPL' })
    expect(result.success).toBe(false)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('returns a failure result without setting the cookie when the enrolments read throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetMyCourses.mockRejectedValue(new Error('db down'))
    const result = await selectDashboardCourse({ code: 'PPL_A' })
    expect(result).toEqual({ success: false, error: 'Failed to save course' })
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('does not set the cookie when the caller is unauthenticated', async () => {
    mockRequireAuthUser.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(selectDashboardCourse({ code: 'PPL_A' })).rejects.toThrow()
    expect(mockCookieSet).not.toHaveBeenCalled()
  })
})
