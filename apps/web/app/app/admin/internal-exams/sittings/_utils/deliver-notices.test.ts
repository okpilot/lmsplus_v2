import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRpc = vi.hoisted(() => vi.fn())
const mockSendBatch = vi.hoisted(() => vi.fn())
const mockRecipients = vi.hoisted(() => vi.fn())
const mockSubjects = vi.hoisted(() => vi.fn())
const mockSitting = vi.hoisted(() => vi.fn())
const mockDeliverable = vi.hoisted(() => vi.fn())

vi.mock('@/lib/email/resend', () => ({ sendEmailBatch: mockSendBatch }))
vi.mock('../../notice-queries', () => ({
  getNoticeRecipients: mockRecipients,
  getSubjectNames: mockSubjects,
  getSittingForNotice: mockSitting,
  getDeliverablePendingNotices: mockDeliverable,
}))

import { deliverNotices, deliverPendingNotices, groupNotices } from './deliver-notices'

const SID = '00000000-0000-4000-a000-0000000000a1'
const SUPABASE = { rpc: mockRpc }
const SITTING = { scheduledAt: '2999-11-24T09:00:00.000Z', mode: 'remote' as const }
const BASE = { supabase: SUPABASE as never, orgId: 'org-1', sittingId: SID, sitting: SITTING }

const person = (n: number) =>
  [`u${n}`, { name: `Student ${n}`, email: `s${n}@example.com` }] as const
const cancelled = (code: string, user: string, subject: string, entry = `e-${code}`) => ({
  kind: 'sitting_cancelled' as const,
  codeId: code,
  entryId: entry,
  userId: user,
  subjectId: subject,
})
const removed = (entry: string, user: string, subject: string) => ({
  kind: 'entry_auto_removed' as const,
  entryId: entry,
  userId: user,
  subjectId: subject,
  passedAt: '2026-11-20T08:15:00.000Z',
})

