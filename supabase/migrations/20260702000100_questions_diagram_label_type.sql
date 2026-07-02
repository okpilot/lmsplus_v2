-- Migration 150: questions.diagram_config column + question_type widening for the
-- VFR RT Training `diagram_label` question type (Part 3 — #697, Phase 6).
--
-- The `diagram_label` type presents an SVG diagram (e.g. a runway traffic
-- pattern) with labelled drop zones; the student drags text labels (some of
-- which may be unused distractors) onto the zones. The canonical answer is
-- the zone_id -> label_id mapping stored in diagram_config.answer.
--
-- Shape: { image_ref, zones:[{id,x,y,w,h}], labels:[{id,text}], answer:[{zone_id,label_id}] }
--   * image_ref  — a logical key into an in-code SVG registry (NOT a stored
--                  image asset; the SVG is artwork, zones are % overlays).
--   * zones      — drop targets, coordinates as FRACTIONS 0..1 of the diagram
--                  (responsive/iPad-safe), each an object {id,x,y,w,h}.
--   * labels     — draggable chips {id,text}. labels.length MAY exceed
--                  zones.length (distractors allowed — see Decision 52).
--   * answer     — the answer key: one {zone_id,label_id} entry per zone,
--                  each zone covered EXACTLY once. Unused labels are fine.
--
-- SECURITY invariant (seed-enforced, not DB-enforced): zone ids and label ids
-- must use UNRELATED random id schemes — otherwise the zone_id/label_id
-- pairing in a delivered-but-answer-stripped payload (mig 152) could leak the
-- answer via naming correlation even with `answer` omitted.
--
-- SECURITY — diagram_config.answer is an answer key (same mechanism as
-- ordering_items' array order, mig 143). mig 094 REVOKEd the blanket SELECT on
-- questions FROM authenticated and re-GRANTed an EXPLICIT column list (094
-- L130-154). A column added AFTER that grant is NOT in the list, so
-- `authenticated` cannot SELECT diagram_config via PostgREST — auto-gated by
-- omission (mirrors ordering_items, mig 143 header note). DO NOT add
-- diagram_config to any GRANT SELECT expansion. The SECURITY DEFINER
-- delivery/grading RPCs (owned by postgres) bypass the column grant.

-- ------------------------------------------------------------------
-- 1) New column — single JSONB object holding zones/labels/answer.
-- ------------------------------------------------------------------
ALTER TABLE questions
  ADD COLUMN diagram_config JSONB NULL DEFAULT NULL;

-- ------------------------------------------------------------------
-- 2) Widen the question_type IN-list to include 'diagram_label'.
-- ------------------------------------------------------------------
-- mig 143 already resolved the originally-auto-named IN(...) CHECK to the
-- explicit name `questions_question_type_check` (via pg_constraint lookup),
-- so this migration can DROP/ADD by name directly — no pg_constraint dance
-- needed here.
ALTER TABLE questions
  DROP CONSTRAINT questions_question_type_check;

ALTER TABLE questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('multiple_choice', 'short_answer', 'dialog_fill', 'ordering', 'diagram_label'));

