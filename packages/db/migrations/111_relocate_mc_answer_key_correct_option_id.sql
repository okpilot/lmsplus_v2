-- #823 (P0 security): relocate the multiple-choice answer key out of the
-- options JSONB into a dedicated, REVOKE-gated column.
--
-- Problem: questions.options stores `correct: boolean` per option. The only
-- SELECT-governing RLS policy on questions (tenant_isolation, mig 001) is
-- org-scoped, not role-scoped, and mig 094 keeps the `options` column granted
-- to `authenticated` (needed for option TEXT). So any same-org student could
-- dump the answer key with `select('id, options')`. Column-level REVOKE cannot
-- target a key INSIDE a JSONB value, so the key must move to its own column.
--
-- Fix:
--   1. Add correct_option_id text (NULL for non-MC).
--   2. Backfill it from options[].correct for multiple_choice rows.
--   3. Strip `correct` from every stored options array (rebuild {id,text}).
--   4. Gate MC integrity with a CHECK.
--   5. Sanitize trigger: strip any stray `correct` key on every write
--      (defense-in-depth — guarantees the key never re-enters the JSONB even
--      via raw PostgREST writes that bypass the app-layer Zod contract).
--   6. correct_option_id is intentionally NOT granted to authenticated, so a
--      direct SELECT raises 42501. Admins read it via get_question_authoring_fields.
--
-- Deploy order: this migration + the RPC-update migrations (112-117) apply as
-- one atomic set before app code. The 6 scoring/report RPCs are updated in the
-- same deploy to read correct_option_id; until then the strip in step 3 would
-- starve any un-updated reader — they ship together.

-- ------------------------------------------------------------------
-- 1) Column
-- ------------------------------------------------------------------
ALTER TABLE questions
  ADD COLUMN correct_option_id TEXT;

COMMENT ON COLUMN questions.correct_option_id IS
  'MC answer key (option id a-d). NULL for non-MC. REVOKE-gated: not granted to authenticated — read via get_question_authoring_fields(). #823';

-- ------------------------------------------------------------------
-- 2) Backfill from the soon-to-be-stripped options[].correct
-- ------------------------------------------------------------------
UPDATE questions q
SET correct_option_id = (
  SELECT opt->>'id'
  FROM jsonb_array_elements(q.options) AS opt
  WHERE (opt->>'correct')::boolean
  LIMIT 1
)
WHERE q.question_type = 'multiple_choice';

-- Data-quality gate: every MC question must have EXACTLY ONE correct option.
-- The backfill above takes the first `correct: true` via LIMIT 1, and step 3
-- below permanently strips the `correct` flags — so a legacy row with zero
-- correct flags (un-scoreable) OR two+ correct flags (ambiguous key, silently
-- collapsed) must fail the migration loudly NOW, while the evidence still exists,
-- rather than ship a wrong/missing answer key. The flags are still present at this
-- point (strip is step 3), so the per-row count is authoritative.
DO $$
DECLARE
  v_bad_rows INT;
BEGIN
  SELECT count(*) INTO v_bad_rows
  FROM questions
  WHERE question_type = 'multiple_choice'
    AND (
      correct_option_id IS NULL
      OR 1 <> (
        SELECT count(*)
        FROM jsonb_array_elements(options) AS opt
        WHERE coalesce(opt->>'correct', 'false')::boolean
      )
    );
  IF v_bad_rows > 0 THEN
    RAISE EXCEPTION
      '#823 backfill: % multiple_choice question(s) do not have exactly one correct option — refusing to strip the key', v_bad_rows;
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 3) Strip `correct` from stored options (rebuild as {id,text}, preserve order)
-- ------------------------------------------------------------------
UPDATE questions q
SET options = COALESCE(
  (
    SELECT jsonb_agg(
             jsonb_build_object('id', e->>'id', 'text', e->>'text')
             ORDER BY ord
           )
    FROM jsonb_array_elements(q.options) WITH ORDINALITY AS t(e, ord)
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof(q.options) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(q.options) AS e WHERE e ? 'correct'
  );

-- ------------------------------------------------------------------
-- 4) MC integrity CHECK
-- ------------------------------------------------------------------
-- Biconditional: a multiple_choice row has exactly a valid key, and a non-MC
-- row has none. The RHS is forced to a strict boolean (IS NOT NULL AND IN ...)
-- so a NULL key on an MC row evaluates to TRUE = FALSE -> FALSE (rejected at
-- write time) rather than leaking through as NULL. Moves a missing key from a
-- runtime "question has no correct option" RAISE to an INSERT/UPDATE failure.
ALTER TABLE questions
  ADD CONSTRAINT questions_mc_correct_option_id_check CHECK (
    (question_type = 'multiple_choice')
      = (correct_option_id IS NOT NULL AND correct_option_id IN ('a', 'b', 'c', 'd'))
  );

-- ------------------------------------------------------------------
-- 5) Sanitize trigger — strip any `correct` key from options on every write
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sanitize_question_options()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.options IS NOT NULL AND jsonb_typeof(NEW.options) = 'array' THEN
    NEW.options := COALESCE(
      (
        SELECT jsonb_agg(
                 jsonb_build_object('id', e->>'id', 'text', e->>'text')
                 ORDER BY ord
               )
        FROM jsonb_array_elements(NEW.options) WITH ORDINALITY AS t(e, ord)
      ),
      '[]'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sanitize_question_options() IS
  'Strips any `correct` key from questions.options on write so the MC answer key can never re-enter the readable JSONB. The key lives in correct_option_id. #823';

CREATE TRIGGER trg_sanitize_question_options
  BEFORE INSERT OR UPDATE OF options ON questions
  FOR EACH ROW
  EXECUTE FUNCTION public.sanitize_question_options();

-- ------------------------------------------------------------------
-- 6) Privilege gate — correct_option_id is NOT readable by authenticated
-- ------------------------------------------------------------------
-- mig 094 replaced the table-level SELECT grant with an explicit column list;
-- a newly added column is therefore not selectable by `authenticated` by
-- default. The explicit REVOKE below is a no-op safeguard that documents intent
-- and survives any future re-grant. service_role / postgres are unaffected, so
-- the scoring/report RPCs (SECURITY DEFINER, owned by postgres) and the
-- service-role admin client keep full access.
REVOKE SELECT (correct_option_id) ON questions FROM authenticated;
