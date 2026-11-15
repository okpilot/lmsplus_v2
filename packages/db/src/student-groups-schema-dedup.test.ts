import { describe, expect, it } from 'vitest'
import { StudentGroupMembersSchema } from './schema'

const A = '00000000-0000-4000-a000-00000000000a'
const B = '00000000-0000-4000-a000-00000000000b'
const G = '00000000-0000-4000-a000-000000000001'

describe('StudentGroupMembersSchema duplicate userIds', () => {
  it('rejects the same id twice', () => {
    expect(StudentGroupMembersSchema.safeParse({ groupId: G, userIds: [A, A] }).success).toBe(false)
  })
  it('rejects ids differing only in case', () => {
    const r = StudentGroupMembersSchema.safeParse({ groupId: G, userIds: [A, A.toUpperCase()] })
    expect(r.success).toBe(false)
  })
  it('accepts distinct ids', () => {
    expect(StudentGroupMembersSchema.safeParse({ groupId: G, userIds: [A, B] }).success).toBe(true)
  })
})
