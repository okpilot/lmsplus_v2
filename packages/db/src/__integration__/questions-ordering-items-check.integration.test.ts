import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcResult } from './guards'
import { orderingItem, orderingItemId } from './ordering-item-id'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient } from './setup'

// `is_valid_ordering_items()` write-path CHECK on `questions.ordering_items` (mig 143, #998;
// ids/whitespace hardened mig 20260928000100, #1045). Split out of
// rpc-get-quiz-questions-ordering.integration.test.ts (code-style.md §1 file-size cap) — these
// tests exercise the CHECK constraint directly via `admin.from('questions').insert(...)` and need
// no RPC delivery/student-client setup, unlike that file's shuffle/no-leak delivery tests.

type OrderingItem = { id: string; text: string }

async function insertQuestion(
  admin: ReturnType<typeof getAdminClient>,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin.from('questions').insert(row).select('id').single()
  if (error) throw new Error(`insertQuestion: ${error.message}`)
  const id = requireRpcResult<{ id: string }>(data, 'insertQuestion').id
  if (typeof id !== 'string' || id.length === 0) throw new Error('insertQuestion: no id')
  return id
}

describe('CHECK: is_valid_ordering_items (questions_question_type_columns_check)', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let bankId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = fixtureSuffix()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org OrderCk ${suffix}`,
      slug: `test-orderck-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-orderck-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    refs = await seedReferenceData({
      admin,
      subjectCode: `OC${suffix}`,
      subjectName: `OrderCk Subject ${suffix}`,
      topicCode: `OC${suffix}-01`,
      topicName: `OrderCk Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({ organization_id: orgId, name: `OrderCk Bank ${suffix}`, created_by: adminUserId })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    bankId = requireRpcResult<{ id: string }>(bank, 'question_banks insert').id
  })

  afterAll(async () => {
    // §7 per-step accumulator: isolate each cleanup so a failure in one does not
    // skip the next (and leak rows). Reference cleanup is FK-dependent on test
    // cleanup, so it is gated on `errors.length === 0`.
    const errors: string[] = []
    if (orgId) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (refs && errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  function baseRow(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs!.subjectId,
      topic_id: refs!.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
      question_type: 'ordering',
      ...overrides,
    }
  }

  it('rejects an ordering question whose items contain a duplicate id', async () => {
    // is_valid_ordering_items() CHECK: ordering_items must have DISTINCT ids — the array
    // order is the answer key, so a duplicate id is a non-permutation that get_quiz_questions
    // could not render or grade. Both items derive from the SAME text so each individually
    // satisfies the new id = ordering_item_id(text) rule (#1045) — isolating this test to the
    // dedup mechanism, not the derivation-mismatch mechanism exercised elsewhere below. The DB
    // rejects it at authoring (23514) rather than persist it. Regression guard for the
    // CHANGE-1 CHECK (#998 CR #452) — without it a refactor dropping the helper from the
    // columns_check would pass db reset + every CI gate silently.
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — duplicate id',
        ordering_items: [orderingItem('same phrase'), orderingItem('same phrase')],
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose item has blank text', async () => {
    // Same CHECK: each item needs non-blank text (the rendered label). id is derived from the
    // blank text itself so ONLY the text-blank clause fires here, not the id-derivation clause
    // (#1045) — keeps this test isolated to its own mechanism. (#998 CR #452)
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — blank text',
        ordering_items: [{ id: orderingItemId(''), text: '' }, orderingItem('Bravo')],
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose item id is a hand-picked string unrelated to its text', async () => {
    // R1 (#1045): an id must equal ordering_item_id(text) — a hand id, even one that is
    // otherwise well-formed (non-blank, distinct, a string), is rejected.
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — hand id',
        ordering_items: [{ id: 'a', text: 'Alpha' }, orderingItem('Bravo')],
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose item ids order-encode the canonical sequence', async () => {
    // R1 (#1045): the exact vulnerability #1045 names — order-encoding ids ('step-1', 'step-2',
    // ...) let a client sort by id and recover the canonical order despite the delivery shuffle.
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — order-encoding ids',
        ordering_items: [
          { id: 'step-1', text: 'Alpha' },
          { id: 'step-2', text: 'Bravo' },
        ],
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it("rejects an ordering question whose item id is derived from a DIFFERENT item's text", async () => {
    // R1 (#1045): an id correctly formed under the scheme but copied from a sibling item's
    // text is still rejected — id = ordering_item_id(THIS item's text), not any item's text.
    // item[0]'s id is a validly-derived hash — just of 'Bravo', not of its own text 'Alpha'.
    // item[1] derives from a THIRD text ('Charlie') so its own correct id does not
    // coincidentally equal item[0]'s (which would make this indistinguishable from the
    // duplicate-id test above — a copy-paste of a sibling's own correct id is caught there
    // since the sibling's real id is unchanged and now duplicated).
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — id derived from a different item',
        ordering_items: [{ id: orderingItemId('Bravo'), text: 'Alpha' }, orderingItem('Charlie')],
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose item text is tab-only', async () => {
    // R3 (#1045): btrim() only strips spaces — a tab-only text previously passed the blank
    // guard. The migration rejects any text with no character outside its whitespace set.
    const tabOnly = '\t\t'
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — tab-only text',
        ordering_items: [{ id: orderingItemId(tabOnly), text: tabOnly }, orderingItem('Bravo')],
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose item text is newline-only', async () => {
    // R3 (#1045): same mechanism as the tab-only case, different whitespace character.
    const newlineOnly = '\n\n'
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — newline-only text',
        ordering_items: [
          { id: orderingItemId(newlineOnly), text: newlineOnly },
          orderingItem('Bravo'),
        ],
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose item text is only NBSP and BOM characters', async () => {
    const unicodeBlank = '\u00A0\uFEFF'
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — NBSP/BOM-only text',
        ordering_items: [
          { id: orderingItemId(unicodeBlank), text: unicodeBlank },
          orderingItem('Bravo'),
        ],
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('accepts an ordering item whose text has mixed case, internal double spaces, and surrounding whitespace when the id is derived from its NORMALIZED form', async () => {
    // Positive control for R1: normalization (trim, collapse whitespace runs, lowercase) is
    // part of the contract, not just the digest — this proves a legitimately-authored id
    // survives an item whose raw text is messy in every way normalization folds.
    const messyText = '  Engine   FAILURE  '
    const id = await insertQuestion(
      admin,
      baseRow({
        question_text: 'Well-formed ordering — normalized id derivation',
        ordering_items: [orderingItem(messyText), orderingItem('Bravo')],
        explanation_text: 'should insert',
      }),
    )
    const { data, error } = await admin
      .from('questions')
      .select('id, ordering_items')
      .eq('id', id)
      .single<{ id: string; ordering_items: OrderingItem[] }>()
    expect(error).toBeNull()
    expect(data?.ordering_items[0]).toEqual({ id: orderingItemId(messyText), text: messyText })
  })

  it('rejects an ordering question whose item id is not a string', async () => {
    // mig 134 is_valid_ordering_items() enforces jsonb_typeof(id/text) = 'string'.
    // `->>` coerces a JSON number to text, so before the string-type check a numeric id
    // like 42 would have passed as '42'. The app layer treats ids as strings throughout,
    // so the DB rejects a non-string id at authoring (23514). Regression guard (#998 CR).
    // The cast feeds a deliberately-malformed payload (number id) past the insert type;
    // the assertion is on the RPC error, so no result-shape guard is needed here.
    const malformedItems = [
      { id: 42, text: 'first' },
      orderingItem('Bravo'),
    ] as unknown as OrderingItem[]
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — non-string id',
        ordering_items: malformedItems,
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose item text is not a string', async () => {
    // Symmetric to the non-string-id guard: jsonb_typeof(text) IS DISTINCT FROM 'string'.
    // `->>` coerces a JSON number to text, so before the type check a numeric text like
    // 42 would have passed the old blank-only check. Regression guard for the text side
    // of the typeof clause (#998 CR) — distinct mechanism from the id-side test above.
    const malformedItems = [
      { id: 'a', text: 42 },
      orderingItem('Bravo'),
    ] as unknown as OrderingItem[]
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — non-string text',
        ordering_items: malformedItems,
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose item id is whitespace-only', async () => {
    // A whitespace-only id is not a usable stable key. Since #1045, this is subsumed by the
    // derived-id rule — '   ' can never equal ordering_item_id('Alpha') — but is kept as its
    // own regression case for the specific whitespace-id shape.
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — whitespace-only id',
        ordering_items: [{ id: '   ', text: 'Alpha' }, orderingItem('Bravo')],
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose item is missing the text key', async () => {
    // Isolates the IS DISTINCT FROM 'string' (not <> 'string') operator choice: a missing
    // text key makes e->'text' jsonb NULL, jsonb_typeof(...) SQL NULL, and NULL <> 'string'
    // is NULL (not counted) — the element would slip through `<>`. IS DISTINCT FROM 'string'
    // is TRUE for NULL, so it is rejected. Since #1045 the id-derivation clause also
    // independently rejects this row (ordering_item_id(NULL) is NULL, 'a' IS DISTINCT FROM
    // NULL is true) — both mechanisms are legitimate defenses over the same malformed row.
    const malformedItems = [{ id: 'a' }, orderingItem('Bravo')] as unknown as OrderingItem[]
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — missing text key',
        ordering_items: malformedItems,
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering question whose ordering_items is a non-array JSON value', async () => {
    // Totality of the columns_check (#998 CR): a non-array ordering_items (here a JSON
    // object) must fail the CHECK cleanly with 23514 — NOT raise a raw 22023 from an
    // unguarded jsonb_array_length. The branch emptiness checks use `= '[]'::jsonb` and
    // the ordering length check CASE-wraps its argument, so jsonb_array_length never runs
    // on a non-array. A 22023 here (instead of 23514) means the totality guard regressed.
    const malformedItems = { not: 'an-array' } as unknown as OrderingItem[]
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — non-array ordering_items',
        ordering_items: malformedItems,
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })

  it('rejects an ordering item that carries answer-bearing metadata beyond id and text', async () => {
    // Exact-shape guard (#998 CR round 2): the canonical array order IS the answer key,
    // so an item must store ONLY {id,text} — a stray `correct`/`position`/`correct_order`
    // key could smuggle answer metadata into the sensitive column. The CHECK's
    // `(e - 'id' - 'text') <> '{}'` clause rejects it at authoring (23514). The delivery
    // RPC already strips to {id,text}, so this is defense-in-depth at the write boundary.
    // Both ids are correctly derived (#1045) so this test isolates the extra-key mechanism,
    // not the id-derivation mechanism exercised elsewhere in this file.
    const malformedItems = [
      { id: orderingItemId('Alpha'), text: 'Alpha', correct: true },
      orderingItem('Bravo'),
    ] as unknown as OrderingItem[]
    const { error } = await admin.from('questions').insert(
      baseRow({
        question_text: 'Malformed ordering — extra key on item',
        ordering_items: malformedItems,
        explanation_text: 'should not insert',
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  })
})
