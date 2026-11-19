import { describe, expect, it } from 'vitest'
import { type CodeRowRaw, mapCodeRow } from './_row-mappers'

const NOW = new Date('2026-04-28T12:00:00.000Z').getTime()
const FUTURE = '2026-04-29T12:00:00.000Z'
const PAST = '2026-04-27T12:00:00.000Z'

function raw(over: Record<string, unknown> = {}): CodeRowRaw {
  return {
    id: 'c1',
    code: 'ABCD2345',
    subject_id: 's1',
    student_id: 'u1',
    issued_by: 'a1',
    issued_at: PAST,
    expires_at: FUTURE,
    consumed_at: null,
    consumed_session_id: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    emailed_at: null,
    easa_subjects: { name: 'Air Law' },
    users: { full_name: 'Alice', email: 'a@x.test' },
    quiz_sessions: null,
    sitting_entry_id: null,
    exam_sitting_entries: null,
    ...over,
  } as CodeRowRaw
}

const scheduled = (status = 'scheduled') => ({
  sitting_entry_id: 'e1',
  exam_sitting_entries: { sitting_id: 'sit-1', exam_sittings: { status } },
})

describe('mapCodeRow sitting awareness', () => {
  it('derives waiting for an unconsumed code of a scheduled sitting', () => {
    expect(mapCodeRow(raw(scheduled()), NOW).status).toBe('waiting')
  })
  it('derives active for an unconsumed code of an open sitting', () => {
    expect(mapCodeRow(raw(scheduled('open')), NOW).status).toBe('active')
  })
  it('lets voided win over waiting', () => {
    const r = raw({ ...scheduled(), voided_at: PAST })
    expect(mapCodeRow(r, NOW).status).toBe('voided')
  })
  it('lets consumed win over waiting', () => {
    const r = raw({ ...scheduled(), consumed_at: PAST })
    expect(mapCodeRow(r, NOW).status).toBe('consumed')
  })
  it('lets waiting win over expired', () => {
    const r = raw({ ...scheduled(), expires_at: PAST })
    expect(mapCodeRow(r, NOW).status).toBe('waiting')
  })
  it('leaves legacy codes unchanged: active, expired and sittingId null', () => {
    expect(mapCodeRow(raw(), NOW)).toMatchObject({ status: 'active', sittingId: null })
    expect(mapCodeRow(raw({ expires_at: PAST }), NOW).status).toBe('expired')
  })
  it('maps sittingId from the embed', () => {
    expect(mapCodeRow(raw(scheduled('open')), NOW).sittingId).toBe('sit-1')
  })
  it('maps a removed-entry voided code to Voided with its sittingId', () => {
    const r = raw({ ...scheduled('cancelled'), voided_at: PAST })
    expect(mapCodeRow(r, NOW)).toMatchObject({ status: 'voided', sittingId: 'sit-1' })
  })
})
