// Unit test for the schema-derived soft-delete/column guard. Run:
//   node --test .claude/hooks/check-soft-delete-guard.test.mjs
// The guard's schema map is parsed from the REAL `packages/db/src/types.ts` at
// import time (no schema mocking), so these tests double as a live check that the
// generated types still shape as expected for the tables exercised below.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyze, loadSchema } from './check-soft-delete-guard.mjs'

test('flags a forbidden table paired with .is(deleted_at) in one chain', () => {
  const src = `const r = await supabase.from('easa_subjects').select('id').is('deleted_at', null)`
  const v = analyze(src)
  assert.equal(v.length, 1)
  assert.equal(v[0].table, 'easa_subjects')
  assert.equal(v[0].line, 1)
})

test('passes a forbidden table with no deleted_at filter', () => {
  const src = `const r = await supabase.from('easa_topics').select('id').order('sort_order')`
  assert.equal(analyze(src).length, 0)
})

test('passes a soft-deletable table with .is(deleted_at)', () => {
  const src = `const r = await supabase.from('users').select('id').is('deleted_at', null)`
  assert.equal(analyze(src).length, 0)
})

test('passes the exam-config adjacency shape (deleted_at belongs to the sibling exam_configs chain)', () => {
  const src = `const [topicsRes, configsRes] = await Promise.all([
    supabase.from('easa_topics').select('id, subject_id, code, name').order('sort_order'),
    supabase
      .from('exam_configs')
      .select('id, subject_id, enabled')
      .eq('organization_id', organizationId)
      .is('deleted_at', null),
  ])`
  assert.equal(analyze(src).length, 0)
})

test('passes the GDPR-style Promise.all with a soft-deletable deleted_at next to a forbidden read', () => {
  const src = `await Promise.all([
    supabase.from('audit_events').select('id'),
    supabase.from('student_responses').select('id'),
    supabase.from('quiz_sessions').select('id').is('deleted_at', null),
  ])`
  assert.equal(analyze(src).length, 0)
})

test('flags a multi-line forbidden chain with deleted_at', () => {
  const src = `const r = await supabase
    .from('quiz_drafts')
    .select('id')
    .eq('student_id', userId)
    .is('deleted_at', null)`
  const v = analyze(src)
  assert.equal(v.length, 1)
  assert.equal(v[0].table, 'quiz_drafts')
  assert.equal(v[0].line, 2)
})

test('ignores deleted_at inside a // comment on a forbidden-table file', () => {
  const src = `const r = await supabase.from('audit_events').select('id')
  // historical note: a soft-delete .is('deleted_at', null) would be wrong here`
  assert.equal(analyze(src).length, 0)
})

test('ignores a forbidden .from and deleted_at that appear only inside a string literal', () => {
  const src = `const doc = "example: supabase.from('audit_events').is('deleted_at', null) is forbidden"`
  assert.equal(analyze(src).length, 0)
})

test('ignores a forbidden chain that appears only inside a template literal', () => {
  const src = `const doc = \`example: supabase.from('audit_events').is('deleted_at', null) is forbidden\``
  assert.equal(analyze(src).length, 0)
})

test('does not detect a forbidden chain inside template interpolation (documented limitation)', () => {
  const src = `const x = \`result: \${supabase.from('audit_events').select('id').is('deleted_at', null)}\``
  assert.equal(analyze(src).length, 0)
})

test('flags only the offending chain when a clean and a dirty chain coexist', () => {
  const src = `await supabase.from('users').select('id').is('deleted_at', null)
await supabase.from('student_responses').select('id').is('deleted_at', null)`
  const v = analyze(src)
  assert.equal(v.length, 1)
  assert.equal(v[0].table, 'student_responses')
  assert.equal(v[0].line, 2)
})

test('flags a non-deleted_at column that does not exist on a known table', () => {
  const src = `const r = await supabase.from('users').select('id').is('nonexistent_col', null)`
  const v = analyze(src)
  assert.equal(v.length, 1)
  assert.equal(v[0].table, 'users')
  assert.equal(v[0].column, 'nonexistent_col')
})

test('passes a real (non-deleted_at) column on a known table', () => {
  const src = `const r = await supabase.from('questions').select('id').is('id', null)`
  assert.equal(analyze(src).length, 0)
})

test('skips a table that is not in the schema (view, e.g. active_flagged_questions)', () => {
  const src = `const r = await supabase.from('active_flagged_questions').select('id').is('deleted_at', null)`
  assert.equal(analyze(src).length, 0)
})

test('skips an unknown/made-up table name entirely', () => {
  const src = `const r = await supabase.from('totally_made_up_table').select('id').is('anything', null)`
  assert.equal(analyze(src).length, 0)
})

test('does not match a table name held in a variable (documented limitation)', () => {
  const src = `const t = 'easa_subjects'
const r = await supabase.from(t).select('id').is('deleted_at', null)`
  assert.equal(analyze(src).length, 0)
})

test('ignores deleted_at inside a /* */ block comment on a forbidden-table chain', () => {
  // Exercises the state==='block' branch of stripComments — untested by the // line-comment case.
  const src = `const r = await supabase.from('audit_events').select('id')
/* .is('deleted_at', null) would be wrong here, just documenting */`
  assert.equal(analyze(src).length, 0)
})

