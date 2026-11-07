import { describe, expect, it } from 'vitest'
import { type ChainCall, hasDeletedAtFilter, recordChainCalls } from './record-chain-calls'

type FakeChain = {
  select: (cols: string) => FakeChain
  is: (col: string, value: null) => FakeChain
  then: (resolve: (v: unknown) => void) => void
}

function fakeChain(result: unknown): FakeChain {
  const chain: FakeChain = {
    select: () => chain,
    is: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: thenable stands in for a Supabase query
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return chain
}

describe('recordChainCalls', () => {
  it('logs each chained call with its table and arguments', () => {
    const log: ChainCall[] = []
    recordChainCalls('easa_topics', fakeChain(1), log).select('id').is('deleted_at', null)
    expect(log).toEqual([
      { table: 'easa_topics', method: 'select', args: ['id'] },
      { table: 'easa_topics', method: 'is', args: ['deleted_at', null] },
    ])
  })

  it('still resolves the wrapped chain when awaited', async () => {
    const log: ChainCall[] = []
    await expect(
      recordChainCalls('easa_topics', fakeChain({ data: [] }), log).select('id'),
    ).resolves.toEqual({ data: [] })
  })

  it('passes a non-object chain through unchanged', () => {
    expect(recordChainCalls('t', undefined, [])).toBeUndefined()
  })
})

describe('hasDeletedAtFilter', () => {
  const log: ChainCall[] = [
    { table: 'easa_topics', method: 'is', args: ['deleted_at', null] },
    { table: 'easa_subjects', method: 'is', args: ['other', null] },
  ]

  it('is true only for the table that carries the deleted_at null filter', () => {
    expect(hasDeletedAtFilter(log, 'easa_topics')).toBe(true)
    expect(hasDeletedAtFilter(log, 'easa_subjects')).toBe(false)
  })
})
