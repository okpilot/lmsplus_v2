# Design — Exam Mode (#180, #260)

## Overview

Two-part feature: (1) Admin configures exam parameters per subject, (2) Students take timed practice exams. PR1 covers admin config + DB; PR2 covers student experience.

## Paper Design Reference (4 frames from #180)

- Desktop — Exam Setup (1440x900)
- Desktop — Exam Session (1440x900)
- Mobile — Exam Setup (390x844)
- Mobile — Exam Session (390x844)

---

## PR1: Admin Exam Config

### Subject List View

```
┌─────────────────────────────────────────────────────────────────┐
│  Exam Configuration                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ [010] Air Law                    16 Q · 30 min · 75%  ✓│    │  ← enabled (green check)
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ [020] Airframe                   —  Not configured     ✗│    │  ← disabled (gray X)
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ [050] Meteorology                16 Q · 30 min · 75%  ✓│    │
│  └─────────────────────────────────────────────────────────┘    │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

Each subject card is clickable → opens config dialog.

### Config Form Dialog

```
┌──────────────────────────────────────────────────────────┐
│  Configure Exam — 010 Air Law                        [X] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ☑ Enable exam mode for this subject                     │
│                                                          │
│  Total Questions  [ 16  ]                                │
│  Time Limit       [ 30  ] minutes                        │
│  Pass Mark        [ 75  ] %                              │
│                                                          │
│  ── Question Distribution ──────────────────────────     │
│                                                          │
│  Topic                              Questions  Available │
│  ┌────────────────────────────────────────────────┐      │
│  │ 010.01 International Law            [  4 ]  12 │      │
│  │ 010.02 Airworthiness                [  3 ]   8 │      │
│  │ 010.03 Crew Licensing               [  3 ]   6 │      │
│  │ 010.04 Rules of the Air             [  3 ]  10 │      │
│  │ 010.05 ATS and Airspace             [  3 ]   9 │      │
│  └────────────────────────────────────────────────┘      │
│                                                          │
│  Total: 16 / 16  ✓  (sum must match total questions)     │
│                                                          │
│  ▸ Show subtopic breakdown (optional)                    │
│    ┌──────────────────────────────────────────────┐      │
│    │ 010.01.01 ICAO Convention       [  2 ]    5  │      │
│    │ 010.01.02 National Authorities  [  2 ]    7  │      │
│    └──────────────────────────────────────────────┘      │
│    Subtopic total: 4 / 4 (must match topic count)        │
│                                                          │
│                           [ Cancel ]  [ Save Config ]    │
└──────────────────────────────────────────────────────────┘
```

### Key UX Rules

1. "Available" column shows count of active, non-deleted questions per topic/subtopic — helps admin verify there are enough questions
2. Sum validation: topic counts must sum to total questions, subtopic counts must sum to parent topic count
3. Cannot enable exam mode without a complete distribution
4. Subtopic breakdown is optional — if not set, questions are picked randomly from the whole topic

---

## PR2: Student Exam (deferred to #514)

### Exam Setup (mode toggle → "Exam" active)
- Subject dropdown shows only exam-enabled subjects
- Filters, count slider, topic tree → HIDDEN
- Exam Parameters card shows: Questions / Time Limit / Pass Mark
- "Start Exam" button (primary blue)

### Exam Session
- Header: "EXAM" badge (red/amber pill) + subject name + "Finish Exam" button
- Countdown timer (amber, red at <5min, auto-submit on expiry)
- No tabs (question only, no explanation/comments/statistics)
- "Confirm Answer" (locks answer, no feedback)
- Question navigator: green (answered) / blue (current) / gray (unanswered) — no correct/incorrect coloring
- Amber progress bar

### Exam Results
- Pass/fail badge based on pass_mark threshold
- All correct answers revealed after completion
- "EXAM" badge on results and reports

---

## Data Models

### exam_configs
```
id               UUID PK
organization_id  UUID FK → organizations
subject_id       UUID FK → easa_subjects
enabled          BOOLEAN DEFAULT false
total_questions  INT NOT NULL
time_limit_seconds INT NOT NULL
pass_mark        INT NOT NULL  -- percentage (e.g. 75)
created_at       TIMESTAMPTZ
updated_at       TIMESTAMPTZ
deleted_at       TIMESTAMPTZ NULL

UNIQUE(organization_id, subject_id)
```

### exam_config_distributions
```
id               UUID PK
exam_config_id   UUID FK → exam_configs (ON DELETE CASCADE)
topic_id         UUID FK → easa_topics NOT NULL
subtopic_id      UUID FK → easa_subtopics NULL
question_count   INT NOT NULL CHECK (question_count > 0)

UNIQUE(exam_config_id, topic_id, subtopic_id)
```

### quiz_sessions (modified)
```
+ time_limit_seconds  INT NULL          -- null for study mode
+ passed              BOOLEAN NULL      -- null for study/incomplete
```

---

## Architecture

```
Admin Config Flow:
  admin/exam-config/page.tsx (RSC)
    → exam-config-content.tsx (RSC, queries subjects + configs)
      → exam-config-page-shell.tsx (client, state)
        → subject-config-card.tsx (per subject)
        → config-form-dialog.tsx (edit form)
          → distribution-editor.tsx (topic/subtopic question counts)

Server Actions:
  upsert-exam-config.ts  → Zod parse → requireAdmin() → upsert config + delete/re-insert distributions
  toggle-exam-config.ts  → validate distribution complete → update enabled flag

Queries:
  queries.ts → getExamConfigs() joins exam_configs + distributions + question counts per topic
```

## Existing Components to Leverage
- `requireAdmin()` from `lib/auth/require-admin.ts`
- Dialog pattern from admin questions (`question-form-dialog.tsx`)
- Table/card pattern from admin syllabus
- Zod schemas in `packages/db/src/schema.ts`
- `revalidatePath` pattern from all admin actions

## Error Handling

| Scenario | Handling | User Impact |
|----------|----------|-------------|
| Distribution sum != total | Client-side validation blocks save | Red error text, save button disabled |
| Not enough questions per topic | "Available" column shows count, no server block | Visual warning, admin responsibility |
| Save fails (DB error) | Server Action returns `{ success: false, error }` | Toast error message |
| Concurrent edit | Optimistic concurrency not needed (single admin) | Last write wins (acceptable) |

## Testing Strategy

### Unit Tests
- Zod schema validation (config + distribution)
- Distribution sum validation logic
- Toggle validation (distribution completeness check)

### Integration Tests
- Server Actions: upsert config + distributions, toggle enable/disable
- Queries: fetch configs with joined data

### E2E (PR2)
- Full exam flow: setup → session → results → reports
