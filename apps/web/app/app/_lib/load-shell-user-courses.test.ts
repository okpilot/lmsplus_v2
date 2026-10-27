import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCallerProfile, mockGetMyCourses } = vi.hoisted(() => ({
  mockGetCallerProfile: vi.fn(),
  mockGetMyCourses: vi.fn(),
}))

vi.mock('@/lib/auth/get-caller-profile', () => ({
  getCallerProfile: (...args: unknown[]) => mockGetCallerProfile(...args),
}))
vi.mock('@/lib/queries/my-courses', () => ({ getMyCourses: () => mockGetMyCourses() }))

import { loadShellUser } from './load-shell-user'

const user = { id: 'u1', email: 'ada@example.com' }
const profile = (role: string) => ({
  data: { full_name: 'Ada', email: 'ada@example.com', role },
  error: null,
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('loadShellUser courseCodes', () => {
  it('resolves the enrolled course codes for a student', async () => {
    mockGetCallerProfile.mockResolvedValue(profile('student'))
    mockGetMyCourses.mockResolvedValue([{ code: 'PPL_A' }, { code: 'VFR_RT' }])
    expect((await loadShellUser(user)).courseCodes).toEqual(['PPL_A', 'VFR_RT'])
  })

  it('resolves an empty array for a student with no enrolments', async () => {
    mockGetCallerProfile.mockResolvedValue(profile('student'))
    mockGetMyCourses.mockResolvedValue([])
    expect((await loadShellUser(user)).courseCodes).toEqual([])
  })

  it('resolves null and logs when the enrolment read errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetCallerProfile.mockResolvedValue(profile('student'))
    mockGetMyCourses.mockRejectedValue(new Error('enrol read failed'))
    const result = await loadShellUser(user)
    expect(result.courseCodes).toBeNull()
    expect(result.userRole).toBe('student')
    expect(spy).toHaveBeenCalled()
  })

  it.each(['admin', 'instructor'])(
    'resolves null without reading enrolments for %s',
    async (role) => {
      mockGetCallerProfile.mockResolvedValue(profile(role))
      mockGetMyCourses.mockResolvedValue([])
      const result = await loadShellUser(user)
      expect(result.courseCodes).toBeNull()
      expect(mockGetMyCourses).not.toHaveBeenCalled()
    },
  )
})
