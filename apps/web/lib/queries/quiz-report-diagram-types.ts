import type { QuizReportQuestionCommon } from './quiz-report'

// One report entry per ZONE of a diagram_label question. Split out of
// quiz-report.ts to keep that file under the 200-line utility cap
// (code-style.md §1).
export type DiagramZoneResult = {
  blankIndex: number
  placedLabel: string | null
  correctLabel: string
  isCorrect: boolean
}

// The diagram_label variant of the QuizReportQuestion discriminated union —
// imported back into quiz-report.ts's union definition.
export type DiagramLabelQuestion = QuizReportQuestionCommon & {
  questionType: 'diagram_label'
  // True only when every zone is correctly labeled.
  isCorrect: boolean
  zones: DiagramZoneResult[]
  // Number of correct zones and total zones, for the 3-state partial display.
  correctCount: number
  totalZones: number
}
