import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { upsertSubject } from './upsert-subject'
import { upsertSubtopic } from './upsert-subtopic'
import { upsertTopic } from './upsert-topic'

const ID = '00000000-0000-4000-a000-000000000001'
const PARENT = '00000000-0000-4000-a000-000000000002'

type Call = { table: string; op: string; args: unknown[] }
type Resolve = (q: { table: string; calls: Call[] }) => {
  data: unknown
  error: { message: string; code?: string } | null
}

/** Records every chained call per `from(table)` query; awaiting it runs `resolve`. */
function fakeSupabase(resolve: Resolve) {
  const queries: Array<{ table: string; calls: Call[] }> = []
  const from = (table: string) => {
    const q = { table, calls: [] as Call[] }
    queries.push(q)
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
              Promise.resolve(resolve(q)).then(ok, ko)
          }
          return (...args: unknown[]) => {
            q.calls.push({ table, op: prop, args })
            return proxy
          }
        },
      },
    )
    return proxy
  }
  mockRequireAdmin.mockResolvedValue({ supabase: { from }, userId: 'admin-1' })
  return queries
}

const ops = (q: { calls: Call[] }) => q.calls.map((c) => c.op)
const hasLiveFilter = (q: { calls: Call[] }) =>
  q.calls.some((c) => c.op === 'is' && c.args[0] === 'deleted_at' && c.args[1] === null)

beforeEach(() => {
  vi.resetAllMocks()
})

describe.each([
  [
    'upsertSubject',
    'easa_subjects',
    (id?: string) =>
      upsertSubject({ ...(id ? { id } : {}), code: 'X1', name: 'N', short: 'S', sort_order: 1 }),
  ],
  [
    'upsertTopic',
    'easa_topics',
    (id?: string) =>
      upsertTopic({
        ...(id ? { id } : {}),
        subject_id: PARENT,
        code: 'X1',
        name: 'N',
        sort_order: 1,
      }),
  ],
  [
    'upsertSubtopic',
    'easa_subtopics',
    (id?: string) =>
      upsertSubtopic({
        ...(id ? { id } : {}),
        topic_id: PARENT,
        code: 'X1',
        name: 'N',
        sort_order: 1,
      }),
  ],
] as const)('%s update path', (_name, table, run) => {
  it('updates only live rows and reports Item not found when zero rows match', async () => {
    const queries = fakeSupabase(() => ({ data: [], error: null }))

    const result = await run(ID)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Item not found')
    const update = queries.find((q) => q.table === table && ops(q).includes('update'))
    expect(update).toBeDefined()
    if (!update) return
    expect(hasLiveFilter(update)).toBe(true)
    expect(ops(update)).toContain('select')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('succeeds when the update matched a live row', async () => {
    fakeSupabase(() => ({ data: [{ id: ID }], error: null }))

    const result = await run(ID)

    expect(result.success).toBe(true)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/syllabus')
  })
})

describe.each([
  [
    'upsertTopic',
    'easa_subjects',
    'easa_topics',
    () => upsertTopic({ subject_id: PARENT, code: 'X1', name: 'N', sort_order: 1 }),
    'topic',
  ],
  [
    'upsertSubtopic',
    'easa_topics',
    'easa_subtopics',
    () => upsertSubtopic({ topic_id: PARENT, code: 'X1', name: 'N', sort_order: 1 }),
    'subtopic',
  ],
] as const)('%s insert path', (_name, parentTable, table, run, noun) => {
  it('reads the parent with a deleted_at filter and refuses a missing/deleted parent', async () => {
    const queries = fakeSupabase((q) =>
      q.table === parentTable ? { data: null, error: null } : { data: null, error: null },
    )

    const result = await run()

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Item not found')
    const parent = queries.find((q) => q.table === parentTable)
    expect(parent).toBeDefined()
    if (!parent) return
    expect(hasLiveFilter(parent)).toBe(true)
    expect(queries.some((q) => q.table === table && ops(q).includes('insert'))).toBe(false)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('mentions that the code may have been deleted on a duplicate-code insert', async () => {
    fakeSupabase((q) => {
      if (q.table === parentTable) return { data: { id: PARENT }, error: null }
      if (ops(q).includes('insert')) return { data: null, error: { message: 'dup', code: '23505' } }
      return { data: { sort_order: 1 }, error: null }
    })

    const result = await run()

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain(`A ${noun} with this code already exists`)
    expect(result.error).toContain('it may have been deleted')
  })
})

describe('upsertSubject insert path', () => {
  it('mentions that the code may have been deleted on a duplicate-code insert', async () => {
    fakeSupabase((q) =>
      ops(q).includes('insert')
        ? { data: null, error: { message: 'dup', code: '23505' } }
        : { data: { sort_order: 1 }, error: null },
    )

    const result = await upsertSubject({ code: 'X1', name: 'N', short: 'S', sort_order: 1 })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain('A subject with this code already exists')
    expect(result.error).toContain('it may have been deleted')
  })
})
