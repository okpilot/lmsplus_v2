/**
 * Red Team Spec: internal `_`-prefixed helpers — authenticated EXECUTE denied (Vector HS)
 *
 * HS (privilege-escalation): a signed-in student calls an internal helper directly via
 * `POST /rpc/_<fn>`. The SECURITY DEFINER graders trust their p_student_id/p_session_id args;
 * `_vfr_rt_exam_part_scores` (SECURITY INVOKER) reads graded answers.
 *
 * The helper set is derived at runtime from the PostgREST OpenAPI root. Only the privilege-layer
 * message `permission denied for function <name>` counts: a SECURITY INVOKER body can also fail
 * 42501 on a revoked column.
 *
 * Status: Expected to PASS. Control arm: `_filtered_question_pool`, deliberately GRANTed to
 * authenticated, does not return the privilege denial for the same caller and probe shape.
 */

import { expect, test } from '@playwright/test'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { deriveRpcSpecs, type RpcSpec } from './helpers/rpc-specs'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

const GRANTED_HELPER = '_filtered_question_pool'
const MUST_COVER = ['_grade_session_progress', '_score_graded_session', '_vfr_rt_exam_part_scores']

const deniedFor = (name: string) => new RegExp(`permission denied for function ${name}\\b`, 'i')
const nullArgs = (params: string[]) => Object.fromEntries(params.map((p) => [p, null]))

test.describe('Red Team: internal helpers deny authenticated EXECUTE (Vector HS)', () => {
  let helpers: RpcSpec[]
  let granted: RpcSpec
  let student: Awaited<ReturnType<typeof createAuthenticatedClient>>

  test.beforeAll(async () => {
    await seedRedTeamUsers()
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const all = (await deriveRpcSpecs()).filter((r) => r.name.startsWith('_'))
    const found = all.find((r) => r.name === GRANTED_HELPER)
    if (!found) throw new Error(`${GRANTED_HELPER} missing from OpenAPI root`)
    granted = found
    helpers = all.filter((r) => r.name !== GRANTED_HELPER)
    expect(helpers.map((r) => r.name)).toEqual(expect.arrayContaining(MUST_COVER))
  })

  test('control: a granted helper is not refused at the privilege layer', async () => {
    const { error } = await student.rpc(granted.name, nullArgs(granted.params))
    expect(error?.message ?? '').not.toMatch(deniedFor(granted.name))
  })

  test('HS: a signed-in student cannot execute any internal helper', async () => {
    for (const { name, params } of helpers) {
      const { data, error } = await student.rpc(name, nullArgs(params))
      expect.soft(error?.code, `EXECUTE on "${name}" must be rejected`).toBe('42501')
      expect.soft(error?.message ?? '', `EXECUTE on "${name}"`).toMatch(deniedFor(name))
      expect.soft(data, `"${name}" returned data`).toBeNull()
    }
  })
})
