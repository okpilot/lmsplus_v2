import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../actions/upload-question-image', () => ({ uploadQuestionImage: vi.fn() }))

import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionOption } from '../types'
import { QuestionFormFields } from './question-form-fields'

const OPTIONS: QuestionOption[] = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
  { id: 'c', text: 'Gamma' },
  { id: 'd', text: 'Delta' },
]

function renderForm() {
  return render(
    <QuestionFormFields
      tree={[] as SyllabusTree}
      subjectId={undefined}
      topicId={undefined}
      subtopicId={null}
      questionNumber=""
      loReference=""
      questionText=""
      options={OPTIONS}
      correctOptionId="a"
      explanationText=""
      questionImageUrl={null}
      explanationImageUrl={null}
      difficulty="medium"
      status="active"
      hasCalculations={false}
      isPending={false}
      onSubjectChange={vi.fn()}
      onTopicChange={vi.fn()}
      onSubtopicChange={vi.fn()}
      onQuestionNumberChange={vi.fn()}
      onLoReferenceChange={vi.fn()}
      onQuestionTextChange={vi.fn()}
      onOptionsChange={vi.fn()}
      onCorrectOptionChange={vi.fn()}
      onExplanationTextChange={vi.fn()}
      onQuestionImageChange={vi.fn()}
      onExplanationImageChange={vi.fn()}
      onDifficultyChange={vi.fn()}
      onStatusChange={vi.fn()}
      onHasCalculationsChange={vi.fn()}
    />,
  )
}

describe('QuestionFormFields labels', () => {
  it.each(['Subject', 'Topic', 'Options', 'Question Text'])(
    'renders "%s" without an asterisk',
    (t) => {
      renderForm()
      expect(screen.getByText(t)).toBeInTheDocument()
      expect(screen.queryByText(`${t} *`)).not.toBeInTheDocument()
    },
  )

  it.each([
    'Subtopic (optional)',
    'Question # (optional)',
    'LO Reference (optional)',
    'Explanation (optional)',
  ])('renders "%s"', (t) => {
    renderForm()
    expect(screen.getByText(t)).toBeInTheDocument()
  })

  it('styles field-group labels text-label + text-muted-foreground', () => {
    renderForm()
    for (const t of ['Subject', 'Options', 'Question # (optional)']) {
      const cls = screen.getByText(t).className
      expect(cls).toMatch(/(?<![\w-])text-label(?![\w-])/)
      expect(cls).toContain('text-muted-foreground')
    }
  })
})
