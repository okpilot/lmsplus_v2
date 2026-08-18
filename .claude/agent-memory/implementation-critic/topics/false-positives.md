# False positives — do not re-raise (impl-critic)

> Split out of `MEMORY.md` 2026-08-18 for budget. Each entry was raised as a finding once and
> validated as WRONG on the merits. Re-verify against source before citing if the file moved.

- **`clearActiveSessions({ admin, studentIds: [studentId] })` in `beforeEach` is correctly studentId-scoped, NOT org-wide** — do not suggest `orgId`. †
- **Probe-gate keyed on allRows (pre-filter) is correct** — `rows.length === 0 → totalCount: 0` is not a missing probe. †
- **`count(*) OVER()` with a `p_limit:1` probe** returns the correct `total_count` — the window is evaluated before LIMIT/OFFSET. †
- **Probe fires on page=2 empty** — `toHaveBeenCalledWith` asserts the FIRST call; the probe's second call is unmocked and the test never asserts its value.
- **`getSessionReports` ~39-line body after extraction** — the auth/RPC/filter preamble cannot split without artificial helpers. Orchestrator-pattern exception.
- **`avg_score`/mastery RPCs return NULL (no COALESCE)** for students with no sessions — intentional; app type `number | null`, UI guards `!== null`.
- **Hard DELETE on `exam_config_distributions` inside `upsert_exam_config`** — intentional, documented in mig 043 + database.md (ephemeral config table).
- **Adjacent conditional JSX guard blocks (`{canDismiss && (`)** are not duplicate buttons — a state-driven trigger and a prop-guarded confirm button are distinct.
- **`_userId`/dropped param on caller-scoped RPCs** — scoped via RLS + `auth.uid()`; dead but harmless (SUGGESTION at most).
- **Red-team seed `selected_option_id: 'a'` with `is_correct: true`** — intentional; `get_student_mastery_stats` reads `sr.is_correct` directly.
- **Red-team spec with no `afterEach` is hermetic** when each test seeds NEW unique rows and does not mutate shared beforeAll state. †
- **try/finally hermiticity hardening for org-transfer tests is correct**; `finally` must use `console.error`, not `expect()`. †
- **`blanks.every(...)` vacuous-true on `[]` is unreachable in the dialog-fill a11y path** — dialog_fill requires ≥1 `{{n}}` blank (mig 131 trigger). †
- **RWY 2709 client-bundle DCE is ASYMMETRIC** — zone ids survive as `rt("<id>",…)` calls, label ids/texts do not; never certify "both arrays are tree-shaken", and do NOT raise the index alignment as a leak. Measurement: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md) †
