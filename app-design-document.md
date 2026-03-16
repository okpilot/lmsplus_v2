---
date: 2026-03-10
tags: [design, training-platform, user-journeys, schemas, features, mvp]
status: active
project: training-platform
---

# Training Platform — App Design Document

> User journeys → Features → Schemas. Designed from real classroom reality.

---

## Classroom Reality (Design Inputs)

These facts drive every design decision:

- **Class size:** Up to 10 students
- **Devices:** Mixed (laptops preferred, some tablets/phones)
- **Environment:** Hybrid (some in-room, some remote)
- **Session length:** 90 minutes
- **Lesson flow:** Intro → Theory → Practice → Theory → Test → Wrap-up
- **Current pain:** Verbal knowledge checks take too much time
- **Question bank:** ~3,000 questions, mixed formats (Excel, Word, PDF), aligned to EASA Learning Objectives
- **Students currently use:** Aviationexam for self-study practice
- **Compliance needs:** Attendance, progress test scores, final internal exam results
- **First auditor question:** "Show me attendance, progress tests, and final exams"

---

## User Journeys

### Journey 1: Instructor Builds a Lesson (MVP 1 — Lesson Builder)

**Persona:** Sasha, TK instructor, preparing a 90-min Meteorology lesson on Clouds.

#### Step 1 — Create New Lesson

```
Open Lesson Builder → "New Lesson" →

Metadata form:
  ├── Title: "Clouds — Classification & Formation"
  ├── Subject: Meteorology (dropdown, EASA subjects)
  ├── Learning Objectives: MET 3.2.1, MET 3.2.2, MET 3.2.3 (tag selector)
  ├── Estimated duration: 90 min
  ├── Course: PPL Meteorology (dropdown, from existing courses)
  └── Description: (optional, for instructor notes)

→ Empty lesson canvas opens
```

#### Step 2 — Build Block Sequence

The canvas shows a vertical block flow. Each block is a card that can be dragged to reorder.

```
[+ Add Block] button → Block type selector:
  ├── 📊 Presentation Block
  └── ✅ Multiple Choice Block
  (MVP ships with these two only. More types added later.)

Instructor builds this sequence:

┌─────────────────────────────────────────────────┐
│ 📊 PRESENTATION — "Introduction"                │
│    5 slides | ~10 min                           │
│    Source: Manual editor                        │
│    Slides: Welcome, Objectives, Recap last week │
│    [Edit] [Preview] [⋮ More]                    │
├─────────────────────────────────────────────────┤
│ 📊 PRESENTATION — "Cloud Types"                 │
│    12 slides | ~25 min                          │
│    Source: Uploaded from existing PPT            │
│    [Edit] [Preview] [⋮ More]                    │
├─────────────────────────────────────────────────┤
│ ✅ MULTIPLE CHOICE — "Mid-lesson Check"         │
│    5 questions | Mode: Practice                 │
│    Source: Question Bank (MET 3.2.1)            │
│    Show class results: Yes                      │
│    Time limit: None                             │
│    [Edit] [Preview] [⋮ More]                    │
├─────────────────────────────────────────────────┤
│ 📊 PRESENTATION — "Cloud Formation"             │
│    10 slides | ~20 min                          │
│    Source: AI-generated from prompt             │
│    [Edit] [Preview] [⋮ More]                    │
├─────────────────────────────────────────────────┤
│ ✅ MULTIPLE CHOICE — "Lesson Test"              │
│    10 questions | Mode: Graded ⚠️               │
│    Source: Mix (5 from bank + 5 new)            │
│    Show class results: No                       │
│    Time limit: 15 minutes                       │
│    Pass mark: 75%                               │
│    [Edit] [Preview] [⋮ More]                    │
├─────────────────────────────────────────────────┤
│ 📊 PRESENTATION — "Wrap-up"                     │
│    3 slides | ~5 min                            │
│    Summary, next lesson preview, Q&A            │
│    [Edit] [Preview] [⋮ More]                    │
└─────────────────────────────────────────────────┘

                [+ Add Block]
```

#### Step 3 — Configure a Presentation Block

