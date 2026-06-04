/**
 * Red Team Spec — Vector BV (MEDIUM): JSONB injection on upsert_exam_config
 *
 * Attack: a compromised admin crafts a malformed `p_distributions` JSONB array —
 * SQL strings as topic_id, non-UUID / non-int values, negative counts, missing
 * keys — to corrupt the exam_config_distributions table or smuggle data past the
 * shape the app expects.
 *
 * Defense (DB layer, defense-in-depth behind the Server Action's Zod schema):
 * upsert_exam_config (SECURITY DEFINER, mig 20260411000008) extracts each element
 * with hard casts — `(v_dist->>'topic_id')::uuid`, `(v_dist->>'question_count')::int`
 * — and inserts into a typed table (`topic_id UUID NOT NULL REFERENCES easa_topics`,
 * `question_count INT NOT NULL CHECK (question_count > 0)`). Every malformed element
 * raises a Postgres error, and because the whole function runs in one transaction,
 * the failed call rolls back atomically — the config upsert + distribution DELETE are
 * undone, so no partial/corrupt state persists. SQL strings never execute: the uuid
 * cast rejects them as plain data.
 *
 * The Zod schema at the Server Action boundary (packages/db/src/schema.ts) is unit
 * tested in schema.test.ts; this spec pins the independent DB-layer guard, which the
 * red-team harness reaches by calling the RPC directly as an authenticated admin
 * (the Server Action / Zod layer is not reachable from PostgREST).
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed'

// A syntactically valid UUID that need not exist in easa_topics: used for cases
// whose rejection fires during row-expression evaluation (a bad question_count
// cast), which happens before any FK check, so the topic_id value is irrelevant.
const PLACEHOLDER_TOPIC_ID = '00000000-0000-4000-a000-000000000123'

type DistRow = { topic_id?: unknown; subtopic_id?: unknown; question_count?: unknown }

test.describe('Red Team: upsert_exam_config p_distributions injection', () => {
  let adminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let subjectId: string
  let validTopicId: string

  test.beforeAll(async () => {
    const admin = getAdminClient()
    const { orgId } = await seedRedTeamAdmin()
    await seedRedTeamUsers()
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // A real subject (so the exam_configs upsert succeeds and execution reaches the
    // distribution loop) and a real topic (so the FK passes and the CHECK is what
    // rejects a negative count, not a foreign-key violation).
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    validTopicId = picked.topicId
  })

  // Each case feeds one malformed distribution element and asserts the RPC rejects
  // with a specific Postgres SQLSTATE. The SQLSTATE matters for non-vacuity: the
  // auth/admin guards raise P0001 ('not authenticated' / 'admin access required'),
  // so a 22P02 / 23514 / 23502 code proves the admin DID pass the gate and the
  // rejection came from the distribution INSERT — not from being blocked earlier.
  const CASES: { name: string; expectedCode: string; dist: () => DistRow[] }[] = [
    {
      name: 'a SQL-injection string as topic_id (cast rejects it as data, not SQL)',
      // invalid_text_representation — the uuid cast is the guard; the string is
      // treated as a value to cast, never parsed/executed as SQL.
      expectedCode: '22P02',
      dist: () => [{ topic_id: "'; DROP TABLE exam_config_distributions; --", question_count: 1 }],
    },
    {
      name: 'a non-UUID topic_id',
      expectedCode: '22P02',
      dist: () => [{ topic_id: 'not-a-uuid', question_count: 1 }],
    },
    {
      name: 'a non-integer question_count',
      expectedCode: '22P02', // integer cast on 'abc'
      dist: () => [{ topic_id: PLACEHOLDER_TOPIC_ID, question_count: 'abc' }],
    },
    {
      name: 'a negative question_count (CHECK question_count > 0)',
      expectedCode: '23514', // check_violation — fires after a real-topic FK passes
      dist: () => [{ topic_id: validTopicId, question_count: -5 }],
    },
    {
      name: 'a missing topic_id key (NOT NULL)',
      // not_null_violation on the topic_id column: an absent key makes
      // `v_dist->>'topic_id'` SQL NULL, NULL::uuid is NULL (no cast error), so the
      // `topic_id UUID NOT NULL` constraint is what rejects the row.
      expectedCode: '23502',
      dist: () => [{ question_count: 1 }],
    },
  ]

  for (const c of CASES) {
    test(`rejects ${c.name}`, async () => {
      const { data, error } = await adminClient.rpc('upsert_exam_config', {
        p_subject_id: subjectId,
        p_enabled: true,
        p_total_questions: 10,
        p_time_limit_seconds: 3600,
        p_pass_mark: 75,
        p_distributions: c.dist(),
      })

      expect(error).not.toBeNull()
      // SQLSTATE pins the DB-layer guard AND proves the admin reached the loop
      // (auth failures would be P0001, not a cast/constraint code).
      expect(error?.code).toBe(c.expectedCode)
      expect(data).toBeNull()
    })
  }

  test('rejects an authenticated non-admin caller (Vector BV2 — privilege escalation)', async () => {
    // The student is authenticated (passes auth.uid()), so this pins the is_admin
    // role guard specifically, not the unauthenticated path (which belongs to
    // server-action-unauthenticated.spec.ts). A well-formed payload is used so the
    // ONLY reason to reject is the role — proving the admin gate, not input shape.
    const { data, error } = await studentClient.rpc('upsert_exam_config', {
      p_subject_id: subjectId,
      p_enabled: true,
      p_total_questions: 5,
      p_time_limit_seconds: 3600,
      p_pass_mark: 75,
      p_distributions: [{ topic_id: validTopicId, subtopic_id: null, question_count: 5 }],
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/admin access required/i)
    expect(data).toBeNull()
  })

  // No hermetic cleanup is needed: every case above raises inside the single-
  // transaction RPC, so the config upsert + distribution DELETE that precede the
  // failing INSERT roll back atomically. The egmont seed config for `subjectId`
  // is left untouched. (A well-formed positive control is deliberately omitted —
  // it would COMMIT a replacement of the seed config + distributions, and the
  // original could not be restored, polluting downstream specs.)
})
