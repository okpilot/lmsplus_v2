# Design — Send Internal Exam Code via Email

## Flow
```
Admin issues code (existing) → IssuedCodePanel shows code + "Send via email" button
  → sendInternalExamCodeEmail({ codeId })  [Server Action]
      1. Zod parse { codeId }
      2. requireAdmin() → { organizationId, supabase }
      3. getInternalExamCodeForEmail(codeId)  [adminClient, org-scoped read]
           → { code, studentEmail, studentName, subjectName, expiresAt, consumedAt, voidedAt } | null
      4. guard: null → 'Code not found'; consumed/voided/expired → 'Code is no longer active'
      5. build template internalExamCodeEmail({...}) → { subject, html, text }
      6. sendEmail({ to: studentEmail, subject, html, text })  [Resend client; console fallback if no key]
           → on failure: console.error + return { success:false, error:'Failed to send email' }
      7. best-effort audit: rpc(supabase,'record_internal_exam_code_emailed',{ p_code_id }) — log on error
      8. return { success: true }
```

## New modules
- `apps/web/lib/email/resend.ts` — `sendEmail({to,subject,html,text}): Promise<{ok:boolean; error?:string}>`.
  Lazy `new Resend(process.env.RESEND_API_KEY)`. If key absent → `console.log` the email, return `{ok:true}`.
  Reads `process.env.EMAIL_FROM` **internally** and passes it as the mandatory `from` to
  `resend.emails.send({ from, to, subject, html, text })`; if `EMAIL_FROM` is absent (but key present),
  log a server-side warning and return `{ok:false, error:'EMAIL_FROM not configured'}`.
  Check the SDK result with `if (result.error)` (the success branch carries a `headers` discriminant),
  return `{ok:false, error: result.error.message}` on error.
- `apps/web/lib/email/templates/internal-exam-code.ts` — pure
  `internalExamCodeEmail({studentName,subjectName,code,expiresAt,examUrl}) => {subject,html,text}`.
  `examUrl` = `${process.env.NEXT_PUBLIC_APP_URL}/app/internal-exam`, computed by the **action** and
  passed in. `NEXT_PUBLIC_APP_URL` is always set (`.env.example` defaults it to `http://localhost:3000`);
  an email link must be absolute, so do NOT fall back to `''` (a relative link is dead in an inbox) —
  if it were ever unset, fall back to the same `window.location.origin`-style default used elsewhere is
  not available server-side, so treat unset as a misconfiguration and still send an absolute-shaped URL.
- `apps/web/app/app/admin/internal-exams/email-queries.ts` —
  `getInternalExamCodeForEmail(codeId)`. Uses `adminClient` (mirrors `queries.ts` — cross-row
  `users` reads unreliable under tenant_isolation RLS), scoped `.eq('organization_id', orgId).is('deleted_at', null)`,
  joins `users!student_id(full_name,email)` + `easa_subjects!subject_id(name)` (FK-hint `!` form per
  code-style §5 — mirror `queries.ts:161 listExamSubjects`, NOT the bare `easa_subjects(name)` at
  queries.ts:69). On error: `console.error` + `return null`
  (caller checks null — intentional divergence from `queries.ts` throw, since no React page wraps it).
- `apps/web/app/app/admin/internal-exams/actions/send-code-email.ts` — the Server Action above.

## DB
- `record_internal_exam_code_emailed(p_code_id uuid)` SECURITY DEFINER, `SET search_path = public`.
  Guards (match siblings `issue_internal_exam_code` mig 087, `void_internal_exam_code` mig 084):
  `auth.uid()` null-check; `is_admin()`;
  **capture admin org AND role together** in one `deleted_at`-filtered lookup —
  `DECLARE v_admin_org uuid; v_admin_role text;` … `SELECT u.organization_id, u.role INTO v_admin_org, v_admin_role
  FROM users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL;` then `IF v_admin_org IS NULL THEN RAISE`
  (this is the active-user gate). Verify the code row exists in the admin's org AND `deleted_at IS NULL`
  (ownership; also read `student_id`, `subject_id` from it for the metadata). INSERT audit_events(
  `actor_role = v_admin_role`, event_type `internal_exam.code_emailed`, resource_type `internal_exam_code`,
  resource_id = code_id, metadata `{student_id, subject_id}`). **Reuse the cached `v_admin_role` —
  do NOT inline a `(SELECT u.role …)` subquery** (that reverses the mig-087 fix and would need its own
  rule-10 deleted_at filter). GRANT EXECUTE to authenticated.
- Files: `packages/db/migrations/110_record_internal_exam_code_emailed.sql`
  + `supabase/migrations/20260618000001_record_internal_exam_code_emailed.sql` (mirror).

## UI threading (codeId chain — atomic)
- `issue-code.ts` already returns `codeId` (no change).
- `issue-code-form.tsx`: `onIssued({ code, expiresAt, codeId })`; Props type updated.
- `codes-tab.tsx`: `IssuedCode` type gains `codeId`; pass `codeId` to `IssuedCodePanel`.
- `issued-code-panel.tsx`: new `codeId` prop + `LoadingButton` "Send via email" → action.
  Add `useEffect(() => setSent(false), [code])` (mirror existing `copied` reset) so a second
  issued code re-enables the button.

## Audit-call client note
Call the RPC via the **user-context** `supabase` (auth.uid() = admin), NOT `adminClient`
(service role → auth.uid() NULL) — mirrors `reset-student-password.ts`.

## Env
`.env.example`: add `RESEND_API_KEY=re_xxxx`, `EMAIL_FROM=noreply@yourdomain.com`
(`NEXT_PUBLIC_APP_URL` already present). Dep: `resend@^6.14.0` (installed).
