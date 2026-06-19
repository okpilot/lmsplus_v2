# Tasks — Send Internal Exam Code via Email

> Status: implemented — PR #904 open, all CI checks green, awaiting manual eval + merge.
> Post-commit suite (code-reviewer, semantic-reviewer ×2 incl. PR-sweep, doc-updater, test-writer,
> red-team, learner) + 4 CR-local rounds + cloud-CR run; all findings resolved.
> Follow-ups: #902 (red-team E2E), #903 (learner rule promotions).

## DB (Stream A)
- [x] A1. Migration `record_internal_exam_code_emailed` RPC in BOTH dirs (110 / 20260618000001), byte-identical
- [x] A2. Integration test → 8 cases (admin ok / non-admin / cross-org / consumed / voided / expired / soft-deleted / unauthenticated)

## Backend app (Stream B)
- [x] B1. `lib/email/resend.ts` (EMAIL_FROM as `from`; console fallback; generic `send_failed` on SDK error) + test
- [x] B2. `lib/email/templates/internal-exam-code.ts` (pure; `esc()` HTML-escaping on DB values) + test
- [x] B3. `email-queries.ts` (`getInternalExamCodeForEmail`; FK-hint joins; error→null) + test
- [x] B4. `actions/send-code-email.ts` (`sendInternalExamCodeEmail`; error = closed domain-literal union) + test

## Frontend wiring (Stream C)
- [x] C1. `issue-code-form.tsx` threads codeId (Props + call site) + test assertion
- [x] C2. `codes-tab.tsx` IssuedCode type + pass codeId (+ new codes-tab.test.tsx)
- [x] C3. `issued-code-panel.tsx` Send button + sent-reset effect + test

## Config / docs
- [x] D1. `.env.example` RESEND_API_KEY + EMAIL_FROM (resend dep added)
- [x] D2. docs/database.md RPC section (+ state guard); docs/decisions.md Decision 44; docs/plan.md status + counts

## QA gates
- [x] check-types, lint, 3919 unit tests green
- [x] plan-critic (plan) + spec QA + implementation-critic (staged) run, findings folded in
- [x] post-commit suite + PR-sweep semantic review; all CRITICAL/ISSUE resolved
- [x] /fullpush (CR-local, 4 rounds) → pushed → PR #904 (all CI green incl. migration/red-team/integration)
- [ ] manual eval (send a real code email) → merge  (awaiting user)
