/**
 * Seed script for VFR RT Training (Practice Drills) — Phase 1 manual evaluation.
 *
 * Creates:
 * - Egmont Aviation org
 * - Admin user   (admin@lmsplus.local / admin123!)
 * - Student user (student@lmsplus.local / student123!)
 * - A question bank for the VFR RT pool
 * - 10 ACTIVE multiple_choice questions under topic P3_MC      (Part 3)
 * - 5  ACTIVE short_answer  questions under topic P1_ACRONYMS  (Part 1)
 * - 3  ACTIVE dialog_fill   questions under topic P2_DIALOG    (Part 2)
 * - 2  ACTIVE ordering      questions under topic P3_MC        (Part 3, drag-to-order)
 *
 * NO exam_config row — training-only (quick_quiz study mode).
 * Phases 3/5 wire the non-MC types into the reused /app/quiz Study runner; pick a
 * Part on /app/vfr-rt to drill that type (P1 → short_answer, P2 → dialog_fill,
 * P3 → multiple_choice + ordering).
 *
 * The RT subject (code 'RT') and its three topics (P1_ACRONYMS / P2_DIALOG / P3_MC)
 * are seeded by migrations 097/098, so this script only looks them up.
 *
 * Run AFTER `npx supabase db reset` (+ the local grant fix). Idempotent (safe to re-run).
 * Usage: cd apps/web && npx tsx scripts/seed-vfr-rt-training-eval.ts
 */

import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import type {
  DiagramLabel,
  DiagramZone,
} from '../app/app/quiz/session/_components/diagrams/rwy-2709-layout'
import {
  RWY_2709_IMAGE_REF,
  RWY_2709_LABELS,
  RWY_2709_ZONES,
} from '../app/app/quiz/session/_components/diagrams/rwy-2709-layout'

config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const isLocal =
  SUPABASE_URL.startsWith('http://localhost') || SUPABASE_URL.startsWith('http://127.0.0.1')
