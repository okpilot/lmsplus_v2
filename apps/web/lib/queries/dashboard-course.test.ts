import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetMyCourses, mockCookieGet } = vi.hoisted(() => ({
  mockGetMyCourses: vi.fn(),
  mockCookieGet: vi.fn(),
}))

vi.mock('react', () => ({ cache: <T>(fn: T) => fn }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mockCookieGet }) }))
vi.mock('./my-courses', () => ({ getMyCourses: mockGetMyCourses }))

import { getDashboardCourse } from './dashboard-course'

const PPL = { id: 'c1', code: 'PPL_A', short: 'PPL', name: 'PPL(A)' }
const RT = { id: 'c2', code: 'VFR_RT', short: 'RT', name: 'VFR RT' }

describe('getDashboardCourse', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('selects the course named by the dashboard_course cookie', async () => {
    mockGetMyCourses.mockResolvedValue([PPL, RT])
    mockCookieGet.mockReturnValue({ value: 'VFR_RT' })
    const res = await getDashboardCourse()
    expect(mockCookieGet).toHaveBeenCalledWith('dashboard_course')
    expect(res).toEqual({ courses: [PPL, RT], selected: RT })
  })

  it('falls back to the first course when the cookie is absent', async () => {
    mockGetMyCourses.mockResolvedValue([PPL, RT])
    mockCookieGet.mockReturnValue(undefined)
    expect((await getDashboardCourse()).selected).toEqual(PPL)
  })

  it('shows no course and logs when the enrolment read fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetMyCourses.mockRejectedValue(new Error('boom'))
    mockCookieGet.mockReturnValue({ value: 'PPL_A' })
    expect(await getDashboardCourse()).toEqual({ courses: [], selected: null })
    expect(log).toHaveBeenCalledWith('[getDashboardCourse] enrolments read failed:', 'boom')
    log.mockRestore()
  })

  it('selects null when the user has no courses', async () => {
    mockGetMyCourses.mockResolvedValue([])
    mockCookieGet.mockReturnValue({ value: 'PPL_A' })
    expect(await getDashboardCourse()).toEqual({ courses: [], selected: null })
  })
})
