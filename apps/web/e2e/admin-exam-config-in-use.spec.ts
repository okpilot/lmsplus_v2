import { expect, test } from '@playwright/test'
import { ADMIN_TEST_EMAIL, getAdminOrganizationId, signInAsAdmin } from './helpers/admin-supabase'
import { getAdminClient, TEST_EMAIL } from './helpers/supabase'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  insertEntry,
  insertMarkedSubject,
  type SittingTrack,
} from './redteam/helpers/exam-sitting-seed'

test.use({ storageState: 'e2e/.auth/admin.json' })

const IN_USE_COPY = /used by a scheduled or open sitting/

test.describe('Admin Exam Config — disable blocked while a sitting uses the subject', () => {
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.afterEach(async () => {
    await cleanupSittingFixtures(getAdminClient(), track)
  })

  test('disabling is refused with the in-use message, survives reload, and succeeds once the entry is removed', async ({
    page,
  }) => {
    const admin = getAdminClient()
    const orgId = await getAdminOrganizationId()
    const { data: adminRow, error: adminErr } = await admin
      .from('users')
      .select('id')
      .eq('email', ADMIN_TEST_EMAIL)
      .single()
    if (adminErr || !adminRow) throw new Error(`admin user: ${adminErr?.message}`)
    const { data: student, error: studentErr } = await admin
      .from('users')
      .select('id')
      .eq('email', TEST_EMAIL)
      .single()
    if (studentErr || !student) throw new Error(`student user: ${studentErr?.message}`)
    track.adminId = adminRow.id

    const subjectId = await insertMarkedSubject(admin)
    track.subjectIds.push(subjectId)
    const { data: subject, error: subjectErr } = await admin
      .from('easa_subjects')
      .select('name')
      .eq('id', subjectId)
      .single()
    if (subjectErr || !subject) throw new Error(`subject: ${subjectErr?.message}`)
    const { error: cfgErr } = await admin.from('exam_configs').insert({
      organization_id: orgId,
      subject_id: subjectId,
      enabled: true,
      total_questions: 10,
      time_limit_seconds: 3600,
      pass_mark: 75,
    })
    if (cfgErr) throw new Error(`exam_configs: ${cfgErr.message}`)

    const adminClient = await signInAsAdmin()
    const sittingId = await createSittingRpc(adminClient, adminRow.id)
    track.sittingIds.push(sittingId)
    const entryId = await insertEntry(admin, {
      orgId,
      sittingId,
      userId: student.id,
      subjectId,
    })

    await page.goto('/app/admin/exam-config')
    await expect(page).toHaveURL(/\/app\/admin\/exam-config$/)
    const toggle = page.getByRole('switch', { name: `Exam mode for ${subject.name}` })
    await expect(toggle).toBeChecked()

    await toggle.click()
    await expect(page.getByText(IN_USE_COPY)).toBeVisible()
    await expect(toggle).toBeChecked()

    await page.reload()
    await expect(page).toHaveURL(/\/app\/admin\/exam-config$/)
    await expect(page.getByRole('switch', { name: `Exam mode for ${subject.name}` })).toBeChecked()

    const { error: removeErr } = await admin
      .from('exam_sitting_entries')
      .update({ deleted_at: new Date().toISOString(), deleted_by: adminRow.id })
      .eq('id', entryId)
    if (removeErr) throw new Error(`entry soft-delete: ${removeErr.message}`)

    await page.getByRole('switch', { name: `Exam mode for ${subject.name}` }).click()
    await expect(page.getByText('Exam mode disabled')).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('switch', { name: `Exam mode for ${subject.name}` }),
    ).not.toBeChecked()
  })
})
