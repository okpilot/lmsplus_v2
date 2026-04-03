# Product Overview — LMS Plus v2

## Product Purpose

LMS Plus v2 is a training platform for EASA PPL(A) (Private Pilot Licence — Aeroplane) candidates, built for Aviation Training Organisations (ATOs). It replaces fragmented tooling (spreadsheets, standalone quiz apps, paper attendance) with a single web application covering question bank training, lesson delivery, and LMS administration.

The primary competitive baseline is Aviationexam. LMS Plus differentiates by offering organisation-level management (multi-tenant, admin tools, CAA audit trail) rather than individual student subscriptions.

## Target Users

1. **Students** — PPL(A) candidates enrolled at an ATO. They use the question bank trainer to drill EASA exam questions by subject/topic, track their progress per subject, review session reports, flag questions for later review, and resume interrupted sessions. Typical class size: 10-20 students.

2. **Instructors** — Flight and ground instructors at the ATO. They review student progress and session reports, comment on questions (discussion threads), and will eventually deliver live lessons through the platform.

3. **Admins** — ATO administrators who manage the question bank (CRUD, bulk actions, image upload), manage the syllabus hierarchy (subjects/topics/subtopics), and manage student accounts (create, edit, deactivate, reset passwords). All operations are organisation-scoped.

4. **CAA Inspectors** — Civil Aviation Authority auditors who require read-only access to attendance records, exam scores, and training history for regulatory compliance. The system maintains an immutable audit trail to satisfy EASA Part ORA requirements.

## Key Features

### Shipped (MVP 2 — Question Bank Trainer)

1. **Authentication**: Email + password login with pre-created accounts (no self-registration). Password reset flow. Session recovery across deployments.

2. **Student Dashboard**: Per-subject progress cards with colour-coded mastery bars (red/amber/green), 31-day activity heatmap, exam readiness score (X/9 subjects at 90%+), daily question goal tracker, study streak counter.

3. **Quiz System**: Multi-select topic tree for question selection, combinable filters (All/Unseen/Incorrect/Flagged), configurable question count (10 to All), randomised delivery, immediate per-question feedback with explanations, session reports with score breakdown.

4. **Quiz Drafts & Recovery**: Save up to 20 incomplete quizzes as drafts. Automatic localStorage checkpointing on every answer. Recovery prompt on page refresh or deployment. Feedback state persisted across resume.

5. **Question Flagging**: Persistent per-student flags on questions, filterable in quiz setup. Stored in `flagged_questions` table.

6. **Admin Syllabus Manager**: CRUD for EASA PPL subject/topic/subtopic hierarchy.

7. **Admin Question Editor**: Full CRUD with cascading syllabus filters, difficulty/status controls, image upload to Supabase Storage (org-scoped paths), bulk activate/deactivate.

8. **Admin Student Manager**: Create/edit/deactivate students and instructors, password reset with must-change flag, role assignment, status filtering, name/email search. All operations org-scoped.

9. **Student Settings**: Profile view, display name editing, password change, quiz statistics.

10. **GDPR Compliance**: First-login consent gate with versioned TOS/privacy acceptance, immutable consent audit trail (`user_consents` table), self-service JSON data export, admin data export per student, EASA Part ORA retention exemption documented in privacy policy.

### Planned (Fast-Follow)

11. **Mock Exam Mode**: Timed exam simulation matching EASA exam conditions.
12. **Lesson Builder (MVP 1)**: Composable mini-lessons, live board, instructor tools, attendance, exercises, course enrollment.
13. **Improvement Trend Charts**: Historical progress visualisation.
14. **AI Tutor**: "Explain this question" via Claude API.
15. **Weak Area Recommendations**: Algorithmic identification of topics needing review.
16. **Offline Mode**: Service worker caching for use in areas with poor connectivity.

## Business Objectives

