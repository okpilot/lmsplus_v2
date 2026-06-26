import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------
// QuestionCard and ExplanationTab use MarkdownText + ZoomableImage (which rely
// on next/image). Mock them with lightweight stand-ins. AnswerOptions is left
// unMocked so the green-highlight affordance is observable via data-testid.

vi.mock('@/app/app/_components/question-card', () => ({
  QuestionCard: ({ questionText }: { questionText: string }) => (
    <div data-testid="question-card">{questionText}</div>
  ),
}))

vi.mock('@/app/app/quiz/_components/explanation-tab', () => ({
  ExplanationTab: ({
    explanationText,
  }: {
    explanationText: string | null
    explanationImageUrl: string | null
  }) => (
    <div data-testid="explanation-tab">
      {explanationText ?? 'No explanation available for this question.'}
    </div>
  ),
}))

// ---- Subject under test ---------------------------------------------------

import type { StudyQuestion } from '@/lib/queries/study-queries'
import { StudyFlashcard } from './study-flashcard'

// ---- Fixtures -------------------------------------------------------------

function makeQuestion(overrides: Partial<StudyQuestion> = {}): StudyQuestion {
  return {
    id: 'q-1',
    questionText: 'What is the standard QNH?',
    questionImageUrl: null,
    options: [
      { id: 'a', text: '1000 hPa' },
      { id: 'b', text: '1013 hPa' },
      { id: 'c', text: '1025 hPa' },
    ],
    correctOptionId: 'b',
    subjectCode: 'MET',
    topicName: 'Atmosphere',
    subtopicName: 'Pressure',
    explanationText: 'Standard QNH is 1013.25 hPa.',
    explanationImageUrl: null,
    questionNumber: '010-001',
    difficulty: 'easy',
    ...overrides,
  }
}

function renderFlashcard(
  props: Partial<{ isFlagged: boolean; flagLoading: boolean; onToggleFlag: () => void }> = {},
  question = makeQuestion(),
) {
  return render(
    <StudyFlashcard
      question={question}
      isFlagged={props.isFlagged ?? false}
      onToggleFlag={props.onToggleFlag ?? vi.fn()}
      flagLoading={props.flagLoading ?? false}
    />,
  )
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Question rendering --------------------------------------------------

describe('StudyFlashcard — question rendering', () => {
  it('renders the question text', () => {
    renderFlashcard()
    expect(screen.getByTestId('question-card')).toHaveTextContent('What is the standard QNH?')
  })

  it('renders the explanation text', () => {
    renderFlashcard()
    expect(screen.getByTestId('explanation-tab')).toHaveTextContent('Standard QNH is 1013.25 hPa.')
  })

  it('renders the fallback explanation text when explanationText is null', () => {
    renderFlashcard({}, makeQuestion({ explanationText: null }))
    expect(screen.getByTestId('explanation-tab')).toHaveTextContent(
      'No explanation available for this question.',
    )
  })
})

// ---- Correct answer affordance -------------------------------------------

describe('StudyFlashcard — correct answer affordance', () => {
  it('applies the green highlight to the correct option', () => {
    // correctOptionId = 'b'; AnswerOptions renders with both selectedOptionId and
    // correctOptionId set to 'b', so showResult=true and isCorrect=true for 'b',
    // producing the border-green-500 class. Verified via data-testid, NOT internal prop.
    renderFlashcard()
    const correctOption = screen.getByTestId('option-b')
    expect(correctOption.className).toContain('border-green-500')
  })

  it('does not apply the green highlight to a non-correct option', () => {
    renderFlashcard()
    const wrongOption = screen.getByTestId('option-a')
    expect(wrongOption.className).not.toContain('border-green-500')
  })

  it('renders all options from the question', () => {
    renderFlashcard()
    expect(screen.getByTestId('option-a')).toBeInTheDocument()
    expect(screen.getByTestId('option-b')).toBeInTheDocument()
    expect(screen.getByTestId('option-c')).toBeInTheDocument()
  })
})

// ---- Flag button ---------------------------------------------------------

describe('StudyFlashcard — flag button', () => {
  it('shows the flag button in the unflagged state', () => {
    renderFlashcard({ isFlagged: false })
    const btn = screen.getByTestId('flag-button')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveTextContent('Flag')
  })

  it('shows the flag button in the flagged state', () => {
    renderFlashcard({ isFlagged: true })
    const btn = screen.getByTestId('flag-button')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveTextContent('Unflag')
  })

  it('calls onToggleFlag when the flag button is clicked', () => {
    const onToggleFlag = vi.fn()
    renderFlashcard({ onToggleFlag })
    screen.getByTestId('flag-button').click()
    expect(onToggleFlag).toHaveBeenCalledTimes(1)
  })

  it('disables the flag button while a flag toggle is in progress', () => {
    renderFlashcard({ flagLoading: true })
    expect(screen.getByTestId('flag-button')).toBeDisabled()
  })
})

// ---- Metadata badges -----------------------------------------------------

describe('StudyFlashcard — metadata badges', () => {
  it('renders the subject code badge when subjectCode is provided', () => {
    renderFlashcard({}, makeQuestion({ subjectCode: 'MET' }))
    expect(screen.getByText('MET')).toBeInTheDocument()
  })

  it('does not render a subject code badge when subjectCode is null', () => {
    renderFlashcard({}, makeQuestion({ subjectCode: null }))
    // The badge for the subject code is removed entirely — ensure no stray text.
    expect(screen.queryByText('MET')).not.toBeInTheDocument()
  })

  it('renders the topic name when topicName is provided', () => {
    renderFlashcard({}, makeQuestion({ topicName: 'Navigation' }))
    expect(screen.getByText('Navigation')).toBeInTheDocument()
  })

  it('renders the question number when questionNumber is provided', () => {
    renderFlashcard({}, makeQuestion({ questionNumber: '010-001' }))
    expect(screen.getByText('#010-001')).toBeInTheDocument()
  })
})
