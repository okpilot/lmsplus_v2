-- Diagram zone/label ids must be derived (#1215). Sibling of 20260928000100 (ordering).
--   label id      = 'l1' || substr(ordering_item_id(text), 3)
--   zone id (j)   = 'z1' || substr(ordering_item_id(image_ref || ' ' || j), 3)
-- Byte-equal to apps/web/scripts/diagram-content.ts deriveLabelId / deriveZoneId
-- (prefix is concatenated, not hashed). Pinned by apps/web/scripts/content-ids.integration.test.ts.
-- Zones may be an ascending subset of canonical indices 0..49 (MAX_ZONES).
-- Execute posture inherited from ordering_item_id (authenticated keeps it; the CHECK runs as it).
-- Prod probe (read-only, 2026-11-06): 2 diagram_label rows, 0 violating.
-- Signature unchanged; called by name from questions_question_type_columns_check.
-- Body: 20260702000100:84 plus (a) zones WITH ORDINALITY, (b) label id/text rule,
-- (c) zone id rule + ascending order, (d) image_ref non-whitespace regex. Still total.
CREATE OR REPLACE FUNCTION is_valid_diagram_config(p_config jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH zones AS (
    SELECT z, z->>'id' AS zone_id, ord
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_config->'zones') = 'array' THEN p_config->'zones' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS t(z, ord)
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
  canonical_zone_ids AS (
    SELECT array_agg(
             'z1' || substr(public.ordering_item_id((p_config->>'image_ref') || ' ' || j), 3)
             ORDER BY j
           ) AS ids
    FROM generate_series(0, 49) AS j
    WHERE jsonb_typeof(p_config->'image_ref') = 'string'
  ),
  zone_positions AS (
    SELECT array_position(c.ids, z.zone_id) AS pos,
           lag(array_position(c.ids, z.zone_id)) OVER (ORDER BY z.ord) AS prev_pos
    FROM zones z, canonical_zone_ids c
  ),
  zones_valid AS (
    SELECT
      count(*) AS n,
      count(*) FILTER (
        WHERE jsonb_typeof(z) <> 'object'
           -- exact key set — no extra author metadata may ride along
           OR CASE WHEN jsonb_typeof(z) = 'object' THEN EXISTS (
                SELECT 1 FROM jsonb_object_keys(z) AS k(key) WHERE k.key NOT IN ('id','x','y','w','h')
              ) ELSE false END
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
  zone_ids_valid AS (
    -- every zone id is canonical; positions strictly ascend in stored order
    SELECT COALESCE(bool_and(pos IS NOT NULL AND pos > COALESCE(prev_pos, 0)), false) AS ok
    FROM zone_positions
  ),
  labels_valid AS (
    SELECT
      count(*) AS n,
      count(*) FILTER (
        WHERE jsonb_typeof(l) <> 'object'
           OR CASE WHEN jsonb_typeof(l) = 'object' THEN EXISTS (
                SELECT 1 FROM jsonb_object_keys(l) AS k(key) WHERE k.key NOT IN ('id','text')
              ) ELSE false END
           OR jsonb_typeof(l->'id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(l->'text') IS DISTINCT FROM 'string'
           OR (l->>'id') IS DISTINCT FROM 'l1' || substr(public.ordering_item_id(l->>'text'), 3)
           OR (l->>'text') !~ '[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'
      ) AS n_invalid,
      count(DISTINCT label_id) AS n_distinct_ids
    FROM labels
  ),
  answers_valid AS (
    SELECT
      count(*) AS n,
      count(*) FILTER (
        WHERE jsonb_typeof(a) <> 'object'
           OR CASE WHEN jsonb_typeof(a) = 'object' THEN EXISTS (
                SELECT 1 FROM jsonb_object_keys(a) AS k(key) WHERE k.key NOT IN ('zone_id','label_id')
              ) ELSE false END
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
  -- COALESCE(..., false): a CHECK accepts UNKNOWN, so pin the validator to a hard boolean.
  SELECT COALESCE((
    jsonb_typeof(p_config) = 'object'
    AND CASE WHEN jsonb_typeof(p_config) = 'object' THEN NOT EXISTS (
          SELECT 1 FROM jsonb_object_keys(p_config) AS k(key)
          WHERE k.key NOT IN ('image_ref','zones','labels','answer')
        ) ELSE false END
    AND jsonb_typeof(p_config->'image_ref') = 'string'
    AND (p_config->>'image_ref') ~ '[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'
    AND jsonb_typeof(p_config->'zones') = 'array'
    AND jsonb_typeof(p_config->'labels') = 'array'
    AND jsonb_typeof(p_config->'answer') = 'array'
    -- MAX_ZONES = 50 (diagram-validation.ts)
    AND (SELECT n BETWEEN 1 AND 50 AND n_invalid = 0 AND n = n_distinct_ids FROM zones_valid)
    AND (SELECT ok FROM zone_ids_valid)
    -- MAX_LABELS = 60
    AND (SELECT n BETWEEN 1 AND 60 AND n_invalid = 0 AND n = n_distinct_ids FROM labels_valid)
    -- zone-id / label-id disjointness
    AND NOT EXISTS (SELECT 1 FROM zones z JOIN labels l ON l.label_id = z.zone_id)
    AND (
      SELECT
        av.n_invalid = 0
        AND av.n = zv.n
        AND zv.n <= 50
        AND av.n_distinct_zone_refs = zv.n
        -- one-to-one zone <-> label map (consume-on-place)
        AND av.n_distinct_label_refs = zv.n
      FROM answers_valid av, zones_valid zv
    )
  ), false);
$$;

-- CREATE OR REPLACE does not re-validate existing rows. No deleted_at filter: UNDELETE must not
-- resurrect a row the schema forbids.
DO $$
DECLARE
  v_bad_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_bad_ids
  FROM questions
  WHERE question_type = 'diagram_label'
    AND NOT is_valid_diagram_config(diagram_config);

  IF v_bad_ids IS NOT NULL THEN
    RAISE EXCEPTION 'diagram_config_derived_ids: % existing diagram_label question(s) fail the new is_valid_diagram_config rule: %',
      array_length(v_bad_ids, 1), v_bad_ids;
  END IF;
END;
$$;
