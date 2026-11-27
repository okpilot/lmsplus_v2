import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAdminFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockAdminFrom } }))

// ---- Subject under test ---------------------------------------------------

import { getInternalExamCodeForEmail, getSittingCodesForEmail } from './email-queries'

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
  sitting_entry_id: null,
  easa_subjects: { name: 'Meteorology' },
  users: { full_name: 'Alice', email: 'alice@example.com', deleted_at: null },
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
      sittingEntryId: null,
      sittingId: null,
      scheduledAt: null,
      mode: null,
      sittingStatus: null,
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

  it('returns null when the student is soft-deleted (never email a deactivated student)', async () => {
    mockAdmin()
    mockAdminFrom.mockReturnValue(
      buildChain({
        ...ROW,
        users: {
          full_name: 'Alice',
          email: 'alice@example.com',
          deleted_at: '2026-01-01T00:00:00.000Z',
        },
      }),
    )

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

describe('getInternalExamCodeForEmail sitting entry', () => {
  it('maps a non-null sitting_entry_id to sittingEntryId', async () => {
    mockAdmin()
    mockAdminFrom.mockReturnValue(buildChain({ ...ROW, sitting_entry_id: 'entry-1' }))
    const result = await getInternalExamCodeForEmail(CODE_ID)
    expect(result).toMatchObject({ sittingEntryId: 'entry-1' })
  })

  it('returns null when sitting_entry_id is missing (never read as legacy)', async () => {
    mockAdmin()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sitting_entry_id: _omit, ...noField } = ROW
    mockAdminFrom.mockReturnValue(buildChain(noField))
    expect(await getInternalExamCodeForEmail(CODE_ID)).toBeNull()
  })

  it('selects sitting_entry_id', async () => {
    mockAdmin()
    const chain = buildChain(ROW) as { select: ReturnType<typeof vi.fn> }
    mockAdminFrom.mockReturnValue(chain)
    await getInternalExamCodeForEmail(CODE_ID)
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('sitting_entry_id'))
  })
})

describe('getInternalExamCodeForEmail sitting embed (2c-i)', () => {
  const SITTING_ROW = {
    ...ROW,
    sitting_entry_id: 'entry-1',
    exam_sitting_entries: {
      sitting_id: 'sitting-1',
      exam_sittings: {
        scheduled_at: '2026-11-24T09:00:00.000Z',
        mode: 'in_person',
        status: 'scheduled',
      },
    },
  }

  it('maps the sitting date, mode and status of a sitting code', async () => {
    mockAdmin()
    mockAdminFrom.mockReturnValue(buildChain(SITTING_ROW))
    expect(await getInternalExamCodeForEmail(CODE_ID)).toMatchObject({
      sittingEntryId: 'entry-1',
      sittingId: 'sitting-1',
      scheduledAt: '2026-11-24T09:00:00.000Z',
      mode: 'in_person',
      sittingStatus: 'scheduled',
    })
  })

  it('selects the entry-to-sitting embed with scheduled_at, mode and status', async () => {
    mockAdmin()
    const chain = buildChain(SITTING_ROW) as { select: ReturnType<typeof vi.fn> }
    mockAdminFrom.mockReturnValue(chain)
    await getInternalExamCodeForEmail(CODE_ID)
    const cols = String(chain.select.mock.calls[0]?.[0])
    expect(cols).toContain('exam_sitting_entries')
    expect(cols).toMatch(/exam_sitting_entries![^(]*\(sitting_id,/)
    expect(cols).toContain('exam_sittings')
    for (const c of ['scheduled_at', 'mode', 'status']) expect(cols).toContain(c)
  })
})

// ---- getSittingCodesForEmail ------------------------------------------------

type Call = { table: string; method: string; args: unknown[] }

/** Records every builder call; any await yields an empty list, maybeSingle/single a live sitting. */
function recordingAdmin() {
  const calls: Call[] = []
  mockAdminFrom.mockImplementation((table: string) => {
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, method: string) {
          if (method === 'then') {
            return (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
          }
          if (method === 'maybeSingle' || method === 'single') {
            return () => {
              calls.push({ table, method, args: [] })
              return Promise.resolve({
                data: {
                  id: SITTING_ID,
                  status: 'scheduled',
                  scheduled_at: '2999-01-01T00:00:00Z',
                  mode: 'remote',
                },
                error: null,
              })
            }
          }
          return (...args: unknown[]) => {
            calls.push({ table, method, args })
            return builder
          }
        },
      },
    )
    return builder
  })
  return calls
}

const SITTING_ID = 'sitting-1'

const usedEq = (calls: Call[], col: string, val: unknown) =>
  calls.some((c) => c.method === 'eq' && c.args[0] === col && c.args[1] === val)
const usedIsNull = (calls: Call[], col: string, table?: string) =>
  calls.some(
    (c) =>
      c.method === 'is' &&
      c.args[0] === col &&
      c.args[1] === null &&
      (table === undefined || c.table === table),
  )

