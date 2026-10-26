import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockVerifySessionUser, mockRpc, mockClient } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  return { mockVerifySessionUser: vi.fn(), mockRpc, mockClient: { rpc: mockRpc } }
})

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))
vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
}))

import { startQuizSession } from './start'
import { startExamSession } from './start-exam'
import { startStudy } from './study'

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const NOT_ENROLLED = 'You are not enrolled in this course.'

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
  mockRpc.mockResolvedValue({ data: null, error: { message: 'not_enrolled' } })
})

describe('start actions — not enrolled', () => {
  it('startQuizSession tells the student they are not enrolled in this course', async () => {
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 5 })
    expect(result).toEqual({ success: false, error: NOT_ENROLLED })
  })

  it('startExamSession tells the student they are not enrolled in this course', async () => {
    const result = await startExamSession({ subjectId: SUBJECT_ID })
    expect(result).toEqual({ success: false, error: NOT_ENROLLED })
  })

  it('startStudy tells the student they are not enrolled in this course', async () => {
    const result = await startStudy({ subjectId: SUBJECT_ID, count: 5 })
    expect(result).toEqual({ success: false, error: NOT_ENROLLED })
  })
})
