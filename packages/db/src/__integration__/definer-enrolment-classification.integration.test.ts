import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * Every SECURITY DEFINER function that reads questions / easa_* or inserts into quiz_sessions
 * is classified by how course enrolment reaches it (#1637, AC10). A new such function fails
 * here until it is added to a class below.
 */
const CLASSIFIED: Record<string, string[]> = {
  'trigger-gated': [
    'start_discovery',
    'start_exam_session',
    'start_internal_exam_session',
    'start_quiz_session',
    'start_vfr_rt_exam_session',
  ],
  filtered: ['get_quiz_questions', 'accessible_subject_ids'],
  'session-keyed': [
    'check_non_mc_answer',
    'check_quiz_answer',
    'finish_quiz_session',
    'get_report_answer_keys',
    'get_report_correct_options',
    'get_restored_feedback',
    'get_session_reports',
    'get_subject_scores',
    'get_vfr_rt_exam_questions',
    'get_vfr_rt_exam_results',
    'list_my_active_internal_exam_codes',
    'list_my_internal_exam_history',
    'save_quiz_answer',
    'submit_quiz_answer',
  ],
  admin: [
    'get_admin_dashboard_kpis',
    'get_admin_dashboard_students',
    'get_admin_report_answer_keys',
    'get_admin_report_correct_options',
    'get_admin_weak_topics',
    'get_question_authoring_fields',
    'issue_internal_exam_code',
  ],
  internal: ['_grade_session_progress', '_score_graded_session'],
}

const DERIVE_SQL = `
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef AND p.prokind IN ('f','p') AND n.nspname IN ('public','private')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  AND (p.prosrc ~* '\\m(questions|easa_subjects|easa_topics|easa_subtopics)\\M'
       OR p.prosrc ~* 'insert\\s+into\\s+(public\\.)?quiz_sessions')
ORDER BY 1;`

function derived(): string[] {
  const out = execFileSync(
    'psql',
    ['-h', 'localhost', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-tA', '-q'],
    { input: DERIVE_SQL, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } },
  )
  return out.split('\n').filter(Boolean)
}

describe('SECURITY DEFINER functions touching questions / easa_* / quiz_sessions', () => {
  it('every derived function is classified and every classified function exists', () => {
    const found = derived()
    expect(found.length).toBeGreaterThan(0)
    const classified = Object.values(CLASSIFIED).flat().sort()
    expect(new Set(classified).size).toBe(classified.length)
    expect(found.sort()).toEqual(classified)
  })
})