Three entry points (instructor chooses per block):

**A) Manual Editor:**
- Slide-by-slide editor
- Each slide has: title, content area (rich text + images), speaker notes
- Simple layouts: title-only, title+bullets, title+image, two-column
- Drag to reorder slides within the block

**B) Upload Existing:**
- Upload PowerPoint (.pptx) or PDF
- System converts to HTML slides
- Instructor can edit the converted slides
- (MVP: basic conversion. Polish later.)

**C) AI Generate:**
- Text input: "Create slides about cloud classification per ICAO standards. Cover cumulus, stratus, cirrus families. Include typical altitudes."
- Optional: attach reference material (LO document, textbook excerpt)
- AI returns structured JSON → rendered as slides via templates
- Instructor reviews, edits, approves
- (MVP: basic prompt → slides. No reference attachments yet.)

#### Step 4 — Configure a Multiple Choice Block

**Source selection:**
- **From Question Bank:** Filter by subject → topic → subtopic → LO. Select individual questions or "auto-select N questions matching these criteria."
- **Write New:** Inline question editor. Question text, 4 options (mark correct), explanation, LO tag, difficulty. New questions are auto-saved to the question bank for reuse.
- **Mix:** Some from bank, some new.

**Configuration:**
- Mode: Practice / Graded (toggle)
- Time limit: None / Per question (e.g., 60 sec) / Total block (e.g., 15 min)
- Question order: Sequential / Randomized
- Show class results to students: Yes / No
- Show correct answer after submission: Immediately / After everyone answers / After block ends / Never (instructor reveals manually)
- Pass mark: (only if graded) percentage threshold

#### Step 5 — Preview & Save

- **Preview mode:** Plays the lesson exactly as students will see it. Instructor clicks through slides, sees MC questions, verifies flow.
- **Save:** Lesson saved to database. Status: Draft / Ready / Archived.
- **Duplicate:** Copy an existing lesson to create a variant (different LOs, different questions, same structure).

---

### Journey 2: Instructor Runs a Live Session (Future — not MVP 1, but shapes the design)

> We're not building the live player yet, but the lesson format must SUPPORT this from day one. The builder creates lessons that will eventually be played live.

```
Instructor clicks "Start Session" on a lesson →

Session lobby:
  ├── Join link / QR code displayed
  ├── Student list (who's connected)
  ├── Video conferencing active (Jitsi embed)
  └── "Begin Lesson" button

Lesson plays block by block:
  ├── Presentation blocks: Instructor controls slides.
  │   Students see slides rendered natively on their devices.
  │   No screen sharing. HTML rendered locally. Crisp on every device.
  │
  ├── Multiple Choice blocks: Students answer on their devices.
  │   Instructor sees real-time dashboard:
  │   ┌──────────────────────────────────────────────┐
  │   │  Question 3 of 5: "Which cloud type..."      │
  │   │                                               │
  │   │  Answered: 7/9 students    ⏱ 0:42            │
  │   │                                               │
  │   │  A) Cumulus      ██░░░░ 2 students            │
  │   │  B) Nimbostratus ██████████ 5 students  ✓     │
  │   │  C) Cirrus       ░░░░░░ 0 students            │
  │   │  D) Altocumulus  ░░░░░░ 0 students            │
  │   │                                               │
  │   │  ⏳ Still thinking: Maria, Tom                │
  │   │                                               │
  │   │  [Reveal Answer] [Next Question] [End Block]  │
  │   └──────────────────────────────────────────────┘
  │
  └── Session ends → All data auto-saved to LMS

Auto-recorded:
  ├── Attendance (who joined, when)
  ├── Per-question responses (every student, every answer)
  ├── Scores per block
  ├── Time spent per block
  └── Session timestamp and duration
```

---

### Journey 3: Student Practices in Question Bank Trainer (MVP 2)

**Persona:** Alex, PPL student at Sasha's ATO, studying for Meteorology exam.

#### Step 1 — Login & Dashboard

