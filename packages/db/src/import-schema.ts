import { z } from 'zod'

const OptionSchema = z.object({
  id: z.enum(['a', 'b', 'c', 'd']),
  // Mirror OptionInputSchema (schema.ts): trim so whitespace-only option text is rejected.
  text: z.string().trim().min(1),
})

export const ImportQuestionSchema = z
  .object({
    // Identity/code fields are trimmed: trailing whitespace on a subject/topic/subtopic
    // code would silently fail the `.eq('code', …)` lookup in import-questions.ts.
    question_number: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    subject_name: z.string().trim().min(1),
    topic: z.string().trim().nullable(),
    topic_name: z.string().trim().nullable(),
    subtopic: z.string().trim().nullable(),
    subtopic_name: z.string().trim().nullable(),
    lo_reference: z.string().trim().nullable(),
    // Text fields mirror schema.ts (UpsertQuestionSchema): trim + cap length so
    // whitespace-only and oversized values are rejected at import, same as the admin UI.
    question_text: z.string().trim().min(1).max(10000),
    // NOTE: image fields are import-side *filenames* (basenames), NOT URLs. import-questions.ts
    // resolves each against --base-dir, uploads it, and only then derives the public URL. They
    // are deliberately NOT z.url() here (schema.ts's same-named columns ARE urls) — a z.url()
    // guard would reject every real import. See apps/web/scripts/import-questions.ts (uploadImage).
    question_image_url: z.string().nullable(),
    options: z.array(OptionSchema).length(4),
    // MC answer key (#823) — carried as a top-level column, never in options[].
    correct_option_id: z.enum(['a', 'b', 'c', 'd']),
    explanation_text: z.string().trim().min(1).max(10000),
    explanation_image_url: z.string().nullable(),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
  })
  // Mirror schema.ts (UpsertQuestionSchema): four distinct option ids, else the
  // answer key / scoring semantics are ambiguous.
  .refine((q) => new Set(q.options.map((o) => o.id)).size === 4, {
    message: 'Option IDs must be unique',
  })
  .refine((q) => q.options.some((o) => o.id === q.correct_option_id), {
    message: 'correct_option_id must match an option id',
  })

export type ImportQuestion = z.infer<typeof ImportQuestionSchema>

export const ImportFileSchema = z.array(ImportQuestionSchema).min(1)