test('ignores an entire forbidden chain that is wrapped in a /* */ block comment', () => {
  const src = `/* supabase.from('quiz_drafts').select('id').is('deleted_at', null) */
const r = await supabase.from('users').select('id').is('deleted_at', null)`
  assert.equal(analyze(src).length, 0)
})

test('.rpc( acts as a chain boundary so a .is(deleted_at) after .rpc() is not blamed on a preceding forbidden .from()', () => {
  // segmentOffsets lists .rpc( as an explicit boundary alongside .from( and ;
  // A regression removing .rpc( from the boundary regex would produce a false positive here.
  const src = `const r = await supabase.from('easa_subjects').select('id')
const s = await supabase.rpc('some_fn', {}).is('deleted_at', null)`
  assert.equal(analyze(src).length, 0)
})

test('semicolon boundary prevents chain 2 .is(deleted_at) from being blamed on chain 1 forbidden table', () => {
  // ; is the third boundary token in segmentOffsets (adds m.index+1, distinct from .from/.rpc).
  // Exercises the ';' boundary that the newline-based adjacency tests do not cover.
  const src = `supabase.from('easa_topics').select('id'); supabase.from('quiz_sessions').is('deleted_at', null)`
  assert.equal(analyze(src).length, 0)
})

test('returns one violation per offending chain when several forbidden chains are present', () => {
  const src = `await supabase.from('easa_subjects').select('id').is('deleted_at', null)
await supabase.from('quiz_drafts').select('id').is('deleted_at', null)`
  const v = analyze(src)
  assert.equal(v.length, 2)
  assert.equal(v[0].table, 'easa_subjects')
  assert.equal(v[1].table, 'quiz_drafts')
})

// ── Multi-.is() loop (new in #933) ──────────────────────────────────────────

test('flags both absent columns when a single chain has two .is() calls both absent from the table', () => {
  // Exercises the IS_CALL while-loop: a chain with two absent columns produces two violations.
  const src = `const r = await supabase.from('users').select('id').is('ghost_col_a', null).is('ghost_col_b', null)`
  const v = analyze(src)
  assert.equal(v.length, 2)
  assert.equal(v[0].column, 'ghost_col_a')
  assert.equal(v[1].column, 'ghost_col_b')
})

test('flags only the absent column when a chain mixes one valid and one absent .is() call', () => {
  // Exercises the IS_CALL while-loop: the valid deleted_at is skipped; ghost_col is flagged.
  // users.deleted_at exists (confirmed by test at line 23); ghost_col does not.
  const src = `const r = await supabase.from('users').select('id').is('deleted_at', null).is('ghost_col', null)`
  const v = analyze(src)
  assert.equal(v.length, 1)
  assert.equal(v[0].column, 'ghost_col')
})

// ── Dot-qualified embedded column skip (documented limitation) ───────────────

test('silently skips a dot-qualified embedded column reference (documented limitation)', () => {
  // .is('quiz_sessions.ended_at') contains a dot; IS_CALL regex ([A-Za-z0-9_]+) does not match
  // dots, so the call is never compared against the table's column set — 0 violations even
  // though users is a known table and quiz_sessions.ended_at is not a top-level users column.
  const src = `const r = await supabase.from('users').select('id, quiz_sessions(id)').is('quiz_sessions.ended_at', null)`
  assert.equal(analyze(src).length, 0)
})

// ── loadSchema direct (new exported function in #933) ────────────────────────

test('loadSchema correctly maps Row columns and excludes Views from the schema map', () => {
  const minimalTypes = `
export type Database = {
  public: {
    Tables: {
      sample_tbl: {
        Row: {
          id: string
          score: number
          name: string | null
        }
        Insert: { id?: string }
        Relationships: []
      }
    }
    Views: {
      sample_view: {
        Row: { id: string }
      }
    }
  }
}`
  const schema = loadSchema(minimalTypes)
  assert.equal(schema.size, 1, 'only base tables are in the map, not views')
  assert.ok(schema.has('sample_tbl'), 'table is present')
  assert.ok(!schema.has('sample_view'), 'view is excluded')
  assert.deepEqual([...schema.get('sample_tbl')].sort(), ['id', 'name', 'score'])
})

test('loadSchema returns empty map when source has no Tables entry', () => {
  // Pins the silent-fail-open fallback: if types.ts has no Tables section the guard
  // returns an empty schema and all .from() chains are skipped (unknown-table policy).
  const noTables = '\n  public: {\n    Views: {\n    }\n  }'
  const schema = loadSchema(noTables)
  assert.equal(schema.size, 0)
})

test('loadSchema keeps the key after an array-typed column (string[] depth tracking)', () => {
  // Pins extractTopLevelKeys' `[`/`]` depth handling: the `[` in `string[]` must not
  // swallow the following column key. Real types.ts has such columns (e.g.
  // questions.accepted_synonyms); this asserts it independently of the live snapshot.
  const arrayTypes = `
export type Database = {
  public: {
    Tables: {
      sample_tbl: {
        Row: {
          tags: string[]
          name: string
        }
        Relationships: []
      }
    }
  }
}`
  const schema = loadSchema(arrayTypes)
  assert.deepEqual([...schema.get('sample_tbl')].sort(), ['name', 'tags'])
})