```
Alex opens Question Bank Trainer → Logs in (magic link or password) →

Dashboard:
  ┌──────────────────────────────────────────────────┐
  │  Welcome back, Alex                    PPL(A)    │
  │                                                   │
  │  📊 Overall Progress                              │
  │  ████████░░░░░░░░ 52% ready for exams             │
  │                                                   │
  │  Subjects:                                        │
  │  ✅ Air Law ................ 78% ████████░░        │
  │  🔶 Human Performance ..... 65% ██████░░░░        │
  │  🔶 Meteorology ........... 45% ████░░░░░░  ← DUE │
  │  ⬜ Communications ........ 12% █░░░░░░░░░        │
  │  ⬜ Flight Planning ........ 0% ░░░░░░░░░░        │
  │  ... (all 9 subjects)                             │
  │                                                   │
  │  🔥 Due for Review: 23 questions                  │
  │  [Start Smart Review] [Quick Quiz] [Mock Exam]    │
  └──────────────────────────────────────────────────┘
```

#### Step 2 — Practice Modes

**A) Smart Review (FSRS-powered):**
- System serves questions that are DUE based on spaced repetition schedule
- Mix of subjects, prioritizing weakest areas
- After each answer: immediate feedback + explanation
- Questions adapt: got it right → longer interval. Got it wrong → shorter interval.
- Session ends when all due reviews are done (or student stops)

**B) Quick Quiz (topic-focused):**
- Student picks: Subject → Topic → Subtopic
- Configure: number of questions (5, 10, 20), difficulty (all/easy/medium/hard)
- Questions served sequentially
- Immediate feedback after each question
- Summary at end: score, time, weakest areas

**C) Mock Exam:**
- Simulates real EASA exam conditions
- Subject-specific (e.g., Meteorology: 84 minutes, 40 questions — or whatever the real format is)
- Timer running, no feedback during exam
- Results shown at end: score, pass/fail, per-topic breakdown
- Saved as a formal exam attempt in progress records

#### Step 3 — Question Experience

```
┌──────────────────────────────────────────────────┐
│  Meteorology > 3. Clouds > 3.2 Classification    │
│  Question 7 of 20                    ⏱ 1:23      │
│                                                   │
│  Which cloud type is associated with              │
│  continuous precipitation?                        │
│                                                   │
│  ○ A) Cumulus                                     │
│  ● B) Nimbostratus                                │
│  ○ C) Cirrus                                      │
│  ○ D) Altocumulus                                 │
│                                                   │
│                              [Submit Answer]      │
└──────────────────────────────────────────────────┘

After submit:

┌──────────────────────────────────────────────────┐
│  ✅ Correct!                                      │
│                                                   │
│  Nimbostratus is a thick, grey, layered cloud     │
│  that produces continuous (not showery)            │
│  precipitation. It typically extends from low      │
│  levels up to the middle troposphere.             │
│                                                   │
│  📎 Reference: EASA LO MET 3.2.1                 │
│                                                   │
│  Your history: ✅✅❌✅ (3/4 = 75%)               │
│                                                   │
│                         [Next Question →]         │
└──────────────────────────────────────────────────┘
```

#### Step 4 — Progress Tracking

```
Student can view at any time:

Per-subject breakdown:
  Meteorology: 45% mastery
  ├── 1. The Atmosphere .......... 82% ✅
  ├── 2. Wind .................... 71% 🔶
  ├── 3. Clouds .................. 38% ❌ ← Weak area
  │   ├── 3.1 Formation ......... 50%
  │   ├── 3.2 Classification .... 25%  ← Weakest subtopic
  │   └── 3.3 Weather assoc. .... 40%
  ├── 4. Fronts .................. 0%  ⬜ Not started
  └── ...

Session history:
  Today: 45 questions, 73% correct, 32 min
  Yesterday: 30 questions, 68% correct, 25 min
  This week: 180 questions, 71% average

Improvement trend: ↗️ +5% over last 2 weeks
```

---

### Journey 4: Instructor Manages Question Bank (Shared between MVP 1 & MVP 2)

