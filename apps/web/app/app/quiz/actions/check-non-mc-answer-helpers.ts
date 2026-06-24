// Runtime type guards + input mapper for the check_non_mc_answer Server Action.
// Hoisted out of check-non-mc-answer.ts to keep the action under the 100-line
// server-action cap (code-style.md §1).
import type { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

const MAX_DIALOG_BLANKS = 50

// `.strict()` rejects a mixed payload ({responseText, blankAnswers}) instead of
// letting z.union strip the extra key and grade it as short_answer.
const ShortAnswerInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    responseText: z.string().trim().min(1).max(500),
  })
  .strict()

const DialogFillInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    blankAnswers: z
      .array(
        z.object({
          index: z.number().int().min(0).max(9999),
          text: z.string().trim().min(1).max(200),
        }),
      )
      .min(1)
      .max(MAX_DIALOG_BLANKS)
      .superRefine((answers, ctx) => {
        const seen = new Set<number>()
        for (const [position, a] of answers.entries()) {
          if (seen.has(a.index)) {
            ctx.addIssue({
              code: 'custom',
              path: [position, 'index'],
              message: 'Duplicate blank index',
            })
          }
          seen.add(a.index)
        }
      }),
  })
  .strict()

export const CheckNonMcAnswerSchema = z.union([ShortAnswerInput, DialogFillInput])

// Defense-in-depth session ownership + membership check (mirrors check-answer.ts).
// The RPC self-guards, but the action fails fast on a foreign/closed session or a
// question outside it. Returns an error string on failure, null on success.
export async function verifySessionMembership(
  supabase: SupabaseClient,
  opts: { sessionId: string; userId: string; questionId: string },
): Promise<string | null> {
  const { data: session, error } = await supabase
    .from('quiz_sessions')
    .select('config')
    .eq('id', opts.sessionId)
    .eq('student_id', opts.userId)
    .is('ended_at', null)
    .is('deleted_at', null)
    .single()
  if (error || !session) return 'Session not found'
  const config = (session as unknown as { config: { question_ids: unknown } }).config
  const qIds = config?.question_ids
  if (!Array.isArray(qIds) || !qIds.includes(opts.questionId)) return 'Question not in session'
  return null
}

// Raw jsonb shape returned by check_non_mc_answer (mig 119).
export type ShortAnswerRpcResult = {
  is_correct: boolean
  correct_answer: string | null
  blanks: null
  explanation_text: string | null
  explanation_image_url: string | null
}

export type DialogBlankRpcRow = {
  index: number
  is_correct: boolean
  canonical: string
}

export type DialogFillRpcResult = {
  is_correct: boolean
  correct_answer: null
  blanks: DialogBlankRpcRow[]
  explanation_text: string | null
  explanation_image_url: string | null
}

function isNullableString(v: unknown): boolean {
  return v === null || typeof v === 'string'
}

function isDialogBlankRow(v: unknown): v is DialogBlankRpcRow {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    Number.isInteger(r.index) &&
    (r.index as number) >= 0 &&
    (r.index as number) <= 9999 &&
    typeof r.is_correct === 'boolean' &&
    typeof r.canonical === 'string'
  )
}

// short_answer narrows on `blanks === null` (the RPC sets blanks NULL for
// short_answer, an array for dialog_fill — see mig 119 §9).
export function isShortAnswerRpcResult(value: unknown): value is ShortAnswerRpcResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.is_correct === 'boolean' &&
    isNullableString(v.correct_answer) &&
    v.blanks === null &&
    isNullableString(v.explanation_text) &&
    isNullableString(v.explanation_image_url)
  )
}

export function isDialogFillRpcResult(value: unknown): value is DialogFillRpcResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.is_correct === 'boolean' &&
    v.correct_answer === null &&
    Array.isArray(v.blanks) &&
    // A dialog_fill always has ≥1 blank (input is `blankAnswers.min(1)`), so an
    // empty blanks array is a malformed RPC result — reject it rather than
    // returning success with no per-blank feedback.
    v.blanks.length > 0 &&
    v.blanks.every(isDialogBlankRow) &&
    isNullableString(v.explanation_text) &&
    isNullableString(v.explanation_image_url)
  )
}

// The client carries blanks as {index, text}; the RPC expects
// {blank_index, response_text} (mig 119 input contract).
export function toRpcBlankAnswers(
  blanks: { index: number; text: string }[],
): { blank_index: number; response_text: string }[] {
  return blanks.map((b) => ({ blank_index: b.index, response_text: b.text }))
}

// Maps the RPC's snake_case per-blank rows to the camelCase client shape.
export function toClientBlanks(
  rows: DialogBlankRpcRow[],
): { index: number; isCorrect: boolean; canonical: string }[] {
  return rows.map((b) => ({ index: b.index, isCorrect: b.is_correct, canonical: b.canonical }))
}
