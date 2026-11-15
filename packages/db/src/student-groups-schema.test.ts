import { describe, expect, it } from 'vitest'
import * as schema from './schema'

const ID = '00000000-0000-4000-a000-000000000001'

function parser(name: string) {
  const s = (schema as Record<string, unknown>)[name] as
    | { safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> } }
    | undefined
  expect(s, `${name} exported from schema.ts`).toBeDefined()
  return (s as NonNullable<typeof s>).safeParse
}

describe('CreateStudentGroupSchema', () => {
  it('AC7: trims the name and accepts an omitted description', () => {
    const r = parser('CreateStudentGroupSchema')({ name: '  Cohort A  ' })
    expect(r.success).toBe(true)
    expect(r.data?.name).toBe('Cohort A')
  })
  it('AC7: rejects an empty or whitespace-only name', () => {
    const p = parser('CreateStudentGroupSchema')
    expect(p({ name: '' }).success).toBe(false)
    expect(p({ name: '   ' }).success).toBe(false)
  })
  it('AC7: name max 80 chars', () => {
    const p = parser('CreateStudentGroupSchema')
    expect(p({ name: 'a'.repeat(80) }).success).toBe(true)
    expect(p({ name: 'a'.repeat(81) }).success).toBe(false)
  })
  it('AC7: description max 500 chars', () => {
    const p = parser('CreateStudentGroupSchema')
    expect(p({ name: 'x', description: 'a'.repeat(500) }).success).toBe(true)
    expect(p({ name: 'x', description: 'a'.repeat(501) }).success).toBe(false)
  })
})

describe('UpdateStudentGroupSchema', () => {
  it('AC7: requires a uuid groupId plus the create fields', () => {
    const p = parser('UpdateStudentGroupSchema')
    expect(p({ groupId: ID, name: ' New ' }).data?.name).toBe('New')
    expect(p({ groupId: 'nope', name: 'New' }).success).toBe(false)
    expect(p({ name: 'New' }).success).toBe(false)
    expect(p({ groupId: ID, name: 'a'.repeat(81) }).success).toBe(false)
  })
})

describe('DeleteStudentGroupSchema', () => {
  it('AC7: requires a uuid groupId', () => {
    const p = parser('DeleteStudentGroupSchema')
    expect(p({ groupId: ID }).success).toBe(true)
    expect(p({ groupId: 'nope' }).success).toBe(false)
    expect(p({}).success).toBe(false)
  })
})

describe('StudentGroupMembersSchema', () => {
  it('AC7: userIds must hold 1..500 uuids', () => {
    const p = parser('StudentGroupMembersSchema')
    const ids = (n: number) =>
      Array.from({ length: n }, (_, i) => `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`)
    expect(p({ groupId: ID, userIds: ids(1) }).success).toBe(true)
    expect(p({ groupId: ID, userIds: ids(500) }).success).toBe(true)
    expect(p({ groupId: ID, userIds: [] }).success).toBe(false)
    expect(p({ groupId: ID, userIds: ids(501) }).success).toBe(false)
    expect(p({ groupId: ID, userIds: ['nope'] }).success).toBe(false)
    expect(p({ userIds: ids(1) }).success).toBe(false)
  })
})