```
Instructor opens Question Bank Manager →

┌──────────────────────────────────────────────────┐
│  Question Bank                    3,042 questions │
│                                                   │
│  Filter: [Subject ▼] [Topic ▼] [Difficulty ▼]    │
│  Search: [________________________] 🔍            │
│                                                   │
│  [+ New Question]  [Import Questions]  [Export]   │
│                                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │ MET-003-042 | Meteorology > Clouds > 3.2     │ │
│  │ "Which cloud type is associated with..."      │ │
│  │ Difficulty: Medium | Used in: 3 lessons       │ │
│  │ Student accuracy: 68% (across all attempts)   │ │
│  │ [Edit] [Preview] [Usage Stats]                │ │
│  ├──────────────────────────────────────────────┤ │
│  │ MET-003-043 | Meteorology > Clouds > 3.2     │ │
│  │ "At what altitude range..."                   │ │
│  │ Difficulty: Hard | Used in: 1 lesson          │ │
│  │ Student accuracy: 42%                         │ │
│  │ [Edit] [Preview] [Usage Stats]                │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘

Import flow (for the 3,000 existing questions):
  Upload file(s) → System detects format →
  Preview parsed questions → Fix any parsing errors →
  Map columns/fields to our schema →
  Tag with subject/topic/LO →
  Import to bank
```

---

## Feature Specs

### MVP 1: Lesson Builder — Feature List

**Core Features (must ship):**

| Feature | Description | Priority |
|---------|------------|----------|
| Lesson CRUD | Create, read, update, delete lessons | P0 |
| Lesson metadata | Title, subject, LOs, duration, course, description, status | P0 |
| Block sequence editor | Vertical list of blocks, drag-to-reorder, add/remove blocks | P0 |
| Presentation block — manual editor | Slide editor with title, content, speaker notes. Basic layouts. | P0 |
| Multiple Choice block — inline questions | Write questions directly in the block | P0 |
| Multiple Choice block — pull from bank | Select questions from shared question bank by LO/topic | P0 |
| MC block configuration | Mode (practice/graded), time limit, question order, show results, show answers, pass mark | P0 |
| Preview mode | Play through lesson as student would see it | P0 |
| Question Bank CRUD | Create, edit, delete questions | P0 |
| Question Bank browser | Filter by subject/topic/subtopic/LO/difficulty, search | P0 |
| Auth — instructor login | Supabase Auth, magic link or email/password | P0 |
| Multi-tenant data model | organization_id on everything, RLS policies | P0 |

**Fast-Follow Features (soon after MVP, but not blocking launch):**

| Feature | Description |
|---------|------------|
| Presentation block — upload PPT/PDF | Convert existing slides to HTML |
| Presentation block — AI generation | Prompt → structured JSON → rendered slides |
| Question bank import | Upload Excel/Word/PDF → parse → import to bank |
| Question bank export | Export to JSON/CSV for backup |
| Lesson duplication | Copy lesson to create variants |
| Lesson versioning | Track changes between versions |

### MVP 2: Question Bank Trainer — Feature List

**Core Features (must ship):**

| Feature | Description | Priority |
|---------|------------|----------|
| Student auth | Supabase Auth, magic link or email/password | P0 |
| Student dashboard | Overall progress, per-subject breakdown, due reviews count | P0 |
| Smart Review mode | FSRS-powered spaced repetition across all subjects | P0 |
| Quick Quiz mode | Pick subject/topic, configure count/difficulty, practice | P0 |
| Question display | Question text, 4 options, submit, feedback + explanation | P0 |
| Immediate feedback | Correct/incorrect, explanation, LO reference, personal history | P0 |
| Progress tracking — per subject/topic | Mastery percentage, weak areas highlighted | P0 |
| Session history | Questions attempted, scores, time, per-session records | P0 |
| Multi-tenant data model | Same as MVP 1 — shared Supabase | P0 |

**Fast-Follow Features:**

| Feature | Description |
|---------|------------|
| Mock Exam mode | Timed, exam conditions, formal result record |
| Improvement trends | Charts showing progress over time |
| AI tutor | "Explain this question" → Claude API call for on-demand help |
| Weak area recommendations | "You should focus on MET 3.2 — here's a targeted quiz" |
| Offline mode | Cache questions on device, sync progress when back online |

