import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom }),
}))

import { getVfrRtExamQuestionCount } from './vfr-rt-exam-question-count'

// ---- Helpers --------------------------------------------------------------

function buildChain(returnValue: unknown) {
  const awaitable: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

type Stub = { data?: unknown; error?: { message: string } | null; count?: number | null }

function stubTables(tables: { config: Stub; topic?: Stub; subtopics?: Stub }) {
  const byTable: Record<string, Stub | undefined> = {
    exam_configs: tables.config,
    easa_topics: tables.topic ?? { data: { id: 'topic-3' }, error: null },
    easa_subtopics: tables.subtopics ?? { count: 6, error: null },
  }
  mockFrom.mockImplementation((table: string) => {
    const stub = byTable[table]
    if (!stub) throw new Error(`unexpected table ${table}`)
    return buildChain({ data: null, error: null, count: null, ...stub })
  })
}

const config = (parts_config: unknown): Stub => ({ data: { parts_config }, error: null })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getVfrRtExamQuestionCount', () => {
  it('sums the default part sizes and two questions per Part 3 subtopic', async () => {
    stubTables({ config: config({}) })
    expect(await getVfrRtExamQuestionCount('s1')).toBe(8 + 9 + 2 * 6)
  })

  it('uses defaults when parts_config is not an object', async () => {
    stubTables({ config: config(null) })
    expect(await getVfrRtExamQuestionCount('s1')).toBe(8 + 9 + 2 * 6)
  })

  it('uses configured part 1 and part 2 counts', async () => {
    stubTables({ config: config({ part1: { count: 5 }, part2: { count: 4 } }) })
    expect(await getVfrRtExamQuestionCount('s1')).toBe(5 + 4 + 12)
  })

  it('accepts integer-string counts', async () => {
    stubTables({ config: config({ part1: { count: '8' } }) })
    expect(await getVfrRtExamQuestionCount('s1')).toBe(8 + 9 + 12)
  })

  it('ignores the part 3 count', async () => {
    stubTables({ config: config({ part3: { count: 99 } }) })
    expect(await getVfrRtExamQuestionCount('s1')).toBe(8 + 9 + 12)
  })

  it('looks the Part 3 topic up by the configured topic code', async () => {
    stubTables({ config: config({ part3: { topic_code: 'P3_CUSTOM' } }) })
    expect(await getVfrRtExamQuestionCount('s1')).toBe(8 + 9 + 12)
  })

  it('returns null when the subject has no enabled exam config', async () => {
    stubTables({ config: { data: null, error: null } })
    expect(await getVfrRtExamQuestionCount('s1')).toBeNull()
  })

  it('returns null when the Part 3 topic does not exist', async () => {
    stubTables({ config: config({}), topic: { data: null, error: null } })
    expect(await getVfrRtExamQuestionCount('s1')).toBeNull()
  })

  it('returns null when the Part 3 topic has no subtopics', async () => {
    stubTables({ config: config({}), subtopics: { count: 0, error: null } })
    expect(await getVfrRtExamQuestionCount('s1')).toBeNull()
  })

  it.each([8.5, 'abc', 0, -1, true])('returns null for a malformed count %s', async (bad) => {
    stubTables({ config: config({ part2: { count: bad } }) })
    expect(await getVfrRtExamQuestionCount('s1')).toBeNull()
  })

  it.each([42, '', {}])('returns null for a malformed topic code %j', async (bad) => {
    stubTables({ config: config({ part3: { topic_code: bad } }) })
    expect(await getVfrRtExamQuestionCount('s1')).toBeNull()
  })

  it.each([
    ['config', { config: { data: null, error: { message: 'boom' } } }],
    ['topic', { config: config({}), topic: { data: null, error: { message: 'boom' } } }],
    ['subtopics', { config: config({}), subtopics: { count: null, error: { message: 'boom' } } }],
  ])('returns null and logs when the %s query fails', async (_name, tables) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubTables(tables)
    expect(await getVfrRtExamQuestionCount('s1')).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[getVfrRtExamQuestionCount]'), 'boom')
  })
})
