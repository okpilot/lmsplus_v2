// App-layer integration tier (#925) — the service-role `users` name read behind the Add exams popup.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
} from '@/lib/integration-support/harness'
import { readUserNames } from './people-lookup'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'

let orgId: string
let otherOrgId: string
let activeId: string
let deactivatedId: string
let noNameId: string
let foreignId: string

describe('readUserNames (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-pl ${suffix}`, slug: `int-pl-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `int-pl-b ${suffix}`,
      slug: `int-pl-b-${suffix}`,
    })
    const mk = (o: string, tag: string, fullName: string) =>
      createTestUser({
        admin,
        orgId: o,
        email: `int-pl-${tag}-${suffix}@test.local`,
        password,
        role: 'student',
        fullName,
      })
    activeId = await mk(orgId, 'a', 'Pl Active')
    deactivatedId = await mk(orgId, 'd', 'Pl Deactivated')
    noNameId = await mk(orgId, 'n', 'x')
    foreignId = await mk(otherOrgId, 'f', 'Pl Foreign')
    await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deactivatedId)
    await admin.from('users').update({ full_name: null }).eq('id', noNameId)
  }, 60_000)

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds: [activeId, deactivatedId, noNameId] })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: [foreignId] })
  }, 60_000)

  it('resolves names of active and deactivated people of the organization', async () => {
    const names = await readUserNames(orgId, [activeId, deactivatedId])
    expect(names.get(activeId)).toBe('Pl Active')
    expect(names.get(deactivatedId)).toBe('Pl Deactivated')
  })

  it('leaves out ids of another organization', async () => {
    const names = await readUserNames(orgId, [activeId, foreignId])
    expect(names.has(activeId)).toBe(true)
    expect(names.has(foreignId)).toBe(false)
    expect((await readUserNames(otherOrgId, [foreignId])).get(foreignId)).toBe('Pl Foreign')
  })

  it('falls back to the email when the person has no full name', async () => {
    const names = await readUserNames(orgId, [noNameId])
    expect(names.get(noNameId)).toBe(`int-pl-n-${suffix}@test.local`)
  })

  it('returns an empty map for no ids', async () => {
    expect((await readUserNames(orgId, [])).size).toBe(0)
  })
})