---

## Derived Schemas

### 1. Question JSON Schema

```jsonc
{
  // Identity
  "id": "uuid",                        // Unique question ID
  "organization_id": "uuid",           // Multi-tenant scope
  "bank_id": "uuid",                   // Which question bank this belongs to
  
  // Classification (aligned to EASA LO structure)
  "subject": "meteorology",            // EASA subject (9 for PPL)
  "topic": "3",                        // Topic number
  "topic_name": "Clouds",              // Human-readable
  "subtopic": "3.2",                   // Subtopic number
  "subtopic_name": "Cloud classification",
  "learning_objectives": ["MET 3.2.1", "MET 3.2.2"],  // Array — question may cover multiple LOs
  
  // Content
  "type": "multiple_choice",           // For now only MC, but extensible
  "question_text": "Which cloud type is associated with continuous precipitation?",
  "options": [
    { "id": "a", "text": "Cumulus", "correct": false },
    { "id": "b", "text": "Nimbostratus", "correct": true },
    { "id": "c", "text": "Cirrus", "correct": false },
    { "id": "d", "text": "Altocumulus", "correct": false }
  ],
  "explanation": "Nimbostratus is a thick, grey, layered cloud that produces continuous (not showery) precipitation...",
  "image_url": null,                   // Optional image attachment
  
  // Metadata
  "difficulty": "medium",              // easy | medium | hard
  "references": ["EASA LO MET 3.2.1", "Oxford ATPL Book 3, Ch.5"],
  "tags": ["clouds", "precipitation", "nimbostratus"],
  
  // Tracking
  "created_by": "uuid",               // Instructor who created it
  "created_at": "2026-03-10T14:00:00Z",
  "updated_at": "2026-03-10T14:00:00Z",
  "version": 1,
  "status": "active"                   // active | archived | draft
}
```

### 2. Lesson JSON Schema

```jsonc
{
  // Identity
  "id": "uuid",
  "organization_id": "uuid",
  "course_id": "uuid",                // Which course this lesson belongs to
  
  // Metadata
  "title": "Clouds — Classification & Formation",
  "description": "Introduction to cloud types, formation processes, and weather associations.",
  "subject": "meteorology",
  "learning_objectives": ["MET 3.2.1", "MET 3.2.2", "MET 3.2.3"],
  "estimated_duration_minutes": 90,
  "status": "ready",                   // draft | ready | archived
  
  // The block sequence — this is the heart of the lesson
  "blocks": [
    {
      "id": "uuid",
      "type": "presentation",
      "position": 0,                   // Order in sequence
      "title": "Introduction",
      "config": {
        "estimated_minutes": 10
      },
      "content": {
        "slides": [
          {
            "id": "uuid",
            "layout": "title-and-bullets",  // title-only | title-and-bullets | title-and-image | two-column
            "title": "Today's Lesson: Clouds",
            "body": ["Cloud classification (ICAO)", "Formation processes", "Weather associations"],
            "image_url": null,
            "speaker_notes": "Welcome students. Quick recap of last week's wind topic."
          },
          {
            "id": "uuid",
            "layout": "title-and-bullets",
            "title": "Learning Objectives",
            "body": ["MET 3.2.1: Classify clouds by type and altitude", "MET 3.2.2: Explain formation processes"],
            "image_url": null,
            "speaker_notes": ""
          }
        ]
      }
    },
    {
      "id": "uuid",
      "type": "multiple_choice",
      "position": 1,
      "title": "Mid-lesson Check",
      "config": {
        "mode": "practice",            // practice | graded
        "time_limit": null,            // null = no limit, or seconds
        "time_limit_type": null,       // null | "per_question" | "total"
        "question_order": "sequential",// sequential | randomized
        "show_class_results": true,    // Whether students see each other's answers
        "show_correct_answer": "after_each", // "after_each" | "after_all" | "after_block" | "manual"
        "pass_mark": null              // null for practice, 0-100 for graded
      },
      "content": {
        "questions": [
          // Either inline question objects (same schema as Question Bank)
          // OR references to question bank:
          { "source": "bank", "question_id": "uuid" },
          { "source": "bank", "question_id": "uuid" },
          { "source": "inline", "question": { /* full question object */ } }
        ]
      }
    }
    // ... more blocks
  ],
  
  // Schema versioning
  "schema_version": "1.0.0",          // For forward compatibility
  
  // Tracking
  "created_by": "uuid",
  "created_at": "2026-03-10T14:00:00Z",
  "updated_at": "2026-03-10T14:00:00Z",
  "version": 1
}
```