if (!isLocal && !process.argv.includes('--force-remote')) {
  console.error(
    `Refusing to seed against non-local Supabase URL: ${SUPABASE_URL}\nPass --force-remote to override.`,
  )
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ADMIN_EMAIL = 'admin@lmsplus.local'
const ADMIN_PASSWORD = 'admin123!'
const STUDENT_EMAIL = 'student@lmsplus.local'
const STUDENT_PASSWORD = 'student123!'

// ---- question content --------------------------------------------------------

type MultipleChoice = {
  num: string
  text: string
  options: { id: string; text: string }[]
  correct: 'a' | 'b' | 'c' | 'd'
}

// Part 3 — multiple choice. 10 questions for Phase 1 MC eval.
const MULTIPLE_CHOICE: MultipleChoice[] = [
  {
    num: 'VRT-P3-001',
    text: 'What is the correct readback of an altimeter setting of 1009 hPa?',
    options: [
      { id: 'a', text: 'QNH ten oh nine' },
      { id: 'b', text: 'QNH one zero zero nine' },
      { id: 'c', text: 'QNH one thousand nine' },
      { id: 'd', text: 'QNH ten zero nine' },
    ],
    correct: 'b',
  },
  {
    num: 'VRT-P3-002',
    text: 'Which transmission word signals a distress condition?',
    options: [
      { id: 'a', text: 'PAN PAN' },
      { id: 'b', text: 'SECURITE' },
      { id: 'c', text: 'MAYDAY' },
      { id: 'd', text: 'STANDBY' },
    ],
    correct: 'c',
  },
  {
    num: 'VRT-P3-003',
    text: 'How is the flight level 080 transmitted?',
    options: [
      { id: 'a', text: 'Flight level eighty' },
      { id: 'b', text: 'Flight level eight hundred' },
      { id: 'c', text: 'Flight level zero eight zero' },
      { id: 'd', text: 'Flight level eight zero' },
    ],
    correct: 'd',
  },
  {
    num: 'VRT-P3-004',
    text: 'Which word indicates an urgency (not distress) condition?',
    options: [
      { id: 'a', text: 'MAYDAY' },
      { id: 'b', text: 'PAN PAN' },
      { id: 'c', text: 'WILCO' },
      { id: 'd', text: 'ROGER' },
    ],
    correct: 'b',
  },
  {
    num: 'VRT-P3-005',
    text: 'How should the number 100 be transmitted (as an altitude in feet)?',
    options: [
      { id: 'a', text: 'One hundred' },
      { id: 'b', text: 'One zero zero' },
      { id: 'c', text: 'Hundred' },
      { id: 'd', text: 'One oh oh' },
    ],
    correct: 'a',
  },
  {
    num: 'VRT-P3-006',
    text: "What is the phonetic alphabet word for the letter 'R'?",
    options: [
      { id: 'a', text: 'Roger' },
      { id: 'b', text: 'Romeo' },
      { id: 'c', text: 'Robert' },
      { id: 'd', text: 'Rescue' },
    ],
    correct: 'b',
  },
  {
    num: 'VRT-P3-007',
    text: 'When should a full call sign be used again after abbreviation?',
    options: [
      { id: 'a', text: 'Never once abbreviated' },
      { id: 'b', text: 'Only on first contact' },
      { id: 'c', text: 'When initiated by the ground station' },
      { id: 'd', text: 'Every transmission' },
    ],
    correct: 'c',
  },
  {
    num: 'VRT-P3-008',
    text: 'Which phrase confirms an instruction will be complied with?',
    options: [
      { id: 'a', text: 'ROGER' },
      { id: 'b', text: 'WILCO' },
      { id: 'c', text: 'AFFIRM' },
      { id: 'd', text: 'COPY' },
    ],
    correct: 'b',
  },
  {
    num: 'VRT-P3-009',
    text: 'How is the time 0935 transmitted when the hour is clear?',
    options: [
      { id: 'a', text: 'Thirty-five' },
      { id: 'b', text: 'Nine thirty-five' },
      { id: 'c', text: 'Three five' },
      { id: 'd', text: 'Zero nine three five' },
    ],
    correct: 'c',
  },
  {
    num: 'VRT-P3-010',
    text: "What is the correct response to 'How do you read?'",
    options: [
      { id: 'a', text: 'Reading you five' },
      { id: 'b', text: 'Loud and clear' },
      { id: 'c', text: 'Read you well' },
      { id: 'd', text: 'Five by five' },
    ],
    correct: 'a',
  },
]

type ShortAnswer = {
  num: string
  text: string
  canonical: string
  synonyms: string[]
}

// Part 1 — short_answer. Free-text graded against canonical + synonyms.
// Grading normalizes case/punctuation/whitespace (normalize_answer, mig 101/128),
// so the answers below match regardless of capitalisation; type a wrong answer to
// see the incorrect state, and the canonical is revealed in the feedback either way.
const SHORT_ANSWER: ShortAnswer[] = [
  {
    num: 'VRT-P1-001',
    text: "What single word means 'I have received all of your last transmission'?",
    canonical: 'roger',
    synonyms: [],
  },
  {
    num: 'VRT-P1-002',
    text: "Give the phonetic alphabet word for the letter 'G'.",
    canonical: 'golf',
    synonyms: [],
  },
  {
    num: 'VRT-P1-003',
    text: 'What word indicates that the proposed action is approved?',
    canonical: 'approved',
    synonyms: [],
  },
  {
    num: 'VRT-P1-004',
    text: 'What word asks the other station to wait and that you will call them back?',
    canonical: 'standby',
    synonyms: ['stand by'], // demonstrates a synonym: "stand by" also grades correct
  },
  {
    num: 'VRT-P1-005',
    text: "What phonetic alphabet word represents the letter 'Q'?",
    canonical: 'quebec',
    synonyms: [],
  },
]

type DialogFill = {
  num: string
  text: string
  // Tokens are {{index|canonical;synonym}} (the `|...` is stripped before the
  // template reaches the student — get_quiz_questions, mig 126). blanks_config
  // drives grading and must agree with the marker indices.
  template: string
  blanks: { index: number; canonical: string; synonyms: string[] }[]
}

// Part 2 — dialog_fill. Fill the blanks in an ATC exchange.
const DIALOG_FILL: DialogFill[] = [
  {
    num: 'VRT-P2-001',
    text: 'Complete the tower transmission (landing clearance).',
    template: 'TOWER: Golf Alpha Bravo, {{0|cleared to land}} runway {{1|27;two seven}}.',
    blanks: [
      { index: 0, canonical: 'cleared to land', synonyms: [] },
      { index: 1, canonical: '27', synonyms: ['two seven'] }, // either "27" or "two seven"
    ],
  },
  {
    num: 'VRT-P2-002',
    text: 'Complete the pilot readback (altimeter setting).',
    template: 'PILOT: {{0|QNH}} {{1|one zero one three}}, Golf Alpha Bravo.',
    blanks: [
      { index: 0, canonical: 'QNH', synonyms: [] },
      { index: 1, canonical: 'one zero one three', synonyms: [] },
    ],
  },
  {
    num: 'VRT-P2-003',
    text: 'Complete the tower instruction (frequency change).',
    template: 'TOWER: Golf Alpha Bravo, contact Approach on {{0|one one eight decimal three}}.',
    blanks: [{ index: 0, canonical: 'one one eight decimal three', synonyms: [] }],
  },
]

// ---- helpers ------------------------------------------------------------------

async function createAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error && !error.message.includes('already been registered')) {
    throw new Error(`Auth user ${email}: ${error.message}`)
  }
  if (data?.user) return data.user.id

  const { data: users } = await db.auth.admin.listUsers()
  const existing = users?.users.find((u) => u.email === email)
  if (!existing) throw new Error(`Cannot find user ${email}`)
  return existing.id
}

