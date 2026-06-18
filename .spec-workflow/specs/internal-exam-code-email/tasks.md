# Tasks — Send Internal Exam Code via Email

## DB (Stream A — independent)
- [ ] A1. Migration `record_internal_exam_code_emailed` RPC in BOTH dirs (110 / 20260618000001)
- [ ] A2. Integration test in `packages/db/src/__integration__/` (admin ok / non-admin / cross-org / auth-null)

## Backend app (Stream B — leaf, then C depends on lib)
- [ ] B1. `lib/email/resend.ts` (reads EMAIL_FROM internally as `from`; console fallback w/o key) + `resend.test.ts`
- [ ] B2. `lib/email/templates/internal-exam-code.ts` (pure; `examUrl` passed in) + test
- [ ] B3. `email-queries.ts` (`getInternalExamCodeForEmail`; `easa_subjects!subject_id(name)` FK hint; error→null) + test
- [ ] B4. `actions/send-code-email.ts` (`sendInternalExamCodeEmail`) + test —
      named cases: success; null→'Code not found'; consumed/voided/expired→'Code is no longer active';
      send failure→generic error; **succeeds even when audit RPC returns `{error}` (best-effort, console.error)**;
      recipient derived server-side (assert `to` = the code's student email, not client input)

## Frontend wiring (Stream C — depends on B4)
- [ ] C1. `issue-code-form.tsx`: thread codeId — update Props `onIssued` type AND the call site at lines 46–47
      (`onIssued({ code: result.code, expiresAt: result.expiresAt, codeId: result.codeId })`);
      update `issue-code-form.test.tsx:105` `toHaveBeenCalledWith` to include `codeId: 'code-1'`
- [ ] C2. `codes-tab.tsx`: `IssuedCode` type gains `codeId`; lambda `onIssued={(issued)=>setIssued(issued)}`;
      pass `codeId={issued.codeId}` to panel. (No test file exists for codes-tab — type-check + form/panel tests cover it.)
- [ ] C3. `issued-code-panel.tsx`: `codeId` prop + "Send via email" LoadingButton + `useEffect(()=>setSent(false),[code])`;
      `issued-code-panel.test.tsx` — add `codeId` to `PROPS` fixture; add cases: success toast,
      error toast, button disabled/"Sent" after send (no double-send), `sent` resets when `code` prop changes

## Config / docs
- [ ] D1. `.env.example` add RESEND_API_KEY + EMAIL_FROM (resend dep already added)
- [ ] D2. docs/database.md RPC row + section; docs/decisions.md provider decision (doc-updater post-commit)

## QA gates
- [ ] check-types, lint, unit tests green
- [ ] implementation-critic before commit
- [ ] post-commit: code-reviewer, semantic-reviewer, doc-updater, test-writer; red-team (migration path); learner