### 3. Database Schema (Supabase / Postgres)

```
ORGANIZATIONS
├── id (uuid, PK)
├── name
├── slug (unique, for URLs)
├── created_at
└── settings (jsonb — org-level config)

USERS
├── id (uuid, PK — matches Supabase Auth user)
├── organization_id (FK → organizations)
├── email
├── full_name
├── role (enum: admin | instructor | student)
├── created_at
└── last_active_at

COURSES
├── id (uuid, PK)
├── organization_id (FK)
├── title (e.g., "PPL Meteorology")
├── subject
├── description
├── status (draft | active | archived)
├── created_by (FK → users)
└── created_at

LESSONS
├── id (uuid, PK)
├── organization_id (FK)
├── course_id (FK → courses)
├── title
├── subject
├── learning_objectives (text[])
├── estimated_duration_minutes (int)
├── content (jsonb — the full lesson JSON with blocks)
├── status (draft | ready | archived)
├── schema_version (text)
├── version (int)
├── created_by (FK → users)
├── created_at
└── updated_at

QUESTION_BANKS
├── id (uuid, PK)
├── organization_id (FK)
├── name (e.g., "PPL Question Bank 2026")
├── description
├── created_by (FK → users)
└── created_at

QUESTIONS
├── id (uuid, PK)
├── organization_id (FK)
├── bank_id (FK → question_banks)
├── subject
├── topic
├── topic_name
├── subtopic
├── subtopic_name
├── learning_objectives (text[])
├── type (enum: multiple_choice — extensible later)
├── question_text
├── options (jsonb — array of {id, text, correct})
├── explanation
├── image_url (nullable)
├── difficulty (enum: easy | medium | hard)
├── references (text[])
├── tags (text[])
├── status (active | archived | draft)
├── version (int)
├── created_by (FK → users)
├── created_at
└── updated_at

SESSIONS (live classroom sessions — future, but schema ready)
├── id (uuid, PK)
├── organization_id (FK)
├── lesson_id (FK → lessons)
├── instructor_id (FK → users)
├── status (enum: scheduled | live | completed | cancelled)
├── started_at
├── ended_at
├── current_block_index (int — where in the lesson we are)
└── created_at

SESSION_ATTENDANCE
├── id (uuid, PK)
├── session_id (FK → sessions)
├── student_id (FK → users)
├── joined_at
├── left_at (nullable — null if still connected)
└── duration_minutes (computed)

STUDENT_RESPONSES (every answer to every question, everywhere)
├── id (uuid, PK)
├── organization_id (FK)
├── student_id (FK → users)
├── question_id (FK → questions)
├── context_type (enum: lesson_session | question_bank | mock_exam)
├── context_id (uuid — session_id or quiz_session_id)
├── block_id (nullable — which lesson block, if from a lesson)
├── selected_option_id (text — "a", "b", "c", "d")
├── is_correct (boolean)
├── response_time_seconds (int)
├── created_at
└── -- No updated_at: responses are immutable

FSRS_REVIEW_STATE (spaced repetition state per student per question)
├── id (uuid, PK)
├── student_id (FK → users)
├── question_id (FK → questions)
├── stability (float — FSRS parameter)
├── difficulty (float — FSRS parameter)
├── due_date (timestamp — when to show this question again)
├── last_review_date (timestamp)
├── review_count (int)
├── lapse_count (int — times forgotten)
├── state (enum: new | learning | review | relearning)
└── updated_at

QUIZ_SESSIONS (Question Bank Trainer practice sessions)
├── id (uuid, PK)
├── organization_id (FK)
├── student_id (FK → users)
├── mode (enum: smart_review | quick_quiz | mock_exam)
├── subject (nullable — null for smart_review which is cross-subject)
├── topic (nullable)
├── config (jsonb — quiz settings: count, difficulty filter, etc.)
├── started_at
├── ended_at
├── total_questions (int)
├── correct_count (int)
├── score_percentage (decimal)
└── created_at

STUDENT_PROGRESS (materialized/computed view — per student per subject)
├── id (uuid, PK)
├── organization_id (FK)
├── student_id (FK → users)
├── subject
├── topic (nullable — null for subject-level aggregate)
├── subtopic (nullable)
├── total_questions_seen (int)
├── total_correct (int)
├── mastery_percentage (decimal)
├── last_activity_at (timestamp)
└── updated_at

RLS POLICIES (applied to every table):
  - All queries filtered by organization_id
  - Students can only see their own responses and progress
  - Instructors can see all student data within their organization
  - Admins have full access within their organization
  - No cross-organization data access ever
```

