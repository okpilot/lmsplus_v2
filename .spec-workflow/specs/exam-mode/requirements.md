# Requirements — Exam Mode (#180, #260)

## Introduction

Practice Exam Mode simulates real EASA PPL(A) exam conditions. Admins configure per-subject exam parameters (question count, time limit, pass mark, topic distribution). Students take timed exams with no feedback until submission. Covers admin configuration UI, student exam session, and backend enforcement.

## Alignment with Product Vision

Core training feature — students need realistic exam practice to prepare for EASA PPL(A) exams. Admin-configurable parameters allow the platform to match official exam specifications exactly.

## Requirements

### R1: Admin Exam Configuration

**User Story:** As an admin, I want to configure exam parameters per subject, so that practice exams match official EASA specifications.

#### Acceptance Criteria

1. WHEN admin navigates to /app/admin/exam-config THEN system SHALL display all subjects with their exam config status (enabled/disabled)
2. WHEN admin selects a subject THEN system SHALL show a form with: enabled toggle, total questions, time limit (minutes), pass mark (%)
3. WHEN admin configures a subject THEN system SHALL show a distribution editor listing all topics under that subject
4. WHEN admin sets question counts per topic THEN system SHALL validate that the sum equals total questions
5. WHEN admin optionally sets subtopic-level distribution THEN system SHALL validate subtopic counts sum to the parent topic count
6. WHEN admin enables exam mode for a subject THEN system SHALL validate that a complete distribution exists
7. WHEN admin saves config THEN system SHALL persist to `exam_configs` + `exam_config_distributions` tables
8. WHEN admin disables exam mode THEN system SHALL set `enabled = false` (soft-disable, config preserved)

### R2: Student Exam Setup

**User Story:** As a student, I want to start a practice exam for a subject, so that I can prepare under realistic conditions.

#### Acceptance Criteria

1. WHEN student selects "Exam" mode toggle THEN system SHALL show only subjects with exam mode enabled
2. WHEN student selects a subject in exam mode THEN system SHALL display exam parameters (questions, time, pass mark) from admin config
3. WHEN student clicks "Start Exam" THEN system SHALL create a session with mode='mock_exam', randomly select questions per distribution config, and set time_limit_seconds
4. WHEN selecting questions THEN system SHALL pick randomly from each topic/subtopic per the distribution, using only active (non-deleted, status='active') questions

### R3: Exam Session Behavior

**User Story:** As a student, I want the exam session to simulate real conditions, so that my practice is realistic.

#### Acceptance Criteria

1. WHEN exam session starts THEN system SHALL show a countdown timer (not elapsed)
2. WHEN timer has <5 minutes remaining THEN timer SHALL turn red as warning
3. WHEN timer expires THEN system SHALL auto-submit all answered questions
4. WHEN student answers a question THEN system SHALL NOT show correct/incorrect feedback
5. WHEN exam is active THEN system SHALL hide Explanation, Comments, and Statistics tabs
6. WHEN student clicks "Confirm Answer" THEN system SHALL lock the answer without revealing correctness
7. WHEN student clicks "Finish Exam" THEN system SHALL require confirmation and submit all answers
8. WHEN exam header displays THEN system SHALL show "EXAM" badge (red/amber) + subject name + countdown

### R4: Exam Results

**User Story:** As a student, I want to see my exam results with pass/fail status, so that I know if I'm ready.

#### Acceptance Criteria

1. WHEN exam completes THEN system SHALL display pass/fail based on pass mark threshold from config
2. WHEN showing results THEN system SHALL reveal all correct answers and explanations
3. WHEN showing results THEN system SHALL display "EXAM" badge on results page
4. WHEN exam session appears in Reports THEN system SHALL show "EXAM" mode badge

### R5: Full Submission Guard (#260)

**User Story:** As the system, I want to enforce complete submission in exam mode, so that exam integrity is maintained.

#### Acceptance Criteria

1. WHEN batch_submit_quiz is called for exam mode THEN system SHALL verify all questions are answered
2. IF exam mode AND answer count != total questions THEN system SHALL raise an exception
3. WHEN study mode THEN system SHALL continue to allow partial submissions (existing behavior)

### R6: Pass/Fail Storage

**User Story:** As the system, I want to store pass/fail results, so that reporting can show exam outcomes.

#### Acceptance Criteria

1. WHEN exam completes THEN system SHALL compute `passed = score_percentage >= pass_mark` and store in `quiz_sessions.passed`
2. WHEN study mode completes THEN `passed` SHALL remain NULL

## Non-Functional Requirements

### Security
- Admin-only access to exam config (requireAdmin() + RLS)
- Students cannot read exam_config_distributions (prevents gaming question selection)
- Questions still served via get_quiz_questions() RPC (correct answers stripped)
- Time enforcement server-side (started_at + time_limit_seconds)

### Performance
- Random question selection must be efficient (single RPC, not N queries)
- Exam config page loads in <500ms

### Reliability
- Auto-submit on timer expiry must be resilient (client-side trigger + server-side validation)
- Session recovery (localStorage) must work for exam mode too
