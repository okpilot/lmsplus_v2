# Requirements — Send Internal Exam Code via Email

## Goal
After an admin issues a per-student internal exam code, let the admin click a button
to email that single student their code automatically (replacing manual copy/paste).

## User decisions (interview)
- **Provider:** Resend (transactional email; coexists with Proton via DNS — Proton keeps MX,
  Resend adds SPF + DKIM on the same custom domain).
- **Domain:** custom domain with DNS access (admin sets up SPF/DKIM out of band).
- **Recipient model:** one code → one exam (subject) → one student → one email. No batch send,
  no recipient selection UI. The student the code was issued to is the sole recipient.
- **Audit:** yes — record an audit event when a code is emailed.
- **Email content:** rich & friendly — greeting by student name, subject name, the code,
  expiry, a "Go to exam" link to `/app/internal-exam`, short instructions, plain-text fallback.

## Functional requirements
1. The "New code issued" panel shows a **Send via email** button after a code is issued.
2. Clicking sends the email to the issued student and shows success/error feedback (toast).
3. The recipient address is **derived server-side** from the code's `student_id` — never
   supplied by the client.
4. Emailing a consumed / voided / expired code is rejected with a clear message.
5. The send is recorded as `internal_exam.code_emailed` in `audit_events` (best-effort:
   a failed audit write is logged, not surfaced — the email already went out).
6. Local dev without `RESEND_API_KEY` logs the email to the console instead of sending
   (so the flow is testable before domain verification).

## Non-functional / security
- `RESEND_API_KEY` is server-only — never `NEXT_PUBLIC_`.
- Input Zod-validated; generic error messages returned to the client.
- Audit write goes through a SECURITY DEFINER RPC (the `audit_events` table blocks direct
  inserts via `audit_no_direct_insert`).

## Out of scope (v1)
- Batch / multi-student send and a "resend" button on the codes table.
- Server-side send idempotency (client disables the button + "Sent" state; an `emailed_at`
  column is a possible future addition).

## Out-of-band (admin, not code)
- Create Resend account; verify sending domain (SPF + DKIM DNS alongside Proton MX);
  set `RESEND_API_KEY` + `EMAIL_FROM` in env.
