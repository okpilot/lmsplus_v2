import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: fromMock } }))

import {
  getDeliverablePendingNotices,
  getNoticeRecipients,
  getSubjectNames,
  type UserClient,
} from './notice-queries'

type Result = { data: unknown; error: { message: string } | null }

function buildChain(result: Result, onIn?: (ids: string[]) => void) {
  const chain: unknown = new Proxy(() => undefined, {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: Result) => unknown) => res(result)
      if (prop === 'in') {
        return (_c: string, ids: string[]) => {
          onIn?.(ids)
          return chain
        }
      }
      return () => chain
    },
  })
  return chain
}

function rpcClient(result: Result): UserClient {
  return { rpc: vi.fn().mockResolvedValue(result) } as unknown as UserClient
}

describe('notice-queries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('getNoticeRecipients queries ids in chunks of 200 without duplicates', async () => {
    const sizes: number[] = []
    fromMock.mockImplementation(() =>
      buildChain({ data: [], error: null }, (ids) => sizes.push(ids.length)),
    )
    const ids = Array.from({ length: 450 }, (_, i) => `u${i}`)
    await getNoticeRecipients('org', [...ids, ...ids])
    expect(sizes).toEqual([200, 200, 50])
  })

  it('getNoticeRecipients omits users without an email and nulls an empty name', async () => {
    fromMock.mockImplementation(() =>
      buildChain({
        data: [
          { id: 'a', full_name: '', email: 'a@x.test' },
          { id: 'b', full_name: 'B', email: null },
        ],
        error: null,
      }),
    )
    const map = await getNoticeRecipients('org', ['a', 'b'])
    expect([...map.entries()]).toEqual([['a', { name: null, email: 'a@x.test' }]])
  })

  it('getNoticeRecipients throws on a read error', async () => {
    fromMock.mockImplementation(() => buildChain({ data: null, error: { message: 'boom' } }))
    await expect(getNoticeRecipients('org', ['a'])).rejects.toThrow('notice recipients: boom')
  })

  it('getSubjectNames throws on a read error', async () => {
    fromMock.mockImplementation(() => buildChain({ data: null, error: { message: 'boom' } }))
    await expect(getSubjectNames(['s'])).rejects.toThrow('subject names: boom')
  })

  it('getDeliverablePendingNotices returns [] for an unknown sitting', async () => {
    const out = await getDeliverablePendingNotices(
      rpcClient({ data: null, error: { message: 'sitting_not_found' } }),
      'org',
      'sit',
    )
    expect(out).toEqual([])
  })

  it('getDeliverablePendingNotices throws on any other RPC error', async () => {
    await expect(
      getDeliverablePendingNotices(
        rpcClient({ data: null, error: { message: 'other' } }),
        'org',
        'sit',
      ),
    ).rejects.toThrow('pending notices: other')
  })

  it('getDeliverablePendingNotices drops a cancellation without a code and a student without a recipient', async () => {
    fromMock.mockImplementation(() =>
      buildChain({ data: [{ id: 'u1', full_name: 'A', email: 'a@x.test' }], error: null }),
    )
    const out = await getDeliverablePendingNotices(
      rpcClient({
        data: [
          {
            kind: 'sitting_cancelled',
            code_id: null,
            entry_id: 'e0',
            user_id: 'u1',
            subject_id: 's',
          },
          {
            kind: 'sitting_cancelled',
            code_id: 'c1',
            entry_id: 'e1',
            user_id: 'u1',
            subject_id: 's',
          },
          {
            kind: 'entry_auto_removed',
            entry_id: 'e2',
            user_id: 'u2',
            subject_id: 's',
            passed_at: 't',
          },
        ],
        error: null,
      }),
      'org',
      'sit',
    )
    expect(out).toEqual([
      { kind: 'sitting_cancelled', codeId: 'c1', entryId: 'e1', userId: 'u1', subjectId: 's' },
    ])
  })
})
