import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import { insertMcKeyNotInOptions } from './finish-broken-fixture'
import {
  backdateSession,
  finishSeedSession,
  insertDialogWithoutCanonical,
  insertExtraQuestion,
  RIGHT,
  saveAnswers,
  secondsAgo,
  WRONG_MC,
} from './finish-fixture'
import { auditMetadata, sessionRow } from './finish-readers'
import { requireRpcResult } from './guards'
import { insertSession, type ProgressFixture, setupProgressFixture } from './quiz-progress-fixture'

type Results = {
  part1_pct: number | string | null
  part2_pct: number | string | null
  part3_pct: number | string | null
  passed_overall: boolean
  passed_per_part: { part1: boolean | null; part2: boolean | null; part3: boolean | null }
}

/** A short_answer with a blank canonical answer and no synonyms: broken per _question_is_broken. */
const insertShortAnswerBlankCanonical = (f: ProgressFixture) =>
  insertExtraQuestion(f, {
    question_type: 'short_answer',
    question_text: 'Blank canonical',
    canonical_answer: '',
    accepted_synonyms: [],
  })

function psql(sql: string): string {
  const args = ['-U', 'postgres', '-d', 'postgres', '-tA', '-q', '-F', '|']
  try {
    return execFileSync('psql', ['-h', 'localhost', '-p', '54322', ...args], {
      input: sql,
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: 'postgres' },
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    return execFileSync('docker', ['exec', '-i', 'supabase_db_lmsplusv2', 'psql', ...args], {
      input: sql,
      encoding: 'utf8',
    })
  }
}

describe('VFR RT exam: a part with no countable question is not counted', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('vfr-counted')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  const mc = (i: number) => f.mcIds[i] ?? ''

  const vfrSession = (questionIds: string[], extra: { overdue?: boolean } = {}) =>
    insertSession({
      f,
      mode: 'vfr_rt_exam',
      questionIds,
      timeLimitSeconds: extra.overdue ? 60 : 1800,
      ...(extra.overdue ? { startedAt: secondsAgo(10) } : {}),
    })

  async function results(sessionId: string): Promise<Results> {
    const { data, error } = await f.student.rpc('get_vfr_rt_exam_results', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    return requireRpcResult<Results>(data, 'get_vfr_rt_exam_results')
  }

  /** Part 2 all broken, parts 1 and 3 answered right; finished. */
  async function finishedPart2Broken() {
    const brokenDialog = await insertDialogWithoutCanonical(f)
    const sessionId = await vfrSession([f.shortId, brokenDialog, mc(0)])
    await saveAnswers(f, sessionId, [
      [f.shortId, RIGHT.short],
      [mc(0), RIGHT.mc],
    ])
    const result = await finishSeedSession(f.student, sessionId)
    return { sessionId, brokenDialog, result }
  }

  it('AC1: passes with score 100 and part2_pct null when part 2 is all broken and parts 1 and 3 are right', async () => {
    const { sessionId, result } = await finishedPart2Broken()

    expect(result.passed_overall).toBe(true)
    expect(result.passed).toBe(true)
    expect(Number(result.score_percentage)).toBe(100)
    expect(result.part2_pct).toBeNull()
    expect(Number(result.part1_pct)).toBe(100)
    expect(Number(result.part3_pct)).toBe(100)
    const stored = await sessionRow(f, sessionId)
    expect(stored.passed).toBe(true)
    expect(Number(stored.score_percentage)).toBe(100)
  })

  it('AC2: passes with score 100 and part3_pct null when part 3 is all broken', async () => {
    const brokenMc = await insertMcKeyNotInOptions(f)
    const sessionId = await vfrSession([f.shortId, f.dialogId, brokenMc])
    await saveAnswers(f, sessionId, [
      [f.shortId, RIGHT.short],
      [f.dialogId, RIGHT.dialog],
    ])

    const result = await finishSeedSession(f.student, sessionId)

    expect(result.passed).toBe(true)
    expect(Number(result.score_percentage)).toBe(100)
    expect(result.part3_pct).toBeNull()
    expect(Number(result.part1_pct)).toBe(100)
    expect(Number(result.part2_pct)).toBe(100)
    expect((await sessionRow(f, sessionId)).passed).toBe(true)
  })

  it('AC2: passes with score 100 and part1_pct null when part 1 is all broken', async () => {
    const brokenShort = await insertShortAnswerBlankCanonical(f)
    const sessionId = await vfrSession([brokenShort, f.dialogId, mc(0)])
    await saveAnswers(f, sessionId, [
      [f.dialogId, RIGHT.dialog],
      [mc(0), RIGHT.mc],
    ])

    const result = await finishSeedSession(f.student, sessionId)

    expect(result.passed).toBe(true)
    expect(Number(result.score_percentage)).toBe(100)
    expect(result.part1_pct).toBeNull()
    expect(Number(result.part2_pct)).toBe(100)
    expect(Number(result.part3_pct)).toBe(100)
    expect((await sessionRow(f, sessionId)).passed).toBe(true)
  })

  it('AC3: scores 0 and fails without error when every part is all broken', async () => {
    const ids = [
      await insertShortAnswerBlankCanonical(f),
      await insertDialogWithoutCanonical(f),
      await insertMcKeyNotInOptions(f),
    ]
    const sessionId = await vfrSession(ids)

    const result = await finishSeedSession(f.student, sessionId)

    expect(Number(result.score_percentage)).toBe(0)
    expect(result.passed).toBe(false)
    expect(result.part1_pct).toBeNull()
    expect(result.part2_pct).toBeNull()
    expect(result.part3_pct).toBeNull()
    const stored = await sessionRow(f, sessionId)
    expect(stored.passed).toBe(false)
    expect(Number(stored.score_percentage)).toBe(0)
  })

  it('AC4: fails with the mean of the two counted parts when one part is broken, one is 100 and one is below 75', async () => {
    const brokenDialog = await insertDialogWithoutCanonical(f)
    const sessionId = await vfrSession([f.shortId, brokenDialog, mc(0), mc(1)])
    await saveAnswers(f, sessionId, [
      [f.shortId, RIGHT.short],
      [mc(0), RIGHT.mc],
      [mc(1), WRONG_MC],
    ])

    const result = await finishSeedSession(f.student, sessionId)

    expect(result.part2_pct).toBeNull()
    expect(Number(result.part1_pct)).toBe(100)
    expect(Number(result.part3_pct)).toBe(50)
    expect(result.passed).toBe(false)
    expect(Number(result.score_percentage)).toBe(75)
    expect((await sessionRow(f, sessionId)).passed).toBe(false)
  })

  it('AC6: results RPC reports passed_overall true, part2_pct null and passed_per_part.part2 null, equal to the stored pass', async () => {
    const { sessionId } = await finishedPart2Broken()

    const r = await results(sessionId)

    expect(r.passed_overall).toBe(true)
    expect(r.part2_pct).toBeNull()
    expect(Number(r.part1_pct)).toBe(100)
    expect(Number(r.part3_pct)).toBe(100)
    expect(r.passed_per_part).toEqual({ part1: true, part2: null, part3: true })
    expect(r.passed_overall).toBe((await sessionRow(f, sessionId)).passed)
  })

  it('AC7: replays of both RPCs keep part2 not counted after the broken question is repaired', async () => {
    const { sessionId, brokenDialog } = await finishedPart2Broken()
    const { error } = await f.admin
      .from('questions')
      .update({ blanks_config: [{ index: 0, canonical: 'cleared', synonyms: [] }] })
      .eq('id', brokenDialog)
    expect(error).toBeNull()

    const replay = await finishSeedSession(f.student, sessionId)
    const r = await results(sessionId)

    expect(replay.part2_pct).toBeNull()
    expect(replay.passed).toBe(true)
    expect(Number(replay.part1_pct)).toBe(100)
    expect(Number(replay.part3_pct)).toBe(100)
    expect(r.part2_pct).toBeNull()
    expect(r.passed_per_part.part2).toBeNull()
    expect(r.passed_overall).toBe(true)
  })

  /** An ended vfr_rt_exam session with no graded answers, part 2 all broken. */
  async function endedSessionWithoutFrozenParts() {
    const brokenDialog = await insertDialogWithoutCanonical(f)
    const sessionId = await vfrSession([f.shortId, brokenDialog, mc(0)])
    const { error } = await f.admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString(), passed: false, score_percentage: 0 })
      .eq('id', sessionId)
    expect(error).toBeNull()
    return sessionId
  }

  async function insertTerminalEvent(
    sessionId: string,
    eventType: string,
    metadata: Record<string, unknown>,
  ) {
    const { error } = await f.admin.from('audit_events').insert({
      organization_id: f.orgId,
      actor_id: f.studentId,
      actor_role: 'student',
      event_type: eventType,
      resource_type: 'quiz_session',
      resource_id: sessionId,
      metadata,
    })
    expect(error).toBeNull()
  }

  it('AC8: results RPC falls back to the helper when the terminal event carries no part*_pct keys', async () => {
    const sessionId = await endedSessionWithoutFrozenParts()
    await insertTerminalEvent(sessionId, 'vfr_rt_exam.completed', { score: 0, passed: false })

    const r = await results(sessionId)

    expect(r.part2_pct).toBeNull()
    expect(Number(r.part1_pct)).toBe(0)
    expect(Number(r.part3_pct)).toBe(0)
  })

  it('AC8: a later keyless event does not shadow an earlier event that carries the frozen part keys', async () => {
    const sessionId = await endedSessionWithoutFrozenParts()
    await insertTerminalEvent(sessionId, 'vfr_rt_exam.completed', {
      part1_pct: 100,
      part2_pct: null,
      part3_pct: 100,
    })
    await insertTerminalEvent(sessionId, 'vfr_rt_exam.expired', { reason: 'keyless' })

    const r = await results(sessionId)

    expect(Number(r.part1_pct)).toBe(100)
    expect(r.part2_pct).toBeNull()
    expect(Number(r.part3_pct)).toBe(100)
  })

  it('AC9: an overdue completion with a fully broken part writes part2_pct null and stores passed true', async () => {
    const brokenDialog = await insertDialogWithoutCanonical(f)
    const sessionId = await vfrSession([f.shortId, brokenDialog, mc(0)], { overdue: true })
    await saveAnswers(f, sessionId, [
      [f.shortId, RIGHT.short],
      [mc(0), RIGHT.mc],
    ])
    await backdateSession(f, sessionId, 2000)

    const { data, error } = await f.student.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const result = requireRpcResult<{ passed: boolean; score_percentage: number | string }>(
      data,
      'complete_overdue_exam_session',
    )

    expect(result.passed).toBe(true)
    expect(Number(result.score_percentage)).toBe(100)
    const events = await auditMetadata(f, sessionId, 'vfr_rt_exam.expired')
    expect(events).toHaveLength(1)
    expect(events[0]).toHaveProperty('part2_pct', null)
    expect(Number(events[0]?.part1_pct)).toBe(100)
    expect((await sessionRow(f, sessionId)).passed).toBe(true)
  })

  it('AC10: keeps grants, and definers end their search_path with pg_temp', () => {
    const rows = psql(`
SELECT p.proname, p.prosecdef, coalesce(p.proconfig::text, ''),
       has_function_privilege('authenticated', p.oid, 'EXECUTE'),
       has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('_vfr_rt_exam_part_scores', '_score_graded_session',
                    'finish_quiz_session', 'get_vfr_rt_exam_results')
ORDER BY 1;`)
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('|'))
    const byName = Object.fromEntries(rows.map((r) => [r[0], r]))

    expect(Object.keys(byName).sort()).toEqual([
      '_score_graded_session',
      '_vfr_rt_exam_part_scores',
      'finish_quiz_session',
      'get_vfr_rt_exam_results',
    ])
    for (const name of [
      '_score_graded_session',
      'finish_quiz_session',
      'get_vfr_rt_exam_results',
    ]) {
      expect(byName[name]?.[1], `${name} definer`).toBe('t')
      expect(byName[name]?.[2], `${name} proconfig`).toMatch(/pg_temp/)
    }
    expect(byName.finish_quiz_session?.[3]).toBe('t')
    expect(byName.get_vfr_rt_exam_results?.[3]).toBe('t')
    expect(byName._score_graded_session?.[3]).toBe('f')
    expect(byName._vfr_rt_exam_part_scores?.[3]).toBe('f')
    for (const r of rows) expect(r[4], `${r[0]} anon`).toBe('f')
  })

  it('AC10: the part-score helper returns NULL, not 0, for a part with no countable question', () => {
    const out = psql(`
SELECT s.p1 IS NULL, s.p2 IS NULL, s.p3 IS NULL
FROM public._vfr_rt_exam_part_scores(
  '00000000-0000-0000-0000-000000000000'::uuid, '{"question_ids": []}'::jsonb) s;`).trim()

    expect(out).toBe('t|t|t')
  })
})
