-- Migration 128: normalize_answer(text) — add the missing FINAL trim (#921).
--
-- Bug: mig 101 trims ONCE at the start, then strips the punctuation set, then
-- collapses whitespace — but never trims again. Punctuation adjacent to an edge
-- space therefore leaves a stray edge space: ". hello" -> " hello",
-- "hello ." -> "hello ". Grading compares normalize_answer(response) to
-- normalize_answer(canonical), so a student who types stray edge punctuation is
-- graded WRONG against a clean canonical. Fix: wrap the outermost regexp_replace
-- in trim() so the result has no leading/trailing whitespace.
--
-- Symmetric grading (both sides normalized) means this only makes CORRECT
-- answers match — trimming edge whitespace can never make a genuinely different
-- answer match. An all-punctuation input now normalizes to '' (empty), which
-- cannot match a real NOT-NULL canonical.
--
-- Mirrors apps/web/lib/grading/normalize-answer.ts (the TS source of truth),
-- which gains the same final .trim() in this change — parity is contractual
-- (asserted by the A.11 SQL parity test + the TS unit test). Diacritic handling
-- is unchanged, so the mig-101 deploy-time locale guard still governs and is not
-- re-run here. CREATE OR REPLACE — no signature change; no index/generated
-- column/CHECK depends on this function, so no rebuild.

CREATE OR REPLACE FUNCTION public.normalize_answer(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(trim($1)),
        '[-_]+', ' ', 'g'
      ),
      '[.,;:!?"''()\[\]]', '', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

COMMENT ON FUNCTION public.normalize_answer(text) IS
  'Normalizes a free-text exam answer for grading comparison: trim, lowercase, collapse hyphens/underscores to spaces, strip punctuation, collapse whitespace, then trim again (final trim added mig 128 / #921 so edge-adjacent punctuation leaves no stray edge space). Diacritics preserved (Slovenian č/š/ž). Mirrors apps/web/lib/grading/normalize-answer.ts — keep the two in sync.';

GRANT EXECUTE ON FUNCTION public.normalize_answer(text) TO authenticated;