- **Replace fragmented ATO tooling** with a single platform that covers question bank training, lesson delivery, and student management under one login.
- **Multi-tenant SaaS model** — each ATO operates in an isolated tenant (organisation_id on every table, RLS-enforced). One deployment serves multiple organisations.
- **CAA audit readiness** — immutable audit trail (append-only `audit_events`, `student_responses`, `quiz_session_answers` tables) satisfies EASA Part ORA record-keeping requirements without manual effort.
- **Reduce student onboarding friction** — pre-created accounts mean students start training immediately without self-registration or payment flows.

## Success Metrics

- **Question bank coverage**: All 9 EASA PPL subjects populated with questions, students actively using all subjects.
- **Session completion rate**: Percentage of started quiz sessions that reach submission (not abandoned or left as drafts).
- **Exam readiness progression**: Students reaching 90%+ mastery across all 9 subjects over their training period.
- **Daily engagement**: Students meeting the 50-question daily goal (tracked via Questions Today stat card).
- **Admin efficiency**: Time to onboard a new student (create account, assign to organisation) under 2 minutes.
- **Audit compliance**: Zero manual intervention required to produce CAA-requested training records.

## Product Principles

1. **Compliance-first**: Every design decision considers CAA audit requirements. Training records are immutable. Soft-delete preserves full history. GDPR consent is versioned and auditable. The system must be defensible under regulatory inspection without manual record reconstruction.

2. **Server-side security, never trust the client**: Correct answers are stripped server-side via the `get_quiz_questions()` RPC — they never reach the browser. All mutations go through Server Actions with Zod validation. RLS policies enforce tenant isolation at the database level. The UI is a presentation layer, not a security boundary.

3. **Immediate feedback over deferred review**: Students see whether each answer is correct immediately after submission, with explanations and images. This matches evidence-based learning principles and differentiates from exam-only tools that withhold feedback until the end.

4. **Mobile-responsive by default**: Students study on phones between flights. Every view must work on mobile without horizontal scrolling. Bottom tab bar navigation on small screens, collapsible sidebar on desktop.

5. **Resilience over perfection**: Quiz sessions survive page refreshes, deployments, and network interruptions via localStorage checkpointing and draft persistence. A student should never lose progress due to a technical event.

## Monitoring & Visibility

- **Dashboard type**: Web-based, server-rendered (Next.js App Router with Server Components).
- **Student dashboard**: Real-time progress stats (exam readiness, daily goal, streak, per-subject mastery) computed on each page load from the database. 31-day activity heatmap.
- **Admin visibility**: Filtered student list with status/role/search, per-student data export (JSON), question bank management with bulk operations.
- **Session reports**: Per-quiz breakdown showing each question, selected answer, correct answer, and explanation. Accessible from session history.
- **Audit trail**: Immutable `audit_events` table records login, quiz submission, consent, and administrative actions. Queryable for CAA inspection.
- **Error tracking**: Sentry integration with error boundaries, source maps, and 10% trace sampling.

## Future Vision

### Potential Enhancements

- **Live Lessons (MVP 1)**: Composable mini-lessons with instructor-led live board, attendance tracking, in-lesson exercises, and course enrollment. HTML content rendered in iframes with lean JSON sidecar for app features.
- **Mock Exam Mode**: Timed EASA exam simulation with subject-weighted question distribution, matching real exam conditions. Score reports comparable to official pass thresholds.
- **AI Tutor**: Per-question "Explain this" button powered by Claude API. Contextual explanations that reference the specific question, options, and relevant EASA syllabus material.
- **Analytics & Trends**: Historical progress charts per subject, comparative performance across cohorts, instructor-facing class overview dashboards.
- **Weak Area Engine**: Algorithmic identification of topics where a student underperforms relative to their overall level. Targeted practice session generation.
- **Offline Mode**: Service worker caching for question bank access in low-connectivity environments (common at airfields). Sync answers when back online.
- **Multi-org Admin Portal**: Cross-organisation view for ATO chains or training consortiums managing multiple locations.
- **CAA Inspector Portal**: Read-only access with pre-built compliance reports (attendance summaries, exam score distributions, training hour logs) exportable as PDF.