describe('getSittingCodesForEmail', () => {
  it('rejects and reads nothing when requireAdmin rejects', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('forbidden'))
    await expect(getSittingCodesForEmail(ORG_ID, SITTING_ID)).rejects.toThrow('forbidden')
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('scopes every read by organization and the sitting id', async () => {
    const calls = recordingAdmin()
    await getSittingCodesForEmail(ORG_ID, SITTING_ID)
    expect(calls.length).toBeGreaterThan(0)
    expect(usedEq(calls, 'organization_id', ORG_ID)).toBe(true)
    expect(
      calls.some(
        (c) => c.args[1] === SITTING_ID && (c.args[0] === 'id' || c.args[0] === 'sitting_id'),
      ),
    ).toBe(true)
    const tables = new Set(calls.map((c) => c.table))
    for (const t of tables) {
      expect(
        calls.some((c) => c.table === t && c.method === 'eq' && c.args[0] === 'organization_id'),
      ).toBe(true)
    }
  })

  it('reads only live rows and codes not yet emailed', async () => {
    const calls = recordingAdmin()
    await getSittingCodesForEmail(ORG_ID, SITTING_ID)
    for (const col of ['deleted_at', 'emailed_at', 'consumed_at', 'voided_at']) {
      expect(usedIsNull(calls, col, 'internal_exam_codes')).toBe(true)
    }
    expect(usedIsNull(calls, 'exam_sitting_entries.deleted_at', 'internal_exam_codes')).toBe(true)
    expect(
      calls.some((c) => (c.method === 'gt' || c.method === 'gte') && c.args[0] === 'expires_at'),
    ).toBe(true)
  })

  it('returns no rows and skipped 0 for an empty sitting', async () => {
    recordingAdmin()
    expect(await getSittingCodesForEmail(ORG_ID, SITTING_ID)).toMatchObject({
      rows: [],
      skipped: 0,
    })
  })
})

// ---- getSittingCodesForEmail paging -----------------------------------------

const pageRows = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${String(from + i).padStart(5, '0')}`,
    code: `C${from + i}`,
    easa_subjects: { name: 'Subject' },
    users: { full_name: 'A', email: `a${from + i}@example.com`, deleted_at: null },
  }))

/** Serves the sitting lookup, then each queued page in order; records every `gt` call. */
function pagedAdmin(pages: { data: unknown; error?: { message: string } | null }[]) {
  const gtCalls: unknown[][] = []
  let next = 0
  mockAdminFrom.mockImplementation((table: string) => {
    const paged = table === 'internal_exam_codes'
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, method: string) {
          if (method === 'then' && paged) {
            return (resolve: (v: unknown) => unknown) => {
              const p = pages[next++] ?? { data: [] }
              return resolve({ data: p.data, error: p.error ?? null })
            }
          }
          if (method === 'then') return undefined
          if (method === 'maybeSingle') {
            return () =>
              Promise.resolve({
                data: { status: 'scheduled', scheduled_at: '2999-01-01T00:00:00Z', mode: 'remote' },
                error: null,
              })
          }
          return (...args: unknown[]) => {
            if (method === 'gt' && args[0] === 'id') gtCalls.push(args)
            return builder
          }
        },
      },
    )
    return builder
  })
  return gtCalls
}

describe('getSittingCodesForEmail paging', () => {
  it('carries the last id of the previous page into the next call', async () => {
    const first = pageRows(1000)
    const gtCalls = pagedAdmin([{ data: first }, { data: pageRows(1, 1000) }, { data: [] }])
    const r = await getSittingCodesForEmail(ORG_ID, SITTING_ID)
    expect(gtCalls).toEqual([
      ['id', first[999]?.id],
      ['id', 'id-01000'],
    ])
    expect(r.rows).toHaveLength(1001)
  })

  it('ends cleanly when a full page is followed by an empty page', async () => {
    pagedAdmin([{ data: pageRows(1000) }, { data: [] }])
    const r = await getSittingCodesForEmail(ORG_ID, SITTING_ID)
    expect(r.rows).toHaveLength(1000)
  })

  it('ends with the rows of a short page followed by an empty page', async () => {
    pagedAdmin([{ data: pageRows(3) }, { data: [] }])
    const r = await getSittingCodesForEmail(ORG_ID, SITTING_ID)
    expect(r.rows).toHaveLength(3)
  })

  it('throws on a page error', async () => {
    pagedAdmin([{ data: null, error: { message: 'boom' } }])
    await expect(getSittingCodesForEmail(ORG_ID, SITTING_ID)).rejects.toThrow('boom')
  })

  it('throws on a null page after a full page', async () => {
    pagedAdmin([{ data: pageRows(1000) }, { data: null }])
    await expect(getSittingCodesForEmail(ORG_ID, SITTING_ID)).rejects.toThrow('null page')
  })
})
