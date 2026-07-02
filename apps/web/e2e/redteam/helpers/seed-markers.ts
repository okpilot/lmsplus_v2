// E2E hermiticity markers — exported per code-style.md §7 so cleanup queries
// in any spec or maintenance script can target the rows these tests create.
export const E2E_REDTEAM_CODE_PREFIX = 'RT'
export const E2E_XSS_MARKER = '[E2E_XSS]'
export const E2E_REDTEAM_UNAUTH_COMMENT_MARKER = '[E2E_REDTEAM] unauth-read fixture'
export const E2E_REDTEAM_COMMENT_IDOR_MARKER = '[E2E_REDTEAM] comment-idor fixture'
// get_report_answer_keys spec (#989): marks the non-MC fixture questions it inserts
// (egmont is MC-only) so cleanup/maintenance can target them by question_number/text.
export const E2E_REDTEAM_EN_MARKER = '[E2E_REDTEAM_EN]'
// get_report_answer_keys spec (#989) EN4: the dedicated, reused throwaway student
// whose soft-delete proves the active-user gate. Exported so cleanup/maintenance can
// target it (kept distinct from the shared redteam-victim@ to bound soft-delete blast radius).
export const E2E_REDTEAM_EN_SOFTDEL_STUDENT_EMAIL =
  'redteam-softdel-report-keys-student@lmsplus.local'
export const E2E_REDTEAM_EN_SOFTDEL_STUDENT_PASSWORD = 'redteam-softdel-report-keys-student-2026!'
// Dedicated throwaway student for the get_study_questions EO-SD soft-deleted-caller sub-vector.
// Distinct email so a soft-delete blast radius is bounded to get-study-questions-eo.spec.ts.
export const E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL = 'redteam-softdel-study-student@lmsplus.local'
export const E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD = 'redteam-softdel-study-student-2026!'
// get_study_questions spec (Vector EO): marks the throwaway MC/short_answer
// questions it inserts (egmont + redteam-other-org) so cleanup/maintenance can
// target them by question_text/question_number. get_study_questions deliberately
// returns the MC answer key for Study Mode, so this vector pins the org /
// soft-delete / status / question_type guard boundaries around that exposure.
export const E2E_REDTEAM_EO_MARKER = '[E2E_REDTEAM_EO]'