### 4. EASA Subject/Topic Structure (Reference Data)

```jsonc
// Seed data — the EASA PPL subject tree
// This is used for dropdowns, filters, and LO tagging throughout the platform
{
  "subjects": [
    {
      "code": "010",
      "name": "Air Law",
      "short": "ALW",
      "topics": [
        { "number": "1", "name": "International law and organisations" },
        { "number": "2", "name": "Airworthiness of aircraft" },
        // ... etc
      ]
    },
    {
      "code": "040",
      "name": "Human Performance",
      "short": "HPF",
      "topics": [ /* ... */ ]
    },
    {
      "code": "050",
      "name": "Meteorology",
      "short": "MET",
      "topics": [
        { "number": "1", "name": "The atmosphere" },
        { "number": "2", "name": "Wind" },
        { "number": "3", "name": "Clouds", 
          "subtopics": [
            { "number": "3.1", "name": "Cloud formation" },
            { "number": "3.2", "name": "Cloud classification" },
            { "number": "3.3", "name": "Weather associated with clouds" }
          ]
        },
        // ...
      ]
    },
    // ... all 9 subjects
    { "code": "060", "name": "Navigation", "short": "NAV" },
    { "code": "070", "name": "Operational Procedures", "short": "OPS" },
    { "code": "080", "name": "Principles of Flight", "short": "POF" },
    { "code": "090", "name": "Communications", "short": "COM" },
    { "code": "030", "name": "Flight Planning & Performance", "short": "FPP" },
    { "code": "020", "name": "Aircraft General Knowledge", "short": "AGK" }
  ]
}
```

---

## Architecture Notes

### What Gets Stored Where

| Data | Storage | Why |
|------|---------|-----|
| Lesson structure (blocks, slides, config) | Postgres JSONB column in `lessons.content` | Flexible schema, easy to version, Claude Code can generate/manipulate |
| Questions | Postgres structured columns + JSONB for options | Needs relational queries (filter by subject, difficulty, LO) |
| Student responses | Postgres rows | Every answer is a row. Need fast queries for dashboards. Immutable. |
| FSRS state | Postgres rows | Per-student per-question. Updated on every review. |
| Slide images/media | Supabase Storage | Files served via CDN. Referenced by URL in lesson JSON. |
| User auth | Supabase Auth | Built-in, handles magic links, sessions, JWT tokens |
| Real-time (live sessions) | Supabase Realtime | Future: instructor slide changes → student devices via subscriptions |

### Multi-Tenant Model

```
Every query includes: WHERE organization_id = auth.org_id()

Supabase RLS policy (applied to every table):
  CREATE POLICY "tenant_isolation" ON table_name
    USING (organization_id = (
      SELECT organization_id FROM users WHERE id = auth.uid()
    ));
```

This means:
- Data is physically shared (one database) but logically isolated
- A student at ATO-A can never see ATO-B's questions, lessons, or student data
- An instructor at ATO-A can only manage their own ATO's content
- Scaling to commercial (multiple ATOs) requires zero schema changes

---

*Design document created: 2026-03-10 | Status: Ready for review*
