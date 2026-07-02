'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { MAX_LABELS, MAX_ZONES } from '@/app/app/quiz/actions/diagram-validation'
import {
  isUniquePermutation,
  MAX_ORDER_ITEMS,
  MIN_ORDER_ITEMS,
} from '@/app/app/quiz/actions/ordering-validation'
import { rpc } from '@/lib/supabase-rpc'

type DiagramZoneRow = { id: string; x: number; y: number; w: number; h: number }
type DiagramLabelRow = { id: string; text: string }
type DiagramConfigRow = { image_ref: string; zones: DiagramZoneRow[]; labels: DiagramLabelRow[] }

type QuizQuestionRow = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  explanation_text: string | null
  explanation_image_url: string | null
  options: unknown
  question_type: 'multiple_choice' | 'short_answer' | 'dialog_fill' | 'ordering' | 'diagram_label'
  dialog_template: string | null
  blanks_safe: unknown
  ordering_items_shuffled: unknown
  diagram_config_public: unknown
}

type Question = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  explanation_text: string | null
  explanation_image_url: string | null
  options: { id: string; text: string }[]
  question_type: 'multiple_choice' | 'short_answer' | 'dialog_fill' | 'ordering' | 'diagram_label'
  dialog_template: string | null
  blanks_safe: { index: number }[] | null
  ordering_items: { id: string; text: string }[] | null
  diagram_config: DiagramConfigRow | null
}

type LoadResult = { success: true; questions: Question[] } | { success: false; error: string }

// Element-level guard for the ordering_items_shuffled RPC payload (#998 CR). Array.isArray
// alone would admit a malformed array whose elements lack string id/text and pass it through
// as trusted ordering items; this narrows the cast per code-style §5 (pair a cast with a
// runtime guard). The id/text values are CHECK-enforced server-side (mig 143), so this is
// defense-in-depth, but it keeps the mapper honest against future RPC drift.
function isOrderingItem(value: unknown): value is { id: string; text: string } {
  if (typeof value !== 'object' || value === null) return false
  const { id, text } = value as { id?: unknown; text?: unknown }
  // Mirror the DB CHECK (mig 143 is_valid_ordering_items: btrim(id) != '' AND
  // btrim(text) != '') — a blank id breaks id-keyed grading, a blank text renders
  // an empty draggable slot. Reject empty/whitespace-only strings, not just non-strings.
  return (
    typeof id === 'string' &&
    id.trim().length > 0 &&
    typeof text === 'string' &&
    text.trim().length > 0
  )
}

function isOrderingItemArray(value: unknown): value is { id: string; text: string }[] {
  if (
    !Array.isArray(value) ||
    value.length < MIN_ORDER_ITEMS ||
    value.length > MAX_ORDER_ITEMS ||
    !value.every(isOrderingItem)
  )
    return false
  return isUniquePermutation(value.map((v) => v.id))
}

function isDiagramZone(value: unknown): value is DiagramZoneRow {
  if (typeof value !== 'object' || value === null) return false
  const { id, x, y, w, h } = value as Record<string, unknown>
  // Number.isFinite (not typeof === 'number') rejects NaN/Infinity — fail-closed,
  // mirroring the guard style used elsewhere in this file (isOrderingItem).
  return (
    typeof id === 'string' &&
    id.trim().length > 0 &&
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    typeof w === 'number' &&
    Number.isFinite(w) &&
    typeof h === 'number' &&
    Number.isFinite(h)
  )
}

function isDiagramLabel(value: unknown): value is DiagramLabelRow {
  if (typeof value !== 'object' || value === null) return false
  const { id, text } = value as Record<string, unknown>
  return (
    typeof id === 'string' &&
    id.trim().length > 0 &&
    typeof text === 'string' &&
    text.trim().length > 0
  )
}

// Element + bounds guard for the diagram_config_public RPC payload (parity
// with isOrderingItemArray above, code-style §5 cast-guard rule). The DB
// CHECK (mig 150, is_valid_diagram_config) enforces the same shape
// server-side — this is defense-in-depth against RPC drift.
function isDiagramConfig(value: unknown): value is DiagramConfigRow {
  if (typeof value !== 'object' || value === null) return false
  const { image_ref, zones, labels } = value as Record<string, unknown>
  if (typeof image_ref !== 'string' || image_ref.trim().length === 0) return false
  if (!Array.isArray(zones) || zones.length === 0 || zones.length > MAX_ZONES) return false
  if (!zones.every(isDiagramZone)) return false
  if (!Array.isArray(labels) || labels.length === 0 || labels.length > MAX_LABELS) return false
  if (!labels.every(isDiagramLabel)) return false
  return true
}

// Reconstruct from ONLY the validated fields. A `value is T` predicate asserts
// shape but does NOT strip extra properties, so a future RPC regression that
// leaked an extra key (e.g. an answer hint on a zone/label) would otherwise pass
// straight through to the student. Rebuilding is the real "defense-in-depth
// against RPC drift" the isDiagramConfig comment promises.
function toDiagramConfigRow(value: DiagramConfigRow): DiagramConfigRow {
  return {
    image_ref: value.image_ref,
    zones: value.zones.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
    labels: value.labels.map(({ id, text }) => ({ id, text })),
  }
}

export async function loadSessionQuestions(questionIds: string[]): Promise<LoadResult> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[loadSessionQuestions] Auth error:', authError.message)
    return { success: false, error: 'Not authenticated' }
  }
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await rpc<QuizQuestionRow[]>(supabase, 'get_quiz_questions', {
    p_question_ids: questionIds,
  })

  if (error) {
    console.error('[loadSessionQuestions] RPC error:', error.message)
    return { success: false, error: 'Failed to load questions. Please try again.' }
  }

  if (!data?.length) {
    return { success: false, error: 'No questions found' }
  }

  const questions: Question[] = data.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    question_image_url: q.question_image_url,
    question_number: q.question_number,
    explanation_text: q.explanation_text,
    explanation_image_url: q.explanation_image_url,
    options: Array.isArray(q.options) ? (q.options as { id: string; text: string }[]) : [],
    question_type: q.question_type,
    dialog_template: q.dialog_template,
    blanks_safe: Array.isArray(q.blanks_safe) ? (q.blanks_safe as { index: number }[]) : null,
    ordering_items: isOrderingItemArray(q.ordering_items_shuffled)
      ? q.ordering_items_shuffled
      : null,
    diagram_config: isDiagramConfig(q.diagram_config_public)
      ? toDiagramConfigRow(q.diagram_config_public)
      : null,
  }))

  // Preserve the order from questionIds
  const orderMap = new Map(questionIds.map((id, i) => [id, i]))
  questions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))

  return { success: true, questions }
}
