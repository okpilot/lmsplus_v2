import { describe, expect, it } from 'vitest'
import * as schema from './schema'

const uid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`
const SID = uid(1)
const ids = (n: number, from = 100) => Array.from({ length: n }, (_, i) => uid(from + i))

function parse(name: string, value: unknown) {
  const s = (schema as Record<string, unknown>)[name] as
    | { safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> } }
    | undefined
  expect(s, `${name} exported from schema.ts`).toBeDefined()
  return (s as NonNullable<typeof s>).safeParse(value)
}

const create = {
  scheduledAt: '2026-11-17T09:00:00Z',
  mode: 'remote',
  invigilatorId: uid(2),
}

describe('AC-55 CreateExamSittingSchema', () => {
  it('rejects a scheduledAt without an offset and accepts Z and +02:00', () => {
    expect(
      parse('CreateExamSittingSchema', { ...create, scheduledAt: '2026-11-17T09:00:00' }).success,
    ).toBe(false)
    expect(parse('CreateExamSittingSchema', create).success).toBe(true)
    expect(
      parse('CreateExamSittingSchema', { ...create, scheduledAt: '2026-11-17T09:00:00+02:00' })
        .success,
    ).toBe(true)
  })
  it('strips an extra permittedMaterials key', () => {
    const r = parse('CreateExamSittingSchema', { ...create, permittedMaterials: 'Calculator' })
    expect(r.success).toBe(true)
    expect(r.data).not.toHaveProperty('permittedMaterials')
  })
  it('rejects an unknown mode', () => {
    expect(parse('CreateExamSittingSchema', { ...create, mode: 'x' }).success).toBe(false)
  })
})

describe('AC-55 UpdateExamSittingSchema', () => {
  it('strips an extra permittedMaterials key', () => {
    const r = parse('UpdateExamSittingSchema', { sittingId: SID, permittedMaterials: 'x' })
    expect(r.success).toBe(true)
    expect(r.data).not.toHaveProperty('permittedMaterials')
  })
  it('rejects a scheduledAt without an offset', () => {
    expect(
      parse('UpdateExamSittingSchema', { sittingId: SID, scheduledAt: '2026-11-17T09:00:00' })
        .success,
    ).toBe(false)
  })
})

describe('AC-55 ExamSittingIdSchema', () => {
  it('requires a uuid sittingId', () => {
    expect(parse('ExamSittingIdSchema', { sittingId: SID }).success).toBe(true)
    expect(parse('ExamSittingIdSchema', { sittingId: 'nope' }).success).toBe(false)
  })
})

describe('AC-55 AddSittingCandidatesSchema', () => {
  it('rejects duplicate uuids, also differing in case', () => {
    expect(
      parse('AddSittingCandidatesSchema', { sittingId: SID, userIds: [uid(5), uid(5)] }).success,
    ).toBe(false)
    expect(
      parse('AddSittingCandidatesSchema', {
        sittingId: SID,
        userIds: [uid(10), uid(10).toUpperCase()],
      }).success,
    ).toBe(false)
  })
  it('accepts 500 users and rejects 501', () => {
    expect(parse('AddSittingCandidatesSchema', { sittingId: SID, userIds: ids(500) }).success).toBe(
      true,
    )
    expect(parse('AddSittingCandidatesSchema', { sittingId: SID, userIds: ids(501) }).success).toBe(
      false,
    )
  })
  it('accepts 50 groups and rejects 51', () => {
    expect(
      parse('AddSittingCandidatesSchema', { sittingId: SID, groupIds: ids(50, 1000) }).success,
    ).toBe(true)
    expect(
      parse('AddSittingCandidatesSchema', { sittingId: SID, groupIds: ids(51, 1000) }).success,
    ).toBe(false)
  })
  it('rejects both arrays empty or omitted', () => {
    expect(
      parse('AddSittingCandidatesSchema', { sittingId: SID, userIds: [], groupIds: [] }).success,
    ).toBe(false)
    expect(parse('AddSittingCandidatesSchema', { sittingId: SID }).success).toBe(false)
  })
  it('defaults the omitted array to empty', () => {
    const r = parse('AddSittingCandidatesSchema', { sittingId: SID, groupIds: [uid(9)] })
    expect(r.success).toBe(true)
    expect(r.data?.userIds).toEqual([])
  })
})

describe('AC-55 RemoveSittingCandidatesSchema', () => {
  it('requires 1..500 users', () => {
    expect(
      parse('RemoveSittingCandidatesSchema', { sittingId: SID, userIds: ids(500) }).success,
    ).toBe(true)
    expect(
      parse('RemoveSittingCandidatesSchema', { sittingId: SID, userIds: ids(501) }).success,
    ).toBe(false)
    expect(parse('RemoveSittingCandidatesSchema', { sittingId: SID, userIds: [] }).success).toBe(
      false,
    )
  })
})

describe('AC-55 RemoveSittingEntriesSchema', () => {
  it('requires 1..2000 entries', () => {
    expect(
      parse('RemoveSittingEntriesSchema', { sittingId: SID, entryIds: ids(2000) }).success,
    ).toBe(true)
    expect(
      parse('RemoveSittingEntriesSchema', { sittingId: SID, entryIds: ids(2001) }).success,
    ).toBe(false)
    expect(parse('RemoveSittingEntriesSchema', { sittingId: SID, entryIds: [] }).success).toBe(
      false,
    )
  })
})

describe('AC-55 SittingPeopleQuerySchema', () => {
  it('trims q and caps it at 100', () => {
    const ok = parse('SittingPeopleQuerySchema', { sittingId: SID, q: `  ${'a'.repeat(100)}  ` })
    expect(ok.success).toBe(true)
    expect(ok.data?.q).toBe('a'.repeat(100))
    expect(parse('SittingPeopleQuerySchema', { sittingId: SID, q: 'a'.repeat(101) }).success).toBe(
      false,
    )
  })
  it('allow-lists status', () => {
    expect(parse('SittingPeopleQuerySchema', { sittingId: SID, status: 'active' }).success).toBe(
      true,
    )
    expect(parse('SittingPeopleQuerySchema', { sittingId: SID, status: 'inactive' }).success).toBe(
      true,
    )
    expect(parse('SittingPeopleQuerySchema', { sittingId: SID, status: 'x' }).success).toBe(false)
  })
  it('requires an integer page >= 1', () => {
    expect(parse('SittingPeopleQuerySchema', { sittingId: SID, page: 1 }).success).toBe(true)
    expect(parse('SittingPeopleQuerySchema', { sittingId: SID, page: 0 }).success).toBe(false)
    expect(parse('SittingPeopleQuerySchema', { sittingId: SID, page: 1.5 }).success).toBe(false)
  })
})

describe('AC-65 AddSittingEntriesSchema', () => {
  const pairs = (n: number) => ({
    userIds: Array.from({ length: n }, (_, i) => uid(1000 + (i % 500))),
    subjectIds: Array.from({ length: n }, (_, i) => uid(5000 + Math.floor(i / 500))),
  })
  it('accepts equal-length arrays of up to 1000 distinct pairs', () => {
    expect(
      parse('AddSittingEntriesSchema', {
        sittingId: SID,
        userIds: [uid(10), uid(10)],
        subjectIds: [uid(20), uid(21)],
      }).success,
    ).toBe(true)
    expect(parse('AddSittingEntriesSchema', { sittingId: SID, ...pairs(1000) }).success).toBe(true)
  })
  it('rejects unequal lengths and empty arrays', () => {
    expect(
      parse('AddSittingEntriesSchema', {
        sittingId: SID,
        userIds: [uid(10), uid(11)],
        subjectIds: [uid(20)],
      }).success,
    ).toBe(false)
    expect(
      parse('AddSittingEntriesSchema', { sittingId: SID, userIds: [], subjectIds: [] }).success,
    ).toBe(false)
  })
  it('rejects a duplicate pair whose uuids differ only in case', () => {
    expect(
      parse('AddSittingEntriesSchema', {
        sittingId: SID,
        userIds: [uid(10), uid(10).toUpperCase()],
        subjectIds: [uid(20).toUpperCase(), uid(20)],
      }).success,
    ).toBe(false)
  })
  it('rejects 1001 pairs, duplicate pairs and non-uuid ids', () => {
    expect(parse('AddSittingEntriesSchema', { sittingId: SID, ...pairs(1001) }).success).toBe(false)
    expect(
      parse('AddSittingEntriesSchema', {
        sittingId: SID,
        userIds: [uid(10), uid(10)],
        subjectIds: [uid(20), uid(20)],
      }).success,
    ).toBe(false)
    expect(
      parse('AddSittingEntriesSchema', { sittingId: SID, userIds: ['x'], subjectIds: [uid(20)] })
        .success,
    ).toBe(false)
    expect(
      parse('AddSittingEntriesSchema', { sittingId: SID, userIds: [uid(10)], subjectIds: ['x'] })
        .success,
    ).toBe(false)
  })
})

describe('AC-66 IssueSittingCodesSchema', () => {
  it('accepts omitted userIds and entryIds', () => {
    expect(parse('IssueSittingCodesSchema', { sittingId: SID }).success).toBe(true)
  })
  it('accepts 1..500 ids and rejects empty, 501 and duplicates', () => {
    for (const key of ['userIds', 'entryIds']) {
      expect(parse('IssueSittingCodesSchema', { sittingId: SID, [key]: ids(500) }).success).toBe(
        true,
      )
      expect(parse('IssueSittingCodesSchema', { sittingId: SID, [key]: [] }).success).toBe(false)
      expect(parse('IssueSittingCodesSchema', { sittingId: SID, [key]: ids(501) }).success).toBe(
        false,
      )
      expect(
        parse('IssueSittingCodesSchema', { sittingId: SID, [key]: [uid(7), uid(7)] }).success,
      ).toBe(false)
    }
  })
})

describe('VoidSittingCodeSchema', () => {
  const ok = { sittingId: SID, codeId: uid(2), reason: 'lost' }
  it('accepts a valid input and trims the reason', () => {
    const r = parse('VoidSittingCodeSchema', { ...ok, reason: '  lost  ' })
    expect(r.success).toBe(true)
    expect(r.data?.reason).toBe('lost')
  })
  it('rejects a reason that is blank after trim', () => {
    expect(parse('VoidSittingCodeSchema', { ...ok, reason: '   ' }).success).toBe(false)
  })
  it('rejects a 501-character reason and accepts 500', () => {
    expect(parse('VoidSittingCodeSchema', { ...ok, reason: 'x'.repeat(501) }).success).toBe(false)
    expect(parse('VoidSittingCodeSchema', { ...ok, reason: 'x'.repeat(500) }).success).toBe(true)
  })
  it('rejects a non-uuid code id', () => {
    expect(parse('VoidSittingCodeSchema', { ...ok, codeId: 'nope' }).success).toBe(false)
  })
  it.each(schema.RESERVED_VOID_REASONS)('rejects the system token %s', (token) => {
    expect(parse('VoidSittingCodeSchema', { ...ok, reason: token }).success).toBe(false)
    expect(parse('VoidSittingCodeSchema', { ...ok, reason: `  ${token}  ` }).success).toBe(false)
  })
  it('accepts text that merely contains a system token', () => {
    expect(
      parse('VoidSittingCodeSchema', { ...ok, reason: 'not sitting_cancelled, my mistake' })
        .success,
    ).toBe(true)
  })
})

describe('AC-67 SubjectEligibilityQuerySchema', () => {
  it('accepts omitted userIds and 1..100 distinct ids', () => {
    expect(parse('SubjectEligibilityQuerySchema', { sittingId: SID }).success).toBe(true)
    expect(
      parse('SubjectEligibilityQuerySchema', { sittingId: SID, userIds: ids(100) }).success,
    ).toBe(true)
  })
  it('rejects empty, 101 and duplicate ids', () => {
    expect(parse('SubjectEligibilityQuerySchema', { sittingId: SID, userIds: [] }).success).toBe(
      false,
    )
    expect(
      parse('SubjectEligibilityQuerySchema', { sittingId: SID, userIds: ids(101) }).success,
    ).toBe(false)
    expect(
      parse('SubjectEligibilityQuerySchema', { sittingId: SID, userIds: [uid(7), uid(7)] }).success,
    ).toBe(false)
  })
})

describe('AC-68 RosterQuerySchema', () => {
  it('trims q and caps it at 100', () => {
    const ok = parse('RosterQuerySchema', { sittingId: SID, q: `  ${'a'.repeat(100)}  ` })
    expect(ok.success).toBe(true)
    expect(ok.data?.q).toBe('a'.repeat(100))
    expect(parse('RosterQuerySchema', { sittingId: SID, q: 'a'.repeat(101) }).success).toBe(false)
  })
  it('requires an integer page >= 1', () => {
    expect(parse('RosterQuerySchema', { sittingId: SID, page: 1 }).success).toBe(true)
    expect(parse('RosterQuerySchema', { sittingId: SID, page: 0 }).success).toBe(false)
    expect(parse('RosterQuerySchema', { sittingId: SID, page: 1.5 }).success).toBe(false)
  })
  it('allow-lists show (all, needs_code, not_emailed, has_attempts)', () => {
    for (const show of ['all', 'needs_code', 'not_emailed', 'has_attempts']) {
      expect(parse('RosterQuerySchema', { sittingId: SID, show }).success).toBe(true)
    }
    expect(parse('RosterQuerySchema', { sittingId: SID, show: 'x' }).success).toBe(false)
  })
})

describe('AddSittingExamsSchema (AC 57)', () => {
  const ok = { sittingId: SID, subjectIds: ids(2, 300), userIds: ids(2, 400) }
  it('accepts explicit userIds', () => {
    expect(parse('AddSittingExamsSchema', ok).success).toBe(true)
  })
  it('accepts all:true without userIds', () => {
    const { userIds: _u, ...rest } = ok
    expect(parse('AddSittingExamsSchema', { ...rest, all: true }).success).toBe(true)
  })
  it('rejects userIds together with all:true', () => {
    expect(parse('AddSittingExamsSchema', { ...ok, all: true }).success).toBe(false)
  })
  it('rejects neither userIds nor all', () => {
    const { userIds: _u, ...rest } = ok
    expect(parse('AddSittingExamsSchema', rest).success).toBe(false)
  })
  it('rejects zero subjects and 201 subjects, accepts 200', () => {
    expect(parse('AddSittingExamsSchema', { ...ok, subjectIds: [] }).success).toBe(false)
    expect(parse('AddSittingExamsSchema', { ...ok, subjectIds: ids(201, 1000) }).success).toBe(
      false,
    )
    expect(parse('AddSittingExamsSchema', { ...ok, subjectIds: ids(200, 1000) }).success).toBe(true)
  })
  it('rejects duplicate ids and non-uuids', () => {
    expect(parse('AddSittingExamsSchema', { ...ok, subjectIds: [uid(5), uid(5)] }).success).toBe(
      false,
    )
    expect(parse('AddSittingExamsSchema', { ...ok, userIds: ['nope'] }).success).toBe(false)
  })
})
