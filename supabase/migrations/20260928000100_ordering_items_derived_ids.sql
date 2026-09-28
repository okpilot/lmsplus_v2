-- Ordering item ids must be derived from their own text (#1045, finding 1). An author-chosen
-- id (order-encoding like '1'/'step-1', or one copied from a different item) is only opaque by
-- convention today — nothing enforces it, so a client can sort ordering_items_shuffled by `id`
-- and recover the canonical order despite the ORDER BY random() shuffle (mig 145).
--
-- ordering_item_id(text) computes 'o1' || first 8 hex chars of sha256(utf8(normalize(text))),
-- normalize = trim, collapse internal whitespace runs to one space, lowercase — BYTE-IDENTICAL
-- to apps/web/scripts/content-ids.ts `deriveContentId('o', [text])` (same ID_VERSION '1', same
-- DIGEST_CHARS 8). "Whitespace" is spelled out as JS's `\s` / `String.prototype.trim` set
-- (WhiteSpace + LineTerminator, incl. NBSP, U+2000-U+200A, U+3000, U+2028/9, BOM U+FEFF), not
-- PostgreSQL's locale-dependent `\s` / `[:space:]`, which omits U+FEFF. Collapsing every run to
-- one space and then trimming spaces equals JS trim-then-collapse. lower() runs under the ICU
-- collation "und-x-icu", which matches JS toLowerCase() (final sigma, dotted I) whatever the
-- database's default collation provider is.
-- Pinned by apps/web/scripts/content-ids.integration.test.ts. Verified 2026-09-28:
-- `deriveContentId('o', ['  Mayday  MAYDAY mayday '])` and this SQL function both return
-- 'o1459c75a5'. is_valid_ordering_items() below then requires `id = ordering_item_id(text)` exactly, so an id carries no information beyond
-- the text the student sees — there is no field left for an author to encode order into.
--
-- IMMUTABLE despite calling convert_to (STABLE, per `SELECT provolatile FROM pg_proc WHERE
-- proname = 'convert_to'` — verified locally, 's'): convert_to's result depends only on its two
-- arguments (source text, target encoding name) and the DATABASE encoding, never on session
-- state, the current time, or any table — it is marked STABLE only because a hypothetical
-- ALTER DATABASE ... SET ENCODING could change its output within one query, and Postgres has no
-- narrower category for "constant unless someone changes the server". This database's encoding
-- is UTF8 (`SHOW server_encoding`) and does not change at runtime, so `convert_to(x, 'UTF8')` is
-- immutable in practice for every call this function will ever see. Declaring the wrapper
-- IMMUTABLE is what lets Postgres invoke it inside a table CHECK constraint (a CHECK-called
-- function must be IMMUTABLE); this is the same pattern PostgreSQL's own documentation uses for
-- text-normalizing wrappers over STABLE built-ins. sha256/convert_to are core PostgreSQL
-- built-ins (no pgcrypto) and a NEW pattern in this migration set (`grep -rn "convert_to\|sha256"
-- supabase/migrations` before this file: no hits).
--
-- GRANT posture DEVIATES from the sibling REVOKE-all-three-roles helper (mig 20260630000500
-- _grade_record_ordering): that helper is called ONLY from inside a SECURITY DEFINER RPC owned by
-- postgres, so the caller's own role never touches it. This function is called from INSIDE
-- is_valid_ordering_items(), which runs inside the `questions` table's own CHECK constraint — and
-- admin question authoring (`apps/web/app/app/admin/questions/actions/insert-question.ts` via
-- `requireAdmin()` -> `createServerSupabaseClient()`) inserts as the `authenticated` Postgres
-- role, not service_role. Verified locally: `REVOKE EXECUTE ... FROM authenticated` on this
-- function, then `SET ROLE authenticated; INSERT INTO <table with the CHECK>` fails with
-- `permission denied for function ordering_item_id` — a three-role REVOKE would break every
-- admin's ability to create or edit an `ordering` question. `is_valid_ordering_items` itself
-- (mig 20260630000100) is the actual structural precedent — same CHECK, same caller — and it
-- carries NO REVOKE at all: PUBLIC/anon EXECUTE were already stripped from it (and every other
-- pre-existing function) by the blanket `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM
-- PUBLIC, anon` in mig 20260925000400, while `authenticated` was deliberately left untouched.
-- A brand-new function's default ACL already matches that end state — verified locally via
-- `SELECT proacl FROM pg_proc` on a throwaway function: {postgres=X, authenticated=X,
-- service_role=X}, no PUBLIC/anon entry to revoke. So this function needs no GRANT/REVOKE
-- statement at all; the REVOKE below is a defensive, explicit no-op naming exactly what the
-- default already omits (PUBLIC, anon), self-documenting the posture for the next reader.
CREATE OR REPLACE FUNCTION ordering_item_id(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT 'o1' || left(
    encode(
      sha256(
        convert_to(
          lower(btrim(regexp_replace(
            p_text, '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'
          )) COLLATE "und-x-icu"),
          'UTF8'
        )
      ),
      'hex'
    ),
    8
  );
$$;

REVOKE EXECUTE ON FUNCTION ordering_item_id(text) FROM PUBLIC, anon;

-- ------------------------------------------------------------------
-- is_valid_ordering_items — add the derived-id rule + whitespace-only text rule (#1045
-- findings 1 + 3). Latest definition: mig 20260630000100 L73-101 (unchanged signature; called
-- from questions_question_type_columns_check, latest def mig 20260702000100 L226-268 — no
-- DROP/ADD needed there since the CHECK calls this function by name).
--
-- Two textual changes from the prior body, every other rule unchanged:
--   1. `btrim(e->>'text') = ''` -> `(e->>'text') !~ '[^<ws>]'` — btrim only strips spaces,
--      so a tab/newline/form-feed-only text previously passed the blank guard. The regex rejects
--      any string with no character outside ordering_item_id's whitespace set (also rejects the
--      empty string, subsuming the old rule).
--   2. `btrim(e->>'id') = ''` -> `(e->>'id') IS DISTINCT FROM ordering_item_id(e->>'text')` — the
--      id must equal the hash derived from this item's OWN text. ordering_item_id's output is
--      always non-blank ('o1' + 8 hex chars), so this subsumes the old blank-id guard too, and
--      also rejects a hand id, an order-encoding id ('1','step-1',...), and an id copied from a
--      DIFFERENT item's text.
CREATE OR REPLACE FUNCTION is_valid_ordering_items(p_items jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(p_items) = 'array'
    AND (
      SELECT count(*) FILTER (
               WHERE jsonb_typeof(e) <> 'object'
                  OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string'
                  OR jsonb_typeof(e->'text') IS DISTINCT FROM 'string'
                  OR (e->>'id') IS DISTINCT FROM public.ordering_item_id(e->>'text')
                  OR (e->>'text') !~ '[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'
                  -- Exact shape: reject extra keys (#998 CR). The canonical array
                  -- order IS the answer key, so an item must not carry answer-bearing
                  -- metadata (correct, position, correct_order, …). CASE-wrapped so a
                  -- non-object element (already rejected above) never hits `jsonb - text`
                  -- on a scalar → keeps the function TOTAL (clean 23514, never a 22023).
                  OR CASE WHEN jsonb_typeof(e) = 'object'
                          THEN (e - 'id' - 'text') <> '{}'::jsonb
                          ELSE false END
             ) = 0
         AND count(*) = count(DISTINCT e->>'id')
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
           ) AS e
    );
$$;

-- ------------------------------------------------------------------
-- CREATE OR REPLACE does not re-validate existing rows against the tightened rule — prove it
-- here instead. Prod evidence (read-only probe, 2026-09-28): 12 active ordering questions / 60
-- items, every id already equals this exact derivation, no whitespace-only text, zero
-- soft-deleted ordering rows — so this is expected to raise on nothing, anywhere. No
-- `deleted_at IS NULL` filter: a soft-deleted row's ordering_items must satisfy the CHECK too,
-- since UNDELETE (never implemented) would otherwise resurrect a row the current schema forbids.
DO $$
DECLARE
  v_bad_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_bad_ids
  FROM questions
  WHERE question_type = 'ordering'
    AND NOT is_valid_ordering_items(ordering_items);

  IF v_bad_ids IS NOT NULL THEN
    RAISE EXCEPTION 'ordering_items_derived_ids: % existing ordering question(s) fail the new is_valid_ordering_items rule: %',
      array_length(v_bad_ids, 1), v_bad_ids;
  END IF;
END;
$$;