async function ensureUser(
  id: string,
  orgId: string,
  email: string,
  role: 'admin' | 'student',
): Promise<void> {
  const { error } = await db.from('users').upsert(
    {
      id,
      organization_id: orgId,
      email,
      full_name: role === 'admin' ? 'Admin User' : 'Student User',
      role,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`User row ${email}: ${error.message}`)
}

async function lookupId(table: string, column: string, value: string): Promise<string> {
  const { data, error } = await db.from(table).select('id').eq(column, value).single()
  if (error || !data)
    throw new Error(`Lookup ${table}.${column}='${value}': ${error?.message ?? 'not found'}`)
  return data.id
}

async function ensureBank(orgId: string, adminId: string): Promise<string> {
  const NAME = 'VFR RT QDB'
  // One bank per org (question_banks_organization_id_key) — reuse whatever bank the
  // org already has regardless of name, so this seed composes with sibling eval
  // seeds in either run order (#1119). NAME only applies on first-run insert.
  const { data: existing, error: bankLookupErr } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (bankLookupErr) throw new Error(`Bank lookup: ${bankLookupErr.message}`)
  if (existing) return existing.id

  const { data, error } = await db
    .from('question_banks')
    .insert({ organization_id: orgId, name: NAME, created_by: adminId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Bank: ${error?.message}`)
  return data.id
}

type Ordering = {
  num: string
  text: string
  // { id, text } in CANONICAL order — the array order IS the answer key.
  // IDs are OPAQUE and non-sequential (not 1..N, and an alphabetical id sort does
  // NOT match the canonical order), so neither the id nor a naive sort leaks the
  // correct sequence; get_quiz_questions (mig 145) delivers the items shuffled.
  items: { id: string; text: string }[]
}

// Part 3 — ordering. Drag the elements into the correct radiotelephony sequence.
const ORDERING: Ordering[] = [
  {
    num: 'VRT-P3-ORD-MAYDAY',
    text: 'Put the parts of a MAYDAY distress call in the correct spoken order.',
    items: [
      { id: 'distress', text: 'MAYDAY MAYDAY MAYDAY' },
      { id: 'station', text: 'name of the station addressed' },
      { id: 'callsign', text: 'aircraft callsign' },
      { id: 'nature', text: 'nature of the emergency' },
      { id: 'intentions', text: 'intentions of the pilot in command' },
    ],
  },
  {
    num: 'VRT-P3-ORD-POSREP',
    text: 'Put the elements of a VFR position report in the correct order.',
    items: [
      { id: 'ident', text: 'aircraft callsign' },
      { id: 'where', text: 'present position' },
      { id: 'when', text: 'time over the position' },
      { id: 'altitude', text: 'flight level or altitude' },
      { id: 'next', text: 'next reporting point and estimate' },
    ],
  },
]

type DiagramLabelQuestion = {
  num: string
  text: string
  // The zone_id -> label_id answer key. This mapping lives ONLY here (a
  // server-side seed script) — never in the frontend layout module (see the
  // SECURITY note atop rwy-2709-layout.ts). Distractor labels (Go-around,
  // Departure, Threshold) exist in RWY_2709_LABELS but are intentionally
  // absent from this mapping.
  answer: { zone_id: string; label_id: string }[]
}

// Part 3 — diagram_label. Label the RWY 27/09 left-hand traffic pattern by
// dragging each chip onto its matching leg or turn zone.
const DIAGRAM_LABEL: DiagramLabelQuestion[] = [
  {
    num: 'VRT-P3-DIAG-2709',
    text: 'Label the RWY 27/09 left-hand traffic pattern: drag each label onto its matching leg or turn.',
    answer: [
      { zone_id: 'z9f2a1c', label_id: 'lk3f81a' }, // upwind leg -> Upwind leg
      { zone_id: 'zb84e7d', label_id: 'lm70cd2' }, // crosswind turn -> Crosswind turn
      { zone_id: 'z3c1908', label_id: 'lp9e64b' }, // crosswind leg -> Crosswind leg
      { zone_id: 'ze52af6', label_id: 'lq2a17f' }, // downwind turn -> Downwind turn
      { zone_id: 'z71bd3a', label_id: 'lr58c93' }, // downwind leg -> Downwind leg
      { zone_id: 'zd0946f', label_id: 'ls6b4e0' }, // base turn -> Base turn
      { zone_id: 'z2e6c81', label_id: 'lt3d829' }, // base leg -> Base leg
      { zone_id: 'za47b02', label_id: 'lu91f5c' }, // final turn -> Final turn
      { zone_id: 'zc19d5e', label_id: 'lv7a26d' }, // final leg -> Final approach
    ],
  },
]

/**
 * Seed-time guard for the diagram_label answer-oracle security invariant
 * (see rwy-2709-layout.ts + phase6-plan.md): zone ids and label ids must be
 * disjoint sets, and the answer key must cover every zone exactly once.
 * Fails loudly — a silently-wrong answer key makes every manual eval wrong.
 */
function assertDiagramConfigInvariants(
  zones: DiagramZone[],
  labels: DiagramLabel[],
  answer: { zone_id: string; label_id: string }[],
): void {
  const zoneIds = new Set(zones.map((z) => z.id))
  const labelIds = new Set(labels.map((l) => l.id))
  const collisions = [...zoneIds].filter((id) => labelIds.has(id))
  if (collisions.length > 0) {
    throw new Error(`diagram_config invariant: zone/label id collision: ${collisions.join(', ')}`)
  }
  if (answer.length !== zoneIds.size) {
    throw new Error(
      `diagram_config invariant: answer has ${answer.length} entries, expected exactly ${zoneIds.size} (one per zone)`,
    )
  }
  const answeredZoneIds = new Set(answer.map((a) => a.zone_id))
  if (answeredZoneIds.size !== zoneIds.size) {
    throw new Error(
      'diagram_config invariant: answer does not cover each zone exactly once (duplicate zone_id)',
    )
  }
  const answeredLabelIds = new Set(answer.map((a) => a.label_id))
  if (answeredLabelIds.size !== answer.length) {
    throw new Error('diagram_config invariant: answer uses the same label_id more than once')
  }
  for (const a of answer) {
    if (!zoneIds.has(a.zone_id)) {
      throw new Error(`diagram_config invariant: answer references unknown zone_id '${a.zone_id}'`)
    }
    if (!labelIds.has(a.label_id)) {
      throw new Error(
        `diagram_config invariant: answer references unknown label_id '${a.label_id}'`,
      )
    }
  }
}

type QuestionRow = Record<string, unknown> & { question_number: string }

async function insertQuestionIfMissing(bankId: string, row: QuestionRow): Promise<boolean> {
  const { data: existing } = await db
    .from('questions')
    .select('id')
    .eq('bank_id', bankId)
    .eq('question_number', row.question_number)
    .is('deleted_at', null)
    .limit(1)
  if (existing && existing.length > 0) return false

  const { error } = await db.from('questions').insert(row)
  if (error) throw new Error(`Question ${row.question_number}: ${error.message}`)
  return true
}

// ---- main ---------------------------------------------------------------------

async function seed(): Promise<void> {
  // Org (shared slug with other eval seeds so the same login works everywhere)
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .upsert({ name: 'Egmont Aviation', slug: 'egmont-aviation' }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (orgErr || !org) throw new Error(`Org: ${orgErr?.message}`)

  const adminId = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  await ensureUser(adminId, org.id, ADMIN_EMAIL, 'admin')
  const studentId = await createAuthUser(STUDENT_EMAIL, STUDENT_PASSWORD)
  await ensureUser(studentId, org.id, STUDENT_EMAIL, 'student')

  // RT subject + topics are migration-seeded; look them up.
  const rtSubjectId = await lookupId('easa_subjects', 'code', 'RT')
  const p1TopicId = await lookupId('easa_topics', 'code', 'P1_ACRONYMS')
  const p2TopicId = await lookupId('easa_topics', 'code', 'P2_DIALOG')
  const p3TopicId = await lookupId('easa_topics', 'code', 'P3_MC')

  const bankId = await ensureBank(org.id, adminId)

  const base = {
    organization_id: org.id,
    bank_id: bankId,
    subject_id: rtSubjectId,
    explanation_text: 'See standard ICAO/EASA VFR radiotelephony phraseology.',
    difficulty: 'medium' as const,
    status: 'active' as const,
    created_by: adminId,
  }

  let inserted = 0

  // Part 3 — multiple_choice (answer key in correct_option_id; trigger strips it from options)
  for (const q of MULTIPLE_CHOICE) {
    const added = await insertQuestionIfMissing(bankId, {
      ...base,
      question_number: q.num,
      topic_id: p3TopicId,
      question_type: 'multiple_choice',
      question_text: q.text,
      options: q.options,
      canonical_answer: null,
      accepted_synonyms: [],
      dialog_template: null,
      blanks_config: [],
      correct_option_id: q.correct,
    })
    if (added) inserted++
  }

  // Part 1 — short_answer (graded against canonical_answer + accepted_synonyms)
  for (const q of SHORT_ANSWER) {
    const added = await insertQuestionIfMissing(bankId, {
      ...base,
      question_number: q.num,
      topic_id: p1TopicId,
      question_type: 'short_answer',
      question_text: q.text,
      options: [],
      canonical_answer: q.canonical,
      accepted_synonyms: q.synonyms,
      dialog_template: null,
      blanks_config: [],
      correct_option_id: null,
    })
    if (added) inserted++
  }

  // Part 2 — dialog_fill (per-blank keys in blanks_config; template `|...` stripped
  // by get_quiz_questions before the student sees it)
  for (const q of DIALOG_FILL) {
    const added = await insertQuestionIfMissing(bankId, {
      ...base,
      question_number: q.num,
      topic_id: p2TopicId,
      question_type: 'dialog_fill',
      question_text: q.text,
      options: [],
      canonical_answer: null,
      accepted_synonyms: [],
      dialog_template: q.template,
      blanks_config: q.blanks,
      correct_option_id: null,
    })
    if (added) inserted++
  }

  // Part 3 — ordering (canonical sequence in ordering_items; delivered shuffled by
  // get_quiz_questions; graded per-slot with partial credit by batch_submit_quiz)
  for (const q of ORDERING) {
    const added = await insertQuestionIfMissing(bankId, {
      ...base,
      question_number: q.num,
      topic_id: p3TopicId,
      question_type: 'ordering',
      question_text: q.text,
      options: [],
      canonical_answer: null,
      accepted_synonyms: [],
      dialog_template: null,
      blanks_config: [],
      ordering_items: q.items,
      correct_option_id: null,
    })
    if (added) inserted++
  }

  // Part 3 — diagram_label (answer key in diagram_config.answer; zones/labels
  // come from the canonical layout module shared with the SVG runner so the
  // seeded config always matches what's rendered — see rwy-2709-layout.ts)
  for (const q of DIAGRAM_LABEL) {
    assertDiagramConfigInvariants(RWY_2709_ZONES, RWY_2709_LABELS, q.answer)
    const added = await insertQuestionIfMissing(bankId, {
      ...base,
      explanation_text:
        'Left-hand traffic pattern for RWY 27/09: upwind, crosswind turn, crosswind, downwind turn, downwind, base turn, base, final turn, final.',
      question_number: q.num,
      topic_id: p3TopicId,
      question_type: 'diagram_label',
      question_text: q.text,
      options: [],
      canonical_answer: null,
      accepted_synonyms: [],
      dialog_template: null,
      blanks_config: [],
      ordering_items: [],
      correct_option_id: null,
      diagram_config: {
        image_ref: RWY_2709_IMAGE_REF,
        zones: RWY_2709_ZONES,
        labels: RWY_2709_LABELS,
        answer: q.answer,
      },
    })
    if (added) inserted++
  }

  const total =
    MULTIPLE_CHOICE.length +
    SHORT_ANSWER.length +
    DIALOG_FILL.length +
    ORDERING.length +
    DIAGRAM_LABEL.length
  console.log(
    'VFR RT Training eval seed complete (MC + short_answer + dialog_fill + ordering + diagram_label).',
  )
  console.log(`  Org:              Egmont Aviation (${org.id})`)
  console.log(`  Admin:            ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log(`  Student:          ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}`)
  console.log(`  RT subject:       ${rtSubjectId}`)
  console.log(
    `  Topics:           P1_ACRONYMS=${p1TopicId} P2_DIALOG=${p2TopicId} P3_MC=${p3TopicId}`,
  )
  console.log(
    `  Questions added:  ${inserted} (of ${total}: ${MULTIPLE_CHOICE.length} MC + ${SHORT_ANSWER.length} short_answer + ${DIALOG_FILL.length} dialog_fill + ${ORDERING.length} ordering + ${DIAGRAM_LABEL.length} diagram_label)`,
  )
  console.log('  No exam_config — training uses /app/vfr-rt (quick_quiz study mode)')
  console.log(
    '  Pick Part 1 → short_answer · Part 2 → dialog_fill · Part 3 → multiple_choice + ordering (drag) + diagram_label (drag-to-label)',
  )
  console.log('  Start at:         http://localhost:3000/app/vfr-rt')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
