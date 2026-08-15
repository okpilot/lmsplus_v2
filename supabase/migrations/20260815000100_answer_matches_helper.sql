-- Migration 158: tolerate spelling slips when grading typed answers (1 of 3).
--
-- A student who knows the phrase should not lose the mark to a keystroke: eval 2026-08-15 marked
-- "crossing of airfiled approved" wrong against "crossing of airfield approved". Grading compared
-- normalised strings for exact equality, so any typo failed.
--
-- Typo tolerance cannot live in normalize_answer(): normalisation produces a canonical form for ONE
-- string, whereas "is this a typo of that" is a pairwise question. So it goes in a comparison
-- helper, and every grader is repointed at it. All four text graders are changed together, across
-- migrations 158/159/160 — security.md rule 12 (sibling guard-set consistency): if only some
-- tolerated typos, the same answer would score in practice and fail in the exam.
--
-- DIGITS ARE NEVER FUZZY. In this domain a one-character difference is a different clearance, not a
-- slip: QNH 1014 vs 1015, runway 33 vs 32, squawk 6503 vs 6502, 118.0 vs 118.5. Any token
-- containing a digit must match exactly. Passing a wrong altimeter setting as correct is the one
-- outcome this feature must never produce.
--
-- Thresholds were measured, not guessed (fuzzystrmatch levenshtein, 2026-08-15):
--   lift/left = 1 and base/case = 1  -> 4-character words are one edit from a DIFFERENT word,
--                                       so a CANDIDATE word under 5 characters is never
--                                       fuzzy-matched. The floor reads the candidate (wb) only,
--                                       so a shorter STUDENT token can still match a 5+ candidate
--                                       (answer_matches('limb','climb') is true).
--   ONE edit per word is the whole allowance, from 5 characters up. There is deliberately NO
--     wider tier for long words: prefix negation (un-/in-/de-/dis-) is exactly 2 edits at length
--     >= 8, so a 2-edit tier would accept runway serviceable / runway UNserviceable, and likewise
--     northbound/southbound and increase/decrease. Those are live ICAO phraseology, not typos.
--   sigth/sight = 2 by raw levenshtein but is a single ADJACENT SWAP, counted as ONE edit by the
--     swap reduction below -> the commonest typo of all still matches at 5 characters.
--   airfiled/airfield -- the eval case that prompted this -- is also an adjacent swap, so it
--     passes through that same reduction, not through any 2-edit tier.
-- A whole-answer budget of 2 stops a long phrase accumulating many small errors: at most two
-- single-edit words per answer.
--
-- Split into three migrations to stay inside the code-style.md §1 size caps. The set must land
-- together: applying only some of them splits practice grading from exam grading, which is the
-- exact inconsistency security.md rule 12 forbids.
--   158 (this file) answer_matches (new) + _grade_record_short_answer, _grade_record_dialog_fill
--                                                           (bodies from mig 120)
--   159             check_non_mc_answer                     (body from mig 20260702000400)
--   160             submit_vfr_rt_exam_answers              (body from mig 20260623000800)
-- Bodies are otherwise verbatim from those migrations; only the comparison changed.

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;

-- WITH SCHEMA is IGNORED when the extension already exists, so the clause above is not evidence
-- that levenshtein is reachable at extensions.levenshtein on this database. Assert it, and fail
-- the migration here rather than at first grading call. This assertion lives in 158 on purpose:
-- 158 gates 159 and 160, so it can never itself produce a partially-applied set.
DO $$ BEGIN
  IF to_regprocedure('extensions.levenshtein(text,text)') IS NULL THEN
    RAISE EXCEPTION 'fuzzystrmatch not resolvable at extensions.levenshtein — remedy: ALTER EXTENSION fuzzystrmatch SET SCHEMA extensions';
  END IF; END $$;

