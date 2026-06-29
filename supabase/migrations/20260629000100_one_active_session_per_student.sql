-- Migration 136: enforce ONE active quiz_sessions row per student, globally,
-- and admit the new 'discovery' mode (#1011).
--
-- Why (#1011 answer-key oracle): Discovery / practice surfaces reveal answer
-- keys (get_study_questions, check_quiz_answer). An exam graded from the SAME
-- org MC pool running CONCURRENTLY beside an answer-revealing session lets a
-- student read keys mid-exam. The mid-exam guards (check_quiz_answer mig 117,
-- get_study_questions mig 135) already deny answer reveal while an exam is
-- active, but the cleanest structural invariant is: a student may hold at most
-- ONE active session across ALL modes. This migration adds the schema-level
-- guard; the start RPCs (migs 137-141) add the matching pre-INSERT guards.
--
-- Three things, in order:
--   1. Widen the mode CHECK to include 'discovery' (Discovery becomes a real
--      ephemeral session — see start_discovery_session, mig 137).
--   2. One-time dedup of any pre-existing multi-active-session students, so the
--      UNIQUE INDEX in step 3 can build.
--   3. The global partial unique index.

-- ─── 1. mode CHECK: add 'discovery' ──────────────────────────────────────────
-- Latest definition is mig 096 (canonical name quiz_sessions_mode_check, set in
-- mig 058). Pre-Flag verified: no migration after 096 renames or redefines this
-- constraint in either migration dir.
ALTER TABLE public.quiz_sessions DROP CONSTRAINT quiz_sessions_mode_check;

ALTER TABLE public.quiz_sessions
  ADD CONSTRAINT quiz_sessions_mode_check
  CHECK (mode IN ('smart_review', 'quick_quiz', 'mock_exam', 'internal_exam', 'vfr_rt_exam', 'discovery'));

-- ─── 2. One-time dedup of existing multi-active rows ─────────────────────────
-- Runs BEFORE the UNIQUE INDEX below, which would otherwise fail to build on
-- any student already holding >1 active session. For each such student we keep
-- exactly ONE active row and soft-delete the rest. We soft-delete (deleted_at)
-- rather than end (ended_at) the losers so they stay OUT of report/grading
-- queries (all of which filter deleted_at IS NULL) and are never mislabeled as
-- a completed attempt.
--
-- Keeper priority (highest wins): internal_exam & vfr_rt_exam = 4, mock_exam =
-- 3, quick_quiz & smart_review = 2, discovery = 1; ties broken by newest
-- started_at. Priority DESC guarantees the highest-priority (exam) active row
-- is NEVER the one sacrificed — an in-flight exam always survives over a
-- lingering practice/discovery session. started_at is NOT NULL (mig 001
-- DEFAULT now()), so the tie-break is total. This is a one-time cleanup of
-- legacy state; the per-RPC guards (migs 137-141) prevent the condition going
-- forward.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY student_id
           ORDER BY
             CASE mode
               WHEN 'internal_exam' THEN 4
               WHEN 'vfr_rt_exam'   THEN 4
               WHEN 'mock_exam'     THEN 3
               WHEN 'quick_quiz'    THEN 2
               WHEN 'smart_review'  THEN 2
               WHEN 'discovery'     THEN 1
               ELSE 0
             END DESC,
             started_at DESC
         ) AS rn
  FROM public.quiz_sessions
  WHERE ended_at IS NULL
    AND deleted_at IS NULL
)
UPDATE public.quiz_sessions qs
SET deleted_at = now()
FROM ranked
WHERE qs.id = ranked.id
  AND ranked.rn > 1;

-- ─── 3. Global single-active-session unique index ────────────────────────────
-- At most one active (ended_at IS NULL AND deleted_at IS NULL) session per
-- student, across every mode. Subsumes the three per-mode partial indexes
-- (uq_active_exam_session mig 088, uq_internal_exam_session_active mig 069,
-- uq_vfr_rt_exam_session_active mig 096); those are LEFT IN PLACE so the
-- per-RPC unique_violation handlers keep mapping a same-subject race to their
-- specific friendly message.
--
-- NON-CONCURRENT: this CREATE UNIQUE INDEX runs inside the `db push`
-- transaction, so it takes an ACCESS EXCLUSIVE lock and does a full table scan
-- to build. Acceptable — quiz_sessions is modest, and this mirrors the three
-- existing partial indexes above (none of which are CONCURRENT either).
CREATE UNIQUE INDEX uq_one_active_session_per_student
  ON public.quiz_sessions (student_id)
  WHERE ended_at IS NULL AND deleted_at IS NULL;