type Msg = { to: string; subject: string; html: string; text: string }
const sentMsgs = () => mockSendBatch.mock.calls[0]?.[0] as Msg[]
const recordCalls = () =>
  mockRpc.mock.calls.filter((c) => c[0] === 'record_exam_sitting_notice') as [
    string,
    Record<string, unknown>,
  ][]

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
  mockRpc.mockResolvedValue({ data: null, error: null })
  mockRecipients.mockResolvedValue(new Map([person(1), person(2)]))
  mockSubjects.mockResolvedValue(
    new Map([
      ['s1', 'Meteorology'],
      ['s2', 'Navigation'],
    ]),
  )
  mockSendBatch.mockImplementation(async (msgs: unknown[]) => ({
    sent: msgs.map((_, i) => i),
    failed: [],
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

describe('groupNotices', () => {
  it('groups sitting_cancelled items into one email per student carrying all their code ids', () => {
    const groups = groupNotices([
      cancelled('c1', 'u1', 's1'),
      cancelled('c2', 'u1', 's2'),
      cancelled('c3', 'u2', 's1'),
    ])
    expect(groups).toHaveLength(2)
  })

  it('gives entry_auto_removed one group per entry, even for the same student', () => {
    const groups = groupNotices([removed('e1', 'u1', 's1'), removed('e2', 'u1', 's2')])
    expect(groups).toHaveLength(2)
  })
})

describe('deliverNotices', () => {
  it('sends one cancellation email per student with the subject list, to the recipient email', async () => {
    const r = await deliverNotices({
      ...BASE,
      kind: 'sitting_cancelled',
      items: [
        cancelled('c1', 'u1', 's1'),
        cancelled('c2', 'u1', 's2'),
        cancelled('c3', 'u2', 's1'),
      ],
    })
    const msgs = sentMsgs()
    expect(msgs.map((m) => m.to)).toEqual(['s1@example.com', 's2@example.com'])
    expect(msgs[0]?.text).toContain('Meteorology')
    expect(msgs[0]?.text).toContain('Navigation')
    expect(msgs[0]?.subject).toMatch(/^Cancelled: your internal exam sitting on /)
    expect(r).toMatchObject({ sent: 2, failed: [], skipped: 0, unrecorded: 0 })
  })

  it('records each sent cancellation email with exactly the code ids it covers', async () => {
    await deliverNotices({
      ...BASE,
      kind: 'sitting_cancelled',
      items: [
        cancelled('c1', 'u1', 's1'),
        cancelled('c2', 'u1', 's2'),
        cancelled('c3', 'u2', 's1'),
      ],
    })
    const calls = recordCalls()
    expect(calls).toHaveLength(2)
    expect(calls[0]?.[1]).toMatchObject({
      p_sitting_id: SID,
      p_kind: 'sitting_cancelled',
    })
    expect([...((calls[0]?.[1].p_code_ids ?? []) as string[])].sort()).toEqual(['c1', 'c2'])
    expect(calls[1]?.[1].p_code_ids).toEqual(['c3'])
  })

  it('sends one removal email per entry and records the entry id', async () => {
    await deliverNotices({
      ...BASE,
      kind: 'entry_auto_removed',
      items: [removed('e1', 'u1', 's1'), removed('e2', 'u1', 's2')],
    })
    const msgs = sentMsgs()
    expect(msgs).toHaveLength(2)
    expect(msgs[0]?.subject).toBe('Removed from internal exam sitting: Meteorology')
    expect(msgs[1]?.subject).toBe('Removed from internal exam sitting: Navigation')
    const calls = recordCalls()
    expect(calls.map((c) => c[1].p_entry_ids)).toEqual([['e1'], ['e2']])
    expect(calls.every((c) => c[1].p_kind === 'entry_auto_removed')).toBe(true)
  })

  it('records only the emails that were sent and lists the failed students', async () => {
    mockSendBatch.mockResolvedValue({ sent: [0], failed: [{ index: 1, error: 'bad' }] })
    const r = await deliverNotices({
      ...BASE,
      kind: 'sitting_cancelled',
      items: [cancelled('c1', 'u1', 's1'), cancelled('c3', 'u2', 's1')],
    })
    expect(r).toMatchObject({ sent: 1, failed: [{ studentName: 'Student 2' }], unrecorded: 0 })
    const calls = recordCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[1].p_code_ids).toEqual(['c1'])
  })

  it('counts a record failure as unrecorded and does not throw', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await deliverNotices({
      ...BASE,
      kind: 'sitting_cancelled',
      items: [cancelled('c1', 'u1', 's1')],
    })
    expect(r).toMatchObject({ sent: 1, unrecorded: 1 })
    expect(console.error).toHaveBeenCalledWith(
      '[deliverNotices] record failed',
      expect.objectContaining({ kind: 'sitting_cancelled' }),
      'boom',
    )
  })

  it('logs a record failure when the rpc rejects', async () => {
    mockRpc.mockRejectedValue(new Error('net'))
    const r = await deliverNotices({
      ...BASE,
      kind: 'sitting_cancelled',
      items: [cancelled('c1', 'u1', 's1')],
    })
    expect(r).toMatchObject({ unrecorded: 1 })
    expect(console.error).toHaveBeenCalledWith(
      '[deliverNotices] record failed',
      expect.objectContaining({ ids: ['c1'] }),
      'net',
    )
  })

  it('skips a student with no deliverable recipient: not sent, not recorded', async () => {
    mockRecipients.mockResolvedValue(new Map([person(1)]))
    const r = await deliverNotices({
      ...BASE,
      kind: 'sitting_cancelled',
      items: [cancelled('c1', 'u1', 's1'), cancelled('c3', 'u2', 's1')],
    })
    expect(sentMsgs().map((m) => m.to)).toEqual(['s1@example.com'])
    expect(r.skipped).toBe(1)
    expect(recordCalls()).toHaveLength(1)
    expect(recordCalls()[0]?.[1].p_code_ids).toEqual(['c1'])
  })

  it('reads recipients with the organization id', async () => {
    await deliverNotices({
      ...BASE,
      kind: 'sitting_cancelled',
      items: [cancelled('c1', 'u1', 's1')],
    })
    expect(mockRecipients).toHaveBeenCalledWith('org-1', ['u1'])
  })

  it('sends a change notice per student, records the code ids and shows the old and new time', async () => {
    const r = await deliverNotices({
      ...BASE,
      kind: 'changed',
      sitting: {
        scheduledAt: '2999-11-25T13:30:00.000Z',
        mode: 'remote',
        oldScheduledAt: '2999-11-24T09:00:00.000Z',
        oldMode: 'remote',
      } as never,
      items: [
        { codeId: 'c1', userId: 'u1', subjectId: 's1' },
        { codeId: 'c2', userId: 'u1', subjectId: 's2' },
      ] as never,
    })
    expect(sentMsgs()).toHaveLength(1)
    expect(sentMsgs()[0]?.text).toContain('13:30 UTC')
    expect(sentMsgs()[0]?.text).toContain('09:00 UTC')
    expect(r.sent).toBe(1)
    const calls = recordCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[1]).toMatchObject({ p_kind: 'changed' })
    expect([...((calls[0]?.[1].p_code_ids ?? []) as string[])].sort()).toEqual(['c1', 'c2'])
  })

  it.each([
    ['sitting_cancelled', [cancelled('c1', 'u1', 's1')]],
    ['entry_auto_removed', [removed('e1', 'u1', 's1')]],
  ] as const)(
    'still sends a %s notice when NEXT_PUBLIC_APP_URL is missing',
    async (kind, items) => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
      const r = await deliverNotices({ ...BASE, kind, items: items as never })
      expect(mockSendBatch).toHaveBeenCalledTimes(1)
      expect(r.sent).toBe(1)
      expect(r.error).toBeUndefined()
    },
  )

  it('returns error without sending a change notice when NEXT_PUBLIC_APP_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    const r = await deliverNotices({
      ...BASE,
      kind: 'changed',
      sitting: { ...SITTING, oldScheduledAt: SITTING.scheduledAt, oldMode: 'remote' } as never,
      items: [{ codeId: 'c1', userId: 'u1', subjectId: 's1' }] as never,
    })
    expect(mockSendBatch).not.toHaveBeenCalled()
    expect(recordCalls()).toHaveLength(0)
    expect(r).toMatchObject({ sent: 0, error: true })
  })

  it('returns error when a read throws', async () => {
    mockRecipients.mockRejectedValue(new Error('db down'))
    const r = await deliverNotices({
      ...BASE,
      kind: 'sitting_cancelled',
      items: [cancelled('c1', 'u1', 's1')],
    })
    expect(r).toMatchObject({ sent: 0, error: true })
  })

  it('never throws when the send throws', async () => {
    mockSendBatch.mockRejectedValue(new Error('network'))
    await expect(
      deliverNotices({
        ...BASE,
        kind: 'sitting_cancelled',
        items: [cancelled('c1', 'u1', 's1')],
      }),
    ).resolves.toMatchObject({ sent: 0 })
    expect(recordCalls()).toHaveLength(0)
  })
})

