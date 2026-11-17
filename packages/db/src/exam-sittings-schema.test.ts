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
  it('rejects permittedMaterials of 1001 chars and accepts 1000', () => {
    expect(
      parse('CreateExamSittingSchema', { ...create, permittedMaterials: 'x'.repeat(1001) }).success,
    ).toBe(false)
    expect(
      parse('CreateExamSittingSchema', { ...create, permittedMaterials: 'x'.repeat(1000) }).success,
    ).toBe(true)
  })
  it('trims permittedMaterials before the length check', () => {
    const r = parse('CreateExamSittingSchema', {
      ...create,
      permittedMaterials: `  ${'x'.repeat(1000)}  `,
    })
    expect(r.success).toBe(true)
    expect(r.data?.permittedMaterials).toBe('x'.repeat(1000))
  })
  it('rejects an unknown mode', () => {
    expect(parse('CreateExamSittingSchema', { ...create, mode: 'x' }).success).toBe(false)
  })
})

describe('AC-55 UpdateExamSittingSchema', () => {
  it('accepts an empty permittedMaterials (clear) and rejects 1001 chars', () => {
    expect(
      parse('UpdateExamSittingSchema', { sittingId: SID, permittedMaterials: '' }).success,
    ).toBe(true)
    expect(
      parse('UpdateExamSittingSchema', { sittingId: SID, permittedMaterials: 'x'.repeat(1001) })
        .success,
    ).toBe(false)
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