-- ------------------------------------------------------------------
-- 2b) Shape guard for diagram_config (mirrors is_valid_ordering_items,
--     mig 143 L73-101 — TOTAL, IMMUTABLE, PARALLEL SAFE, CASE-guarded casts).
-- ------------------------------------------------------------------
-- Every risky cast (numeric coord parse) is wrapped in a CASE that checks
-- jsonb_typeof(...) = 'number' BEFORE casting — Postgres does NOT guarantee
-- left-to-right short-circuit evaluation of OR-chained conditions (only CASE
-- guarantees evaluation order), so a bare `jsonb_typeof(x)='number' OR
-- (x)::numeric < 0` would be unsafe; each cast is self-guarded via its own
-- CASE instead, exactly like mig 143's "extra keys" CASE-guard.
-- All THREE arrays (zones/labels/answer) are individually CASE-wrapped with
-- `jsonb_typeof(...) = 'array'` before jsonb_array_elements() — a non-array
-- input degrades to an empty set (0 rows), never raises 22023.
-- `->` and `->>` on a non-object/array target return NULL (never error), so
-- the id/text/coord-type probes above are safe without guarding.
--
-- Validates: image_ref non-blank text; zones/labels/answer are each arrays;
-- every zone {id: non-blank string, x/y/w/h: number in [0,1]}, zone ids
-- distinct, at least one zone; every label {id: non-blank string, text:
-- non-blank string}, label ids distinct, at least one label; every answer
-- entry {zone_id: non-blank string referencing a real zone, label_id:
-- non-blank string referencing a real label}; answer covers every zone
-- EXACTLY once (answer count = zone count AND distinct answer.zone_id count
-- = zone count AND distinct answer.label_id count = zone count — with the
-- referential + distinctness guards above this forms a one-to-one bijection
-- zones <-> answer labels; distinct label_ids matter because consume-on-place
-- means one chip cannot satisfy two zones, so a repeated canonical label would
-- make the question unwinnable). Labels MAY be unused (distractors, Decision
-- 52) — no requirement that every label appears in answer.
CREATE OR REPLACE FUNCTION is_valid_diagram_config(p_config jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH zones AS (
    SELECT z, z->>'id' AS zone_id
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_config->'zones') = 'array' THEN p_config->'zones' ELSE '[]'::jsonb END
    ) AS z
  ),
  labels AS (
    SELECT l, l->>'id' AS label_id
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_config->'labels') = 'array' THEN p_config->'labels' ELSE '[]'::jsonb END
    ) AS l
  ),
  answers AS (
    SELECT a
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_config->'answer') = 'array' THEN p_config->'answer' ELSE '[]'::jsonb END
    ) AS a
  ),
  zones_valid AS (
    SELECT
      count(*) AS n,
      count(*) FILTER (
        WHERE jsonb_typeof(z) <> 'object'
           OR jsonb_typeof(z->'id') IS DISTINCT FROM 'string'
           OR btrim(z->>'id') = ''
           OR jsonb_typeof(z->'x') IS DISTINCT FROM 'number'
           OR jsonb_typeof(z->'y') IS DISTINCT FROM 'number'
           OR jsonb_typeof(z->'w') IS DISTINCT FROM 'number'
           OR jsonb_typeof(z->'h') IS DISTINCT FROM 'number'
           OR CASE WHEN jsonb_typeof(z->'x') = 'number' THEN (z->>'x')::numeric NOT BETWEEN 0 AND 1 ELSE false END
           OR CASE WHEN jsonb_typeof(z->'y') = 'number' THEN (z->>'y')::numeric NOT BETWEEN 0 AND 1 ELSE false END
           -- w/h must be strictly positive — a zero-size zone is an unusable drop target
           OR CASE WHEN jsonb_typeof(z->'w') = 'number' THEN ((z->>'w')::numeric <= 0 OR (z->>'w')::numeric > 1) ELSE false END
           OR CASE WHEN jsonb_typeof(z->'h') = 'number' THEN ((z->>'h')::numeric <= 0 OR (z->>'h')::numeric > 1) ELSE false END
           -- the box must stay within the [0,1] canvas (no overflow past the edges)
           OR CASE WHEN jsonb_typeof(z->'x') = 'number' AND jsonb_typeof(z->'w') = 'number'
                   THEN (z->>'x')::numeric + (z->>'w')::numeric > 1 ELSE false END
           OR CASE WHEN jsonb_typeof(z->'y') = 'number' AND jsonb_typeof(z->'h') = 'number'
                   THEN (z->>'y')::numeric + (z->>'h')::numeric > 1 ELSE false END
      ) AS n_invalid,
      count(DISTINCT zone_id) AS n_distinct_ids
    FROM zones
  ),
  labels_valid AS (
    SELECT
      count(*) AS n,
      count(*) FILTER (
        WHERE jsonb_typeof(l) <> 'object'
           OR jsonb_typeof(l->'id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(l->'text') IS DISTINCT FROM 'string'
           OR btrim(l->>'id') = ''
           OR btrim(l->>'text') = ''
      ) AS n_invalid,
      count(DISTINCT label_id) AS n_distinct_ids
    FROM labels
  ),
  answers_valid AS (
    SELECT
      count(*) AS n,
      count(*) FILTER (
        WHERE jsonb_typeof(a) <> 'object'
           OR jsonb_typeof(a->'zone_id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(a->'label_id') IS DISTINCT FROM 'string'
           OR btrim(a->>'zone_id') = ''
           OR btrim(a->>'label_id') = ''
           OR NOT EXISTS (SELECT 1 FROM zones  z2 WHERE z2.zone_id  = a->>'zone_id')
           OR NOT EXISTS (SELECT 1 FROM labels l2 WHERE l2.label_id = a->>'label_id')
      ) AS n_invalid,
      count(DISTINCT a->>'zone_id') AS n_distinct_zone_refs,
      count(DISTINCT a->>'label_id') AS n_distinct_label_refs
    FROM answers
  )
  -- COALESCE(..., false): a missing top-level key (e.g. image_ref absent) makes
  -- jsonb_typeof(p_config->'key') return NULL, so the AND-chain evaluates to NULL
  -- rather than false — and a CHECK constraint ACCEPTS an UNKNOWN result. Pin the
  -- validator to a hard boolean so the columns_check rejects such a config.
  SELECT COALESCE((
    jsonb_typeof(p_config) = 'object'
    AND jsonb_typeof(p_config->'image_ref') = 'string'
    AND btrim(p_config->>'image_ref') <> ''
    AND jsonb_typeof(p_config->'zones') = 'array'
    AND jsonb_typeof(p_config->'labels') = 'array'
    AND jsonb_typeof(p_config->'answer') = 'array'
    AND (SELECT n >= 1 AND n_invalid = 0 AND n = n_distinct_ids FROM zones_valid)
    AND (SELECT n >= 1 AND n_invalid = 0 AND n = n_distinct_ids FROM labels_valid)
    AND (
      SELECT
        av.n_invalid = 0
        AND av.n = zv.n
        AND av.n_distinct_zone_refs = zv.n
        -- Every zone's canonical label is DISTINCT: consume-on-place means one
        -- chip cannot satisfy two zones, so a repeated answer.label_id would make
        -- the question unwinnable. Distinct zone refs already = n (bijection), so
        -- requiring distinct label refs = n forces a one-to-one zone<->label map.
        AND av.n_distinct_label_refs = zv.n
      FROM answers_valid av, zones_valid zv
    )
  ), false);
$$;

-- ------------------------------------------------------------------
-- 3) Type <-> column population discriminator (5 branches).
-- ------------------------------------------------------------------
-- Every branch now also positively states diagram_config: non-diagram_label
-- types must have diagram_config IS NULL; diagram_label must have a
-- structurally valid diagram_config (is_valid_diagram_config above, which
-- itself enforces >=1 zone/label and exact-once answer coverage). Existing
-- rows backfill diagram_config = NULL (column default), so every existing
-- MC/short/dialog/ordering row satisfies its branch's `IS NULL` clause.
ALTER TABLE questions
  DROP CONSTRAINT questions_question_type_columns_check;

ALTER TABLE questions
  ADD CONSTRAINT questions_question_type_columns_check CHECK (
    (question_type = 'multiple_choice'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0
       AND ordering_items = '[]'::jsonb
       AND diagram_config IS NULL)
    OR (question_type = 'short_answer'
       AND canonical_answer IS NOT NULL
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0
       AND ordering_items = '[]'::jsonb
       AND diagram_config IS NULL)
    OR (question_type = 'dialog_fill'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NOT NULL
       AND jsonb_array_length(blanks_config) > 0
       AND ordering_items = '[]'::jsonb
       AND diagram_config IS NULL)
    OR (question_type = 'ordering'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0
       AND jsonb_array_length(
             CASE WHEN jsonb_typeof(ordering_items) = 'array' THEN ordering_items ELSE '[]'::jsonb END
           ) >= 2
       AND is_valid_ordering_items(ordering_items)
       AND diagram_config IS NULL)
    OR (question_type = 'diagram_label'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0
       AND ordering_items = '[]'::jsonb
       AND diagram_config IS NOT NULL
       AND is_valid_diagram_config(diagram_config))
  );
