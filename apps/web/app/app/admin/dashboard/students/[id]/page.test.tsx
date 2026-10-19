import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockNotFound, mockRequireAdmin, mockGetDetail, mockStart } = vi.hoisted(() => ({
  mockNotFound: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockGetDetail: vi.fn(),
  mockStart: vi.fn(),
}))

vi.mock('next/navigation', () => ({ notFound: mockNotFound }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('./queries', () => ({ getStudentDetail: mockGetDetail }))
vi.mock('./start-student-sessions', () => ({ startStudentSessions: mockStart }))
vi.mock('./_components/student-header', () => ({ StudentHeader: () => null }))
vi.mock('./_components/session-history-content', () => ({ SessionHistoryContent: () => null }))

import StudentDetailPage from './page'

const ID = '11111111-1111-4111-8111-111111111111'
const props = { params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) }

describe('StudentDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'a', organizationId: 'org-1' })
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
    mockStart.mockReturnValue(Promise.resolve({ sessions: [], totalCount: 0 }))
  })

  it('starts the sessions read before the student detail read finishes', async () => {
    let resolveDetail: (v: unknown) => void = () => {}
    mockGetDetail.mockReturnValue(new Promise((r) => (resolveDetail = r)))

    const page = StudentDetailPage(props)
    await vi.waitFor(() =>
      expect(mockStart).toHaveBeenCalledWith(ID, expect.objectContaining({ page: 1 })),
    )

    resolveDetail({ id: ID })
    await page
  })

  it('returns not found for an unknown student after starting the sessions read', async () => {
    mockGetDetail.mockResolvedValue(null)

    await expect(StudentDetailPage(props)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockStart).toHaveBeenCalled()
  })
})
