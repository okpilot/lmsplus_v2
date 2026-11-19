import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type AdminClient, checkEnableReadiness } from './exam-config-readiness'

type Res = { data: unknown; error: { message: string } | null }

function chain(result: Res) {
  return new Proxy(
    {
      // biome-ignore lint/suspicious/noThenProperty: thenable Supabase chain mock
      then: (resolve: (v: unknown) => void) => resolve(result),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'then') return target.then
        if (prop === 'maybeSingle') return () => Promise.resolve(result)
        return () => chain(result)
      },
    },
  )
}

function client(config: Res, dists: Res): AdminClient {
  return {
    from: (table: string) => chain(table === 'exam_configs' ? config : dists),
  } as unknown as AdminClient
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('checkEnableReadiness', () => {
  it('returns null when distributions sum to total questions', async () => {
    const c = client(
      { data: { id: 'c1', total_questions: 10 }, error: null },
      { data: [{ question_count: 4 }, { question_count: 6 }], error: null },
    )
    expect(await checkEnableReadiness(c, 'o', 's')).toBeNull()
  })
  it('fails when the config read errors', async () => {
    const c = client({ data: null, error: { message: 'x' } }, { data: [], error: null })
    expect(await checkEnableReadiness(c, 'o', 's')).toEqual({
      success: false,
      error: 'Failed to check exam configuration',
    })
  })
  it('fails when no config exists', async () => {
    const c = client({ data: null, error: null }, { data: [], error: null })
    expect(await checkEnableReadiness(c, 'o', 's')).toEqual({
      success: false,
      error: 'Configure exam parameters before enabling',
    })
  })
  it('fails when the distribution read errors', async () => {
    const c = client(
      { data: { id: 'c1', total_questions: 10 }, error: null },
      { data: null, error: { message: 'x' } },
    )
    expect(await checkEnableReadiness(c, 'o', 's')).toEqual({
      success: false,
      error: 'Failed to check question distribution',
    })
  })
  it('fails with both totals when distribution does not match', async () => {
    const c = client(
      { data: { id: 'c1', total_questions: 10 }, error: null },
      { data: [{ question_count: 4 }], error: null },
    )
    expect(await checkEnableReadiness(c, 'o', 's')).toEqual({
      success: false,
      error: 'Distribution total (4) does not match total questions (10)',
    })
  })
  it('treats null distributions as total 0', async () => {
    const c = client(
      { data: { id: 'c1', total_questions: 3 }, error: null },
      { data: null, error: null },
    )
    expect(await checkEnableReadiness(c, 'o', 's')).toEqual({
      success: false,
      error: 'Distribution total (0) does not match total questions (3)',
    })
  })
})
