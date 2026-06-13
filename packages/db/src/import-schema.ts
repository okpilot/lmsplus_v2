import { z } from 'zod'

const OptionSchema = z.object({
  id: z.enum(['a', 'b', 'c', 'd']),
  text: z.string().min(1),
})

export const ImportQuestionSchema = z
  .object({
    question_number: z.string().min(1),
    subject: z.string().min(1),
    subject_name: z.string().min(1),
    topic: z.string().nullable(),
    topic_name: z.string().nullable(),
    subtopic: z.string().nullable(),
    subtopic_name: z.string().nullable(),
    lo_reference: z.string().nullable(),
    question_text: z.string().min(1),
    question_image_url: z.string().nullable(),
    options: z.array(OptionSchema).length(4),
    // MC answer key (#823) — carried as a top-level column, never in options[].
    correct_option_id: z.enum(['a', 'b', 'c', 'd']),
    explanation_text: z.string().min(1),
    explanation_image_url: z.string().nullable(),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
  })
  .refine((q) => q.options.some((o) => o.id === q.correct_option_id), {
    message: 'correct_option_id must match an option id',
  })

export type ImportQuestion = z.infer<typeof ImportQuestionSchema>

export const ImportFileSchema = z.array(ImportQuestionSchema).min(1)
