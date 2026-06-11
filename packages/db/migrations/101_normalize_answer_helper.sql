-- Migration 101: normalize_answer(text) — IMMUTABLE SQL helper for VFR RT
-- answer grading, plus a deploy-time locale guard (#697 Phase A, task A.8).
--
-- Logic mirrors apps/web/lib/grading/normalize-answer.ts (the TS source of truth)
-- EXACTLY: trim → lower → collapse [-_]+ runs to a single space → strip the
-- punctuation set .,;:!?"'()[] → collapse whitespace runs to a single space.
-- Diacritics are deliberately NOT folded — Slovenian č/š/ž must survive
-- normalization; Postgres lower() preserves them under non-Turkish UTF-8
-- locales (en_US.UTF-8, C.UTF-8).
--
-- Consumed by submit_vfr_rt_exam_answers (mig 100, earlier in apply order):
-- plpgsql bodies resolve at execution time, not at CREATE time, so mig 100
-- creating its caller before this helper exists is safe — both migrations ship
-- in the same release.

-- Deploy-time locale guard: a misconfigured locale (e.g. tr_TR or C/POSIX
-- collation quirks) that folds diacritics must fail the migration apply rather
-- than silently miscount exam answers after launch. The error embeds the
-- offending folded value AND the corrective action.
DO $$
BEGIN
  IF lower('Č') <> 'č' THEN
    RAISE EXCEPTION 'normalize_answer requires a UTF-8 locale that preserves diacritics. Current locale folds "Č" to "%". Use en_US.UTF-8 or C.UTF-8; check the database locale with: SHOW lc_ctype;', lower('Č');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_answer(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(trim($1)),
        '[-_]+', ' ', 'g'
      ),
      '[.,;:!?"''()\[\]]', '', 'g'
    ),
    '\s+', ' ', 'g'
  );
$$;

COMMENT ON FUNCTION public.normalize_answer(text) IS
  'Normalizes a free-text exam answer for grading comparison: trim, lowercase, collapse hyphens/underscores to spaces, strip punctuation, collapse whitespace. Diacritics preserved (Slovenian č/š/ž). Mirrors apps/web/lib/grading/normalize-answer.ts — keep the two in sync.';

GRANT EXECUTE ON FUNCTION public.normalize_answer(text) TO authenticated;
