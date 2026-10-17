/**
 * Red Team Spec — Vector IF: direct Storage API writes to the `question-images` bucket.
 * Guards: question_images_admin_insert / _update / _delete on storage.objects (latest def
 * mig 20261017000250): bucket_id = 'question-images' AND is_admin() AND first path segment =
 * caller's organization_id. Attacks: a student writes in their own org folder; an admin writes
 * in another org's folder; a student / cross-org admin deletes or overwrites an in-org object.
 * CONTROL: the in-org admin's upload, overwrite and delete each take effect.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_IF_MARKER as MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const BUCKET = 'question-images'
const ORIGINAL = 'original-bytes'
const FORGED = 'forged-bytes'

test.describe('Red Team: question-images storage write policies (IF)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let student: SupabaseClient
  let orgAdmin: SupabaseClient
  let crossOrgAdmin: SupabaseClient
  let orgId: string
  let otherOrgId: string
  const paths = new Set<string>()

  const newPath = (folder: string) => {
    const path = `${folder}/${MARKER}${crypto.randomUUID()}.png`
    paths.add(path)
    return path
  }

  const body = (text: string) => new Blob([text], { type: 'image/png' })

  const upload = (client: SupabaseClient, path: string, text: string, upsert = false) =>
    client.storage.from(BUCKET).upload(path, body(text), { contentType: 'image/png', upsert })

  const exists = async (path: string) => {
    const [folder, name] = path.split('/')
    const { data, error } = await admin.storage.from(BUCKET).list(folder, { search: name })
    if (error) throw new Error(`list ${path}: ${error.message}`)
    return (data ?? []).some((o) => o.name === name)
  }

  const content = async (path: string) => {
    const { data, error } = await admin.storage.from(BUCKET).download(path)
    if (error || !data) throw new Error(`download ${path}: ${error?.message}`)
    return data.text()
  }

  const seedObject = async (folder: string) => {
    const path = newPath(folder)
    const { error } = await upload(admin, path, ORIGINAL)
    if (error) throw new Error(`seed ${path}: ${error.message}`)
    expect(await exists(path)).toBe(true)
    return path
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    ;({ orgId, otherOrgId } = await seedRedTeamUsers())
    const orgAdminCreds = await seedRedTeamAdmin()
    const crossCreds = await seedCrossOrgAdmin()
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    orgAdmin = await createAuthenticatedClient(orgAdminCreds.email, orgAdminCreds.password)
    crossOrgAdmin = await createAuthenticatedClient(crossCreds.email, crossCreds.password)
    expect(orgId).not.toBe(otherOrgId)
  })

  test.afterEach(async () => {
    try {
      if (paths.size === 0) return
      const { data, error } = await admin.storage.from(BUCKET).remove([...paths])
      if (error) throw new Error(`afterEach: remove: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.log(`[IF cleanup] removed ${data?.length} object(s)`)
    } finally {
      paths.clear()
    }
  })

  test('an in-org admin can upload into their own org folder (control)', async () => {
    const path = newPath(orgId)
    const { error } = await upload(orgAdmin, path, ORIGINAL)
    expect(error).toBeNull()
    expect(await exists(path)).toBe(true)
  })

  test('a student can read an in-org object (control)', async () => {
    const path = await seedObject(orgId)
    const { data, error } = await student.storage.from(BUCKET).download(path)
    expect(error).toBeNull()
    expect(await data?.text()).toBe(ORIGINAL)
  })

  test('a student cannot upload into their own org folder', async () => {
    const path = newPath(orgId)
    const { error } = await upload(student, path, FORGED)
    expect(error).not.toBeNull()
    expect(await exists(path)).toBe(false)
  })

  test("an admin cannot upload into another org's folder", async () => {
    const path = newPath(otherOrgId)
    const { error } = await upload(orgAdmin, path, FORGED)
    expect(error).not.toBeNull()
    expect(await exists(path)).toBe(false)
  })

  test('a student and a cross-org admin cannot delete an in-org object; the in-org admin can', async () => {
    const path = await seedObject(orgId)

    await student.storage.from(BUCKET).remove([path])
    expect(await exists(path)).toBe(true)

    await crossOrgAdmin.storage.from(BUCKET).remove([path])
    expect(await exists(path)).toBe(true)

    const { error } = await orgAdmin.storage.from(BUCKET).remove([path])
    expect(error).toBeNull()
    expect(await exists(path)).toBe(false)
  })

  test('a student and a cross-org admin cannot overwrite an in-org object; the in-org admin can', async () => {
    const path = await seedObject(orgId)
    expect(await content(path)).toBe(ORIGINAL)

    const studentWrite = await upload(student, path, FORGED, true)
    expect(studentWrite.error).not.toBeNull()
    expect(await content(path)).toBe(ORIGINAL)

    const crossWrite = await upload(crossOrgAdmin, path, FORGED, true)
    expect(crossWrite.error).not.toBeNull()
    expect(await content(path)).toBe(ORIGINAL)

    const adminWrite = await upload(orgAdmin, path, FORGED, true)
    expect(adminWrite.error).toBeNull()
    expect(await content(path)).toBe(FORGED)
  })
})