CREATE OR REPLACE FUNCTION public.answer_matches(p_norm_response text, p_candidate text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $fn$
DECLARE
  a text; b text; ta text[]; tb text[]; i int; j int; wa text; wb text; lim int; d int; spent int := 0;
BEGIN
  -- BOTH arguments are normalised here. Callers pass an already-normalised response on the left,
  -- but normalize_answer is idempotent, so re-normalising is free and removes an asymmetric
  -- contract a future caller could silently violate by passing a raw string.
  a := coalesce(normalize_answer(p_norm_response), '');
  b := coalesce(normalize_answer(p_candidate), '');
  IF a = '' OR b = '' THEN RETURN false; END IF;
  IF a = b THEN RETURN true; END IF;

  ta := string_to_array(a, ' ');
  tb := string_to_array(b, ' ');
  -- A different number of words is a different answer, never a typo.
  IF array_length(ta, 1) IS DISTINCT FROM array_length(tb, 1) THEN RETURN false; END IF;

  FOR i IN 1 .. array_length(tb, 1) LOOP
    wa := ta[i]; wb := tb[i];
    CONTINUE WHEN wa = wb;
    IF wa ~ '[0-9]' OR wb ~ '[0-9]' THEN RETURN false; END IF;
    lim := CASE WHEN length(wb) >= 5 THEN 1 ELSE 0 END;
    IF lim = 0 THEN RETURN false; END IF;
    -- extensions.levenshtein RAISES above 255 characters (not bytes). Reachable: responseText is
    -- Zod-capped at 500, and inside submit_vfr_rt_exam_answers an unguarded raise aborts the WHOLE
    -- exam submission. Returning false here only declines to fuzzy-match: an exact match already
    -- returned true above, so these two tokens are known to differ.
    IF length(wa) > 255 OR length(wb) > 255 THEN RETURN false; END IF;
    d := extensions.levenshtein(wa, wb);
    -- Levenshtein charges 2 for a swapped pair, so 'sigth' vs 'sight' would fail at 5 characters
    -- even though it is the commonest typo of all. Count a SINGLE ADJACENT SWAP as one edit.
    -- Checked explicitly rather than by raising the threshold (depart/report is distance 2 at
    -- length 6, so a looser threshold admits it) or by comparing sorted letters (left/felt is an
    -- anagram of a different word). This rule admits FEWER different words than either
    -- alternative, not none: there/three, quite/quiet and trail/trial are all adjacent swaps and
    -- all match. Verified against the whole Part 2 corpus (284 candidate strings) — zero
    -- cross-blank collisions today — but an author adding one of those pairs must check.
    IF d = 2 AND length(wa) = length(wb) THEN
      FOR j IN 1 .. length(wb) - 1 LOOP
        IF overlay(wb placing substr(wb, j + 1, 1) || substr(wb, j, 1) from j for 2) = wa THEN
          d := 1;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF d > lim THEN RETURN false; END IF;
    spent := spent + d;
    IF spent > 2 THEN RETURN false; END IF;
  END LOOP;

  RETURN true;
END;
$fn$;

COMMENT ON FUNCTION public.answer_matches(text, text) IS
  'Typo-tolerant answer comparison. Both arguments are normalised inside the function (normalize_answer is idempotent), so either may be passed raw or pre-normalised. Tokens containing digits must match exactly.';

-- SECURITY: Postgres grants EXECUTE to PUBLIC by default, so omitting a GRANT does NOT close this
-- function — only a REVOKE does. Production grading never calls it directly: all four graders are
-- SECURITY DEFINER and invoke it as the postgres owner, whose implicit EXECUTE survives the REVOKE.
-- No client role needs it. Not an answer oracle either way — both arguments are caller-supplied
-- and the body reads no table.
--
-- The service_role GRANT is explicit and load-bearing: do NOT assume the platform's default
-- privileges supply it. Measured on a clean `supabase db reset` — a freshly created function in
-- this schema lands with proacl `{postgres=X/postgres}` only, so after the REVOKE below
-- has_function_privilege('service_role', …) is FALSE and the integration tests
-- (rpc-check-non-mc-answer.integration.test.ts, which call this RPC on the admin client) fail with
-- a permission error. An earlier reading of pg_default_acl suggested service_role was covered; that
-- was measured against a function provisioned before the reset and did not survive verification.
REVOKE EXECUTE ON FUNCTION public.answer_matches(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.answer_matches(text, text) TO service_role;

CREATE OR REPLACE FUNCTION _grade_record_short_answer(
  p_session_id    uuid,
  p_student_id    uuid,
  p_org_id        uuid,
  p_question_id   uuid,
  p_response_text text,
  p_canonical     text,
  p_synonyms      text[],
  p_response_time int
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm       text;
  v_is_correct boolean;
BEGIN
  -- Per-type correctness guard.
  IF p_canonical IS NULL THEN
    RAISE EXCEPTION 'question % has no canonical answer', p_question_id;
  END IF;

  -- coalesce to '' so a NULL/absent student answer grades as incorrect rather
  -- than yielding NULL is_correct (NOT NULL column → 23502). Mirrors the grader
  -- check_non_mc_answer (mig 119).
  v_norm := coalesce(normalize_answer(p_response_text), '');
  v_is_correct := (v_norm <> '' AND (
    public.answer_matches(v_norm, p_canonical)
    OR EXISTS (SELECT 1 FROM unnest(p_synonyms) AS s WHERE public.answer_matches(v_norm, s))
  ));

  -- blank_index NULL for short_answer (one row per question).
  INSERT INTO quiz_session_answers
    (session_id, question_id, response_text, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_response_text, v_is_correct, p_response_time)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     response_text, is_correct, response_time_ms)
  VALUES
    (p_org_id, p_student_id, p_question_id, p_session_id,
     p_response_text, v_is_correct, p_response_time)
  ON CONFLICT DO NOTHING;

  RETURN CASE WHEN v_is_correct THEN 1.0 ELSE 0.0 END;
END;
$$;

-- SECURITY: revoke anon/authenticated PostgREST access (Supabase default-grants
--   both via ALTER DEFAULT PRIVILEGES) — the dispatcher calls these as the
-- postgres owner. Rationale: docs/database.md, "Internal helpers (migs 120/147/154)".
REVOKE EXECUTE ON FUNCTION _grade_record_short_answer(uuid,uuid,uuid,uuid,text,text,text[],int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION _grade_record_dialog_fill(
  p_session_id    uuid,
  p_student_id    uuid,
  p_org_id        uuid,
  p_question_id   uuid,
  p_blank_index   int,
  p_response_text text,
  p_blanks_config jsonb,
  p_response_time int
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blank_canonical text;
  v_blank_synonyms  text[];
  v_norm            text;
  v_is_correct      boolean;
BEGIN
  -- Per-type correctness guard: blank_index must exist in blanks_config.
  IF p_blank_index IS NULL OR p_blank_index < 0 THEN
    RAISE EXCEPTION 'invalid_blank_index for question %', p_question_id;
  END IF;

  SELECT b->>'canonical', ARRAY(SELECT jsonb_array_elements_text(b->'synonyms'))
  INTO v_blank_canonical, v_blank_synonyms
  FROM jsonb_array_elements(p_blanks_config) AS b
  WHERE (b->>'index')::int = p_blank_index;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_blank_index % not in blanks_config of question %',
      p_blank_index, p_question_id;
  END IF;

  -- Data-integrity guard mirroring _grade_record_short_answer's canonical NULL
  -- check (line ~117): no schema CHECK enforces a non-null canonical per blank,
  -- so a corrupt blanks_config entry would silently grade every answer wrong.
  IF v_blank_canonical IS NULL THEN
    RAISE EXCEPTION 'blank % of question % has no canonical answer',
      p_blank_index, p_question_id;
  END IF;

  -- coalesce to '' so a NULL/absent student answer grades as incorrect rather
  -- than yielding NULL is_correct (NOT NULL column → 23502). Mirrors the grader
  -- check_non_mc_answer (mig 119).
  v_norm := coalesce(normalize_answer(p_response_text), '');
  v_is_correct := (v_norm <> '' AND (
    public.answer_matches(v_norm, v_blank_canonical)
    OR EXISTS (SELECT 1 FROM unnest(v_blank_synonyms) AS s WHERE public.answer_matches(v_norm, s))
  ));

  -- One row per blank — blank_index is the differentiator in the 3-col UNIQUE.
  INSERT INTO quiz_session_answers
    (session_id, question_id, response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_response_text, p_blank_index, v_is_correct, p_response_time)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_org_id, p_student_id, p_question_id, p_session_id,
     p_response_text, p_blank_index, v_is_correct, p_response_time)
  ON CONFLICT DO NOTHING;

  RETURN CASE WHEN v_is_correct THEN 1.0 ELSE 0.0 END;
END;
$$;

-- SECURITY: revoke anon/authenticated PostgREST access (Supabase default-grants
--   both via ALTER DEFAULT PRIVILEGES) — the dispatcher calls these as the
-- postgres owner. Rationale: docs/database.md, "Internal helpers (migs 120/147/154)".
REVOKE EXECUTE ON FUNCTION _grade_record_dialog_fill(uuid,uuid,uuid,uuid,int,text,jsonb,int) FROM PUBLIC, anon, authenticated;
