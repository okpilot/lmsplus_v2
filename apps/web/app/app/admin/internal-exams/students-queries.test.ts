import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAdminFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockAdminFrom } }))

// ---- Subject under test ---------------------------------------------------

import { listOrgStudents } from './students-queries'

// ---- Helpers ---------------------------------------------------------------

const ORG_ID = 'org-001'

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    organizationId: ORG_ID,
    userId: 'admin-001',
  })
}

/**
 * Builds a chainable Supabase mock. Every chain method returns the same builder.
 * The builder is thenable — awaiting it resolves to { data, error, count }.
 * `count` is derived from data length when data is an array (for getCount calls),
 * or passed explicitly as null for page calls where data is the real payload.
 */
function buildChain(
  data: unknown,
  error: { message: string } | null = null,
  count: number | null = Array.isArray(data) ? data.length : null,
) {
  const resolved = { data, error, count }
  const builder: Record<string, unknown> = {}
  for (const fn of ['select', 'eq', 'is', 'order', 'range']) {
    builder[fn] = vi.fn().mockReturnValue(builder)
  }
  // biome-ignore lint/suspicious/noThenProperty: supabase chain must be thenable to mock awaiting the query builder
  builder.then = (cb: (v: typeof resolved) => unknown) => Promise.resolve(resolved).then(cb)
  return builder
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listOrgStudents', () => {
  describe('happy path', () => {
    it('maps rows to OrgStudentOption with id, fullName, and email', async () => {
      mockAdmin()
      const rows = [
        { id: 'stu-1', full_name: 'Alice Smith', email: 'alice@example.com' },
        { id: 'stu-2', full_name: 'Bob Jones', email: 'bob@example.com' },
      ]
      // fetchAllRows calls getCount first (reads .count), then getPage (reads .data)
      mockAdminFrom
        .mockReturnValueOnce(buildChain(null, null, rows.length)) // count call
        .mockReturnValueOnce(buildChain(rows)) // page call

      const result = await listOrgStudents()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 'stu-1',
        fullName: 'Alice Smith',
        email: 'alice@example.com',
      })
      expect(result[1]).toEqual({ id: 'stu-2', fullName: 'Bob Jones', email: 'bob@example.com' })
    })

    it('falls back to empty string when full_name or email is null', async () => {
      mockAdmin()
      const rows = [{ id: 'stu-1', full_name: null, email: null }]
      mockAdminFrom
        .mockReturnValueOnce(buildChain(null, null, rows.length))
        .mockReturnValueOnce(buildChain(rows))

      const result = await listOrgStudents()

      expect(result[0]).toEqual({ id: 'stu-1', fullName: '', email: '' })
    })

    it('returns an empty array when no students exist', async () => {
      mockAdmin()
      // count=0 → fetchAllRows loop never executes → data=[]
      mockAdminFrom.mockReturnValueOnce(buildChain(null, null, 0))

      const result = await listOrgStudents()

      expect(result).toEqual([])
    })
  })

  describe('error propagation', () => {
    it('throws a sanitized message and logs the raw error when the DB query fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        mockAdmin()
        // getCount resolves with an error → fetchAllRows short-circuits → listOrgStudents throws
        mockAdminFrom.mockReturnValueOnce(buildChain(null, { message: 'boom' }, null))

        await expect(listOrgStudents()).rejects.toThrow('Failed to load students')
        expect(consoleErrorSpy).toHaveBeenCalledWith('[listOrgStudents] DB error:', 'boom')
      } finally {
        consoleErrorSpy.mockRestore()
      }
    })

    it('propagates errors from requireAdmin', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden'))

      await expect(listOrgStudents()).rejects.toThrow('Forbidden')
    })
  })
})
