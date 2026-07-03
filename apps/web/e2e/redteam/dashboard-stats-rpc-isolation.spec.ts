/**
 * Red Team Spec: Dashboard Aggregation RPC Self-Scope — Instructor Isolation + Victim Positive Control
 *
 * Vectors covered:
 *   BW3 — instructor with zero own responses must not aggregate the victim's correct counts
 *          via get_student_mastery_stats (§11 self-scope: sr.student_id = auth.uid())
 *   BX3 — instructor must see {0,0} from get_student_streak (zero own responses)
 *   BX4 — instructor must see an empty array from get_student_last_practiced
 *   BX7 — victim streak gaps-and-islands correctness: seeded runs {today,−1,−2}→current=3
 *          and {−6..−10}→best=5 must survive the RPC's UTC grouping without drift
 *   Positive controls — victim mastery and last-practiced are non-empty after seeding,
 *          proving the isolation assertions are non-vacuous (egmont HAS data; empties
 *          seen by the instructor are isolation, not absence-of-data)
 *
 * Why instructor mastery has length > 0 (non-vacuous denominator note):
 *   get_student_mastery_stats resolves the org via
 *     `caller AS (SELECT organization_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)`
 *   and builds subject/topic totals from caller-independent org question counts.  The
 *   self-scoped numerator (correct counts) is a LEFT JOIN.  An egmont instructor with zero
 *   own responses therefore gets real denominator rows, each with correct = COALESCE(NULL, 0) = 0.
 *   Asserting length > 0 proves the denominator is visible; asserting every(correct === 0)
 *   proves the numerator self-scope holds — the victim's correct answers did NOT leak.
 *
 * Persistent-seed / no-cleanup rationale:
 *   student_responses is an append-only, immutable table (docs/security.md §6 — NEVER UPDATE
 *   or DELETE).  seedVictimResponses() is idempotent (insert-once guarded by an 8-row
 *   sentinel count), so there is intentionally NO afterEach / afterAll here.  The rows
 *   persist exactly like the seed users themselves.  Duplicate rows from a partial prior
 *   run are harmless because every consuming RPC collapses them (streak uses DISTINCT dates,
 *   mastery uses COUNT(DISTINCT question_id), last-practiced is MAX GROUP BY subject).
 *
 * Status: Expected to PASS (defenses must hold).
 * If any assertion fails it indicates a real RLS/SQL regression and must block merge.
 */

import { expect, test } from '@playwright/test'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedVictimResponses } from './helpers/seed-responses'
import { seedRedTeamInstructor, seedRedTeamStudent, seedRedTeamUsers } from './helpers/seed-users'

test.describe('Red Team: Dashboard Aggregation RPC Self-Scope (#673)', () => {
  let instructorClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>

  test.beforeAll(async () => {
    // Ensure base seed users + org exist (idempotent)
    await seedRedTeamUsers()

    // Provision the egmont instructor (zero own responses — never inserted any)
    const instructor = await seedRedTeamInstructor()

    // Seed 8 deterministic victim responses; get victim credentials in parallel
    // seedVictimResponses internally calls seedRedTeamStudent, so calling
    // seedRedTeamStudent afterwards is a no-op upsert that returns the same creds.
    await seedVictimResponses()
    const victim = await seedRedTeamStudent()

    instructorClient = await createAuthenticatedClient(instructor.email, instructor.password)
    victimClient = await createAuthenticatedClient(victim.email, victim.password)
  })

  // ---------------------------------------------------------------------------
  // BW3 — instructor self-scope: get_student_mastery_stats
  // ---------------------------------------------------------------------------

  test('egmont instructor with no responses sees denominator rows but zero correct counts in get_student_mastery_stats', async () => {
    // length > 0: proves the caller-independent denominator is visible (non-vacuous assertion).
    // every(correct === 0): proves the self-scope — the instructor does NOT aggregate
    // the victim's correct answers despite sharing the same org's RLS policy.
    const { data, error } = await instructorClient.rpc('get_student_mastery_stats')
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
    expect((data ?? []).every((r: { correct: number }) => r.correct === 0)).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // BX3 — instructor self-scope: get_student_streak
  // ---------------------------------------------------------------------------

  test('egmont instructor with no responses sees a single {0,0} streak row', async () => {
    // get_student_streak always returns exactly one row (scalar-subquery shape).
    // An instructor with zero own responses must see current=0 and best=0.
    // Non-zero values would mean the victim's streak data leaked via the
    // instructor's broader RLS policy.
    const { data, error } = await instructorClient.rpc('get_student_streak')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.current_streak).toBe(0)
    expect(data?.[0]?.best_streak).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // BX4 — instructor self-scope: get_student_last_practiced
  // ---------------------------------------------------------------------------

  test('egmont instructor with no responses sees an empty last-practiced array', async () => {
    // The instructor has submitted zero responses, so last-practiced must be empty.
    // Any row here would mean the victim's practice timestamps leaked.
    const { data, error } = await instructorClient.rpc('get_student_last_practiced')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Positive control — victim mastery (proves BW3 is non-vacuous)
  // ---------------------------------------------------------------------------

  test('egmont victim student sees at least one subject with correct > 0 in get_student_mastery_stats', async () => {
    // Confirms egmont holds real victim data, making the instructor isolation
    // assertions above non-vacuous (the instructor saw empty/zero, not absence-of-data).
    const { data, error } = await victimClient.rpc('get_student_mastery_stats')
    expect(error).toBeNull()
    expect((data ?? []).some((r: { correct: number }) => r.correct > 0)).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Positive control — victim last-practiced (proves BX4 is non-vacuous)
  // ---------------------------------------------------------------------------

  test('egmont victim student sees at least one subject in get_student_last_practiced', async () => {
    // Confirms the victim has practice history, making the instructor's empty
    // result above a proof of isolation rather than a proof of absent data.
    const { data, error } = await victimClient.rpc('get_student_last_practiced')
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
  })

  // ---------------------------------------------------------------------------
  // BX7 — victim streak gaps-and-islands correctness
  // ---------------------------------------------------------------------------

  test('egmont victim streak reflects seeded runs: current = 3 days, best = 5 days', async () => {
    // Seeded response dates (noon UTC, single captured snapshot):
    //   Current run: today, today−1, today−2 → 3 consecutive days → current_streak = 3
    //   Gap:         today−3, today−4, today−5 (no responses — intentional break)
    //   Best run:    today−6, today−7, today−8, today−9, today−10 → 5 days → best_streak = 5
    // The 3-day gap keeps both runs disjoint under the RPC's today-or-yesterday anchor.
    // Using a single Date snapshot at noon UTC means a UTC-midnight rollover mid-seed
    // shifts both runs together, preserving the lengths 3 and 5.
    const { data, error } = await victimClient.rpc('get_student_streak')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.current_streak).toBe(3)
    expect(data?.[0]?.best_streak).toBe(5)
  })
})