describe('deliverPendingNotices', () => {
  beforeEach(() => {
    mockSitting.mockResolvedValue({ scheduledAt: SITTING.scheduledAt, mode: 'remote' })
  })

  it('reads the deliverable pending notices for the org and sitting and sends each kind', async () => {
    mockDeliverable.mockResolvedValue([cancelled('c1', 'u1', 's1'), removed('e2', 'u2', 's2')])
    const r = await deliverPendingNotices({
      supabase: SUPABASE as never,
      orgId: 'org-1',
      sittingId: SID,
    })
    expect(mockDeliverable).toHaveBeenCalledWith(SUPABASE, 'org-1', SID)
    expect(mockSendBatch).toHaveBeenCalledTimes(2)
    expect(r.sent).toBe(2)
  })

  it('sends nothing and records nothing when no notice is pending', async () => {
    mockDeliverable.mockResolvedValue([])
    const r = await deliverPendingNotices({
      supabase: SUPABASE as never,
      orgId: 'org-1',
      sittingId: SID,
    })
    expect(mockSendBatch).not.toHaveBeenCalled()
    expect(recordCalls()).toHaveLength(0)
    expect(r).toMatchObject({ sent: 0, failed: [] })
  })

  it('returns error and sends nothing when the sitting is not found', async () => {
    mockSitting.mockResolvedValue(null)
    mockDeliverable.mockResolvedValue([cancelled('c1', 'u1', 's1')])
    const r = await deliverPendingNotices({
      supabase: SUPABASE as never,
      orgId: 'org-1',
      sittingId: SID,
    })
    expect(mockSendBatch).not.toHaveBeenCalled()
    expect(r).toMatchObject({ sent: 0, error: true })
  })

  it('sends cancellation and removal notices without NEXT_PUBLIC_APP_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    mockDeliverable.mockResolvedValue([cancelled('c1', 'u1', 's1'), removed('e2', 'u2', 's2')])
    const r = await deliverPendingNotices({
      supabase: SUPABASE as never,
      orgId: 'org-1',
      sittingId: SID,
    })
    expect(r.sent).toBe(2)
    expect(r.error).toBeUndefined()
  })

  it('returns error when the pending read throws', async () => {
    mockDeliverable.mockRejectedValue(new Error('db down'))
    const r = await deliverPendingNotices({
      supabase: SUPABASE as never,
      orgId: 'org-1',
      sittingId: SID,
    })
    expect(r).toMatchObject({ sent: 0, error: true })
  })

  it('counts the sent notices and flags error when one kind throws', async () => {
    mockDeliverable.mockResolvedValue([cancelled('c1', 'u1', 's1'), removed('e2', 'u2', 's2')])
    mockRecipients
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(new Map([person(2)]))
    const r = await deliverPendingNotices({
      supabase: SUPABASE as never,
      orgId: 'org-1',
      sittingId: SID,
    })
    expect(r).toMatchObject({ sent: 1, error: true })
  })
})
