import { z } from 'zod'
import { isValidDiagramMapping, MAX_DIAGRAM_ID_LENGTH, MAX_ZONES } from './diagram-validation'

// Shared Zod fragment for a single submitted zone/label id. `.trim()` before
// min/max so a whitespace-only token can't pass `min(1)` — keeps the save
// (quiz-progress-schema.ts) and grade (check-non-mc-answer-schema.ts) sibling schemas at
// parity, and matches isDiagramId's runtime guard in diagram-validation.ts.
export const diagramIdSchema = z.string().trim().min(1).max(MAX_DIAGRAM_ID_LENGTH)

/**
 * Shared Zod schema for a submitted diagram mapping array — the single
 * source for the {zoneId, labelId}[] shape, so the bound + dedup rule can't
 * drift between the save schema (quiz-progress-schema.ts) and the grade schema
 * (check-non-mc-answer-schema.ts). Server-only: client code uses the zod-free
 * guards in diagram-validation.ts.
 */
export const DiagramMappingSchema = z
  .array(
    z
      .object({
        zoneId: diagramIdSchema,
        labelId: diagramIdSchema,
      })
      .strict(),
  )
  .min(1)
  .max(MAX_ZONES)
  .refine(isValidDiagramMapping, 'Diagram mapping must have distinct zones and distinct labels')
