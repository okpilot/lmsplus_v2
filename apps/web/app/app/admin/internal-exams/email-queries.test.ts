import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAdminFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockAdminFrom } }))

// ---- Subject under test ---------------------------------------------------

import { getInternalExamCodeForEmail } from './email-queries'

// ---- Helpers ---------------------------------------------------------------

const ORG_ID = 'org-001'
const CODE_ID = 'code-1'

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: mockAdminFrom },
    organizationId: ORG_ID,
    userId: 'admin-001',
  })
}

/**
 * Chainable Supabase mock terminating in maybeSingle() → { data, error }.
 */
function buildChain(data: unknown, error: { message: string } | null = null) {
  const resolved = { data, error }
  const builder: Record<string, unknown> = {}
  for (const fn of ['select', 'eq', 'is']) {
    builder[fn] = vi.fn().mockReturnValue(builder)
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(resolved)
  return builder
}

const ROW = {
  code: 'ABCD2345',
  expires_at: '2026-04-29T00:00:00.000Z',
  consumed_at: null,
  voided_at: null,
  easa_subjects: { name: 'Meteorology' },
  users: { full_name: 'Alice', email: 'alice@example.com' },
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getInternalExamCodeForEmail', () => {
  it('returns the mapped email payload for a valid row', async () => {
    mockAdmin()
    mockAdminFrom.mockReturnValue(buildChain(ROW))

    const result = await getInternalExamCodeForEmail(CODE_ID)

    expect(result).toEqual({
      code: 'ABCD2345',
      studentEmail: 'alice@example.com',
      studentName: 'Alice',
      subjectName: 'Meteorology',
      expiresAt: '2026-04-29T00:00:00.000Z',
      consumedAt: null,
      voidedAt: null,
    })
  })

  it('returns null and logs when the query errors', async () => {
    mockAdmin()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminFrom.mockReturnValue(buildChain(null, { message: 'boom' }))

    const result = await getInternalExamCodeForEmail(CODE_ID)

    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith('[getInternalExamCodeForEmail] DB error:', 'boom')
    errorSpy.mockRestore()
  })

  it('returns null when the row shape is invalid (wrong field type)', async () => {
    mockAdmin()
    // code is a number, not a string — fails the strengthened isCodeRow guard.
    mockAdminFrom.mockReturnValue(buildChain({ ...ROW, code: 123 }))

    const result = await getInternalExamCodeForEmail(CODE_ID)

    expect(result).toBeNull()
  })

  it('returns null when no row matches', async () => {
    mockAdmin()
    mockAdminFrom.mockReturnValue(buildChain(null))

    const result = await getInternalExamCodeForEmail(CODE_ID)

    expect(result).toBeNull()
  })

  it('returns null when the joined user has no email', async () => {
    mockAdmin()
    mockAdminFrom.mockReturnValue(
      buildChain({ ...ROW, users: { full_name: 'Alice', email: null } }),
    )

    const result = await getInternalExamCodeForEmail(CODE_ID)

    expect(result).toBeNull()
  })

  it('defaults studentName to null and subjectName to empty when joins are missing', async () => {
    mockAdmin()
    mockAdminFrom.mockReturnValue(
      buildChain({ ...ROW, easa_subjects: null, users: { full_name: null, email: 'a@b.com' } }),
    )

    const result = await getInternalExamCodeForEmail(CODE_ID)

    expect(result).toMatchObject({ studentName: null, subjectName: '', studentEmail: 'a@b.com' })
  })
})
