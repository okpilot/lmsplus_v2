// App-layer integration tier — setPasswordFromLink against real local Supabase.
//
// Mocks cannot prove: that GoTrue's real `hashed_token` passes the link schema,
// that a token is single-use, that a newer link voids an older one, that a
// valid token for a soft-deleted account opens no usable session, or that the
// marker clear + audit row land on the right rows.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { issueSetPasswordToken } from '@/lib/auth/recovery-code'
import { LINK_INVALID_MESSAGE, SetPasswordLinkSchema } from '@/lib/auth/set-password-link'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
} from '@/lib/integration-support/harness'
import { setPasswordFromLink } from './actions'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const oldPassword = 'test-pass-123'
const newPassword = 'brand-new-pass-456'

let orgId: string | undefined
const students: Record<
  'happy' | 'reuse' | 'rotation' | 'deleted' | 'burst',
  { id: string; email: string }
> = {
  happy: { id: '', email: `int-spl-happy-${suffix}@test.local` },
  reuse: { id: '', email: `int-spl-reuse-${suffix}@test.local` },
  rotation: { id: '', email: `int-spl-rot-${suffix}@test.local` },
  deleted: { id: '', email: `int-spl-del-${suffix}@test.local` },
  burst: { id: '', email: `int-spl-burst-${suffix}@test.local` },
}

function submit(tokenHash: string) {
  return setPasswordFromLink({
    password: newPassword,
    confirmPassword: newPassword,
    tokenHash,
    type: 'recovery',
  })
}

async function tokenFor(email: string): Promise<string> {
  const token = await issueSetPasswordToken(email)
  if (!token) throw new Error(`issueSetPasswordToken(${email}) returned null`)
  return token
}

async function setMarker(userId: string): Promise<void> {
  const { error } = await admin
    .from('users')
    .update({ temp_password_expires_at: new Date(Date.now() + 86_400_000).toISOString() })
    .eq('id', userId)
  if (error) throw new Error(`setMarker: ${error.message}`)
}

async function readMarker(userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('users')
    .select('temp_password_expires_at')
    .eq('id', userId)
    .single<{ temp_password_expires_at: string | null }>()
  if (error) throw new Error(`readMarker: ${error.message}`)
  return data.temp_password_expires_at
}

async function canSignIn(email: string, password: string): Promise<boolean> {
  try {
    await getAuthenticatedClient({ email, password })
    return true
  } catch {
    return false
  }
}

describe('setPasswordFromLink (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `spl ${suffix}`, slug: `spl-${suffix}` })
    for (const s of Object.values(students)) {
      s.id = await createTestUser({
        admin,
        orgId,
        email: s.email,
        password: oldPassword,
        role: 'student',
      })
    }
  })

  afterAll(async () => {
    if (orgId) {
      await cleanupTestData({ admin, orgId, userIds: Object.values(students).map((s) => s.id) })
    }
  })

  it('sets the password, clears the marker, audits, and lets the student sign in with it', async () => {
    const { id, email } = students.happy
    await setMarker(id)
    const token = await tokenFor(email)
    expect(await readMarker(id)).not.toBeNull()

    const result = await submit(token)

    expect(result).toEqual({ success: true, redirectTo: '/auth/login-complete' })
    expect(await canSignIn(email, newPassword)).toBe(true)
    expect(await readMarker(id)).toBeNull()
    const { data, error } = await admin
      .from('audit_events')
      .select('event_type')
      .eq('resource_id', id)
      .eq('event_type', 'user.password_changed')
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it('refuses the same link a second time', async () => {
    const { email } = students.reuse
    const token = await tokenFor(email)

    const first = await submit(token)
    const second = await submit(token)

    expect(first).toEqual({ success: true, redirectTo: '/auth/login-complete' })
    expect(second).toEqual({ success: false, error: LINK_INVALID_MESSAGE, linkInvalid: true })
  })

  it('accepts a real hashed_token through the link schema', async () => {
    const token = await tokenFor(students.rotation.email)

    expect(SetPasswordLinkSchema.safeParse({ tokenHash: token, type: 'recovery' }).success).toBe(
      true,
    )
  })

  it('voids an earlier link when a newer one is issued', async () => {
    const { email } = students.rotation
    const linkA = await tokenFor(email)
    const linkB = await tokenFor(email)

    const a = await submit(linkA)
    const b = await submit(linkB)

    expect(a).toEqual({ success: false, error: LINK_INVALID_MESSAGE, linkInvalid: true })
    expect(b.success).toBe(true)
  })

  it('opens no usable session and keeps the marker for a soft-deleted student', async () => {
    const { id, email } = students.deleted
    await setMarker(id)
    const token = await tokenFor(email)
    const { error } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(`soft-delete: ${error.message}`)

    const result = await submit(token)

    expect(result).toEqual({ success: false, error: LINK_INVALID_MESSAGE, linkInvalid: true })
    expect(await canSignIn(email, newPassword)).toBe(false)
    expect(await readMarker(id)).not.toBeNull()
  })

  it('issues several links in a row without hitting an email rate limit', async () => {
    const tokens = []
    for (let i = 0; i < 5; i++) tokens.push(await issueSetPasswordToken(students.burst.email))

    expect(tokens.every((t) => typeof t === 'string' && t.length > 0)).toBe(true)
  })
})
