// Unit test for the soft-delete column guard. Run: node --test .claude/hooks/check-soft-delete-guard.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyze } from './check-soft-delete-guard.mjs'

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

test('flags only the offending chain when a clean and a dirty chain coexist', () => {
  const src = `await supabase.from('users').select('id').is('deleted_at', null)
await supabase.from('student_responses').select('id').is('deleted_at', null)`
  const v = analyze(src)
  assert.equal(v.length, 1)
  assert.equal(v[0].table, 'student_responses')
  assert.equal(v[0].line, 2)
})

test('does not match a table name held in a variable (documented limitation)', () => {
  const src = `const t = 'easa_subjects'
const r = await supabase.from(t).select('id').is('deleted_at', null)`
  assert.equal(analyze(src).length, 0)
})
