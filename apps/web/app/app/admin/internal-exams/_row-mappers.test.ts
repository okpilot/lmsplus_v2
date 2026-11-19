import { describe, expect, it } from 'vitest'
import { type CodeRowRaw, mapAttemptRow, mapCodeRow } from './_row-mappers'

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
  it('derives expired for an expired code of a scheduled sitting', () => {
    const r = raw({ ...scheduled(), expires_at: PAST })
    expect(mapCodeRow(r, NOW).status).toBe('expired')
  })
  it('leaves legacy codes unchanged: active, expired and sittingId null', () => {
    expect(mapCodeRow(raw(), NOW)).toMatchObject({ status: 'active', sittingId: null })
    expect(mapCodeRow(raw({ expires_at: PAST }), NOW).status).toBe('expired')
  })
  it('maps sittingEntryId from the raw column', () => {
    expect(mapCodeRow(raw(scheduled('open')), NOW).sittingEntryId).toBe('e1')
    expect(mapCodeRow(raw(), NOW).sittingEntryId).toBeNull()
  })
  it('maps sittingId from the embed', () => {
    expect(mapCodeRow(raw(scheduled('open')), NOW).sittingId).toBe('sit-1')
  })
  it('maps a removed-entry voided code to Voided with its sittingId', () => {
    const r = raw({ ...scheduled('cancelled'), voided_at: PAST })
    expect(mapCodeRow(r, NOW)).toMatchObject({ status: 'voided', sittingId: 'sit-1' })
  })
})

describe('mapAttemptRow sitting fields', () => {
  const base = {
    id: 's1',
    student_id: 'u1',
    subject_id: 'sub1',
    started_at: PAST,
    ended_at: PAST,
    total_questions: 10,
    correct_count: 5,
    score_percentage: 50,
    passed: false,
    easa_subjects: null,
    users: null,
  }
  const sittingCode = {
    void_reason: null,
    exam_sitting_entries: {
      sitting_id: 'sit-9',
      exam_sittings: { scheduled_at: '2026-05-01T09:00:00.000Z' },
    },
  }

  it('maps sittingId and sittingAt from the consuming code embed', () => {
    const r = mapAttemptRow({ ...base, internal_exam_codes: [sittingCode] } as never, 0)
    expect(r).toMatchObject({ sittingId: 'sit-9', sittingAt: '2026-05-01T09:00:00.000Z' })
  })

  it('maps a legacy attempt (no sitting entry) to null sitting fields', () => {
    const legacy = [{ void_reason: null, exam_sitting_entries: null }]
    expect(mapAttemptRow({ ...base, internal_exam_codes: legacy } as never, 0)).toMatchObject({
      sittingId: null,
      sittingAt: null,
    })
    expect(mapAttemptRow({ ...base, internal_exam_codes: null } as never, 0)).toMatchObject({
      sittingId: null,
      sittingAt: null,
    })
  })

  it('picks the first code with a sitting entry while voidReason keeps the first code', () => {
    const codes = [
      { void_reason: 'first', exam_sitting_entries: null },
      { ...sittingCode, void_reason: 'second' },
    ]
    const r = mapAttemptRow({ ...base, internal_exam_codes: codes } as never, 0)
    expect(r.sittingId).toBe('sit-9')
    expect(r.voidReason).toBe('first')
  })
})
