import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { insertPassedSession } from './passed-session'

const C = {
  orgId: 'org-1',
  userId: 'u-1',
  subjectId: 'sub-1',
  score: 90,
  endedAt: new Date('2026-01-01T12:00:00.000Z'),
}

type Result = { data: unknown; error: { message: string } | null }

function fakeAdmin(config: Result, insert: Result) {
  const inserted = vi.fn()
  const chain = (result: Result) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) c[m] = () => c
    c.maybeSingle = () => Promise.resolve(result)
    c.single = () => Promise.resolve(result)
    return c
  }
  const admin = {
    from: (table: string) =>
      table === 'exam_configs'
        ? chain(config)
        : {
            insert: (row: unknown) => {
              inserted(row)
              return chain(insert)
            },
          },
  } as unknown as SupabaseClient
  return { admin, inserted }
}

describe('insertPassedSession', () => {
  it('throws on an exam config lookup error', async () => {
    const { admin } = fakeAdmin(
      { data: null, error: { message: 'boom' } },
      { data: null, error: null },
    )
    await expect(insertPassedSession(admin, C)).rejects.toThrow('exam config lookup: boom')
  })

  it('throws when no enabled exam config exists', async () => {
    const { admin } = fakeAdmin({ data: null, error: null }, { data: null, error: null })
    await expect(insertPassedSession(admin, C)).rejects.toThrow(
      'enabled exam config for subject sub-1',
    )
  })

  it('throws on an insert error', async () => {
    const { admin } = fakeAdmin(
      { data: { pass_mark: 75 }, error: null },
      { data: null, error: { message: 'denied' } },
    )
    await expect(insertPassedSession(admin, C)).rejects.toThrow('insertPassedSession: denied')
  })

  it('throws when the insert returns no row', async () => {
    const { admin } = fakeAdmin(
      { data: { pass_mark: 75 }, error: null },
      { data: null, error: null },
    )
    await expect(insertPassedSession(admin, C)).rejects.toThrow('insertPassedSession: no row')
  })

  it('inserts a passed session with the exam pass mark and returns its id', async () => {
    const { admin, inserted } = fakeAdmin(
      { data: { pass_mark: 75 }, error: null },
      { data: { id: 'sess-1' }, error: null },
    )
    await expect(insertPassedSession(admin, C)).resolves.toBe('sess-1')
    expect(inserted).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        student_id: 'u-1',
        subject_id: 'sub-1',
        passed: true,
        score_percentage: 90,
        config: { pass_mark: 75, question_ids: [] },
        ended_at: '2026-01-01T12:00:00.000Z',
      }),
    )
  })
})
