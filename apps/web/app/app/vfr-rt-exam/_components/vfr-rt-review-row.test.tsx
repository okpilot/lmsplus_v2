import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VfrRtReviewRow as VfrRtReviewRowType } from '@/lib/queries/vfr-rt-results'
import { VfrRtReviewRow } from './vfr-rt-review-row'

vi.mock('@/app/app/_components/markdown-text', () => ({
  MarkdownText: ({ children, ...props }: { children: React.ReactNode; className?: string }) => (
    <div {...props}>{children}</div>
  ),
}))

vi.mock('@/app/app/_components/zoomable-image', () => ({
  ZoomableImage: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: test mock — no Next.js Image needed
    <img src={src} alt={alt} />
  ),
}))

const baseRow: VfrRtReviewRowType = {
  questionId: 'q-1',
  questionType: 'short_answer',
  questionText: 'What does QNH mean?',
  questionImageUrl: null,
  options: null,
  answers: [
    {
      blank_index: null,
      selected_option_id: null,
      response_text: 'Nautical Height',
      is_correct: true,
    },
  ],
  key: { canonical_answer: 'Nautical Height', accepted_synonyms: ['NH'] },
  explanationText: 'QNH is the altimeter setting.',
  explanationImageUrl: null,
  isCorrect: true,
}

describe('VfrRtReviewRow — short_answer', () => {
  it('renders the question label and text', () => {
    render(<VfrRtReviewRow row={baseRow} index={0} />)
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(screen.getByText('What does QNH mean?')).toBeInTheDocument()
  })

  it('shows correct badge when isCorrect is true', () => {
    render(<VfrRtReviewRow row={baseRow} index={0} />)
    expect(screen.getByRole('img', { name: 'Correct' })).toBeInTheDocument()
  })

  it('shows incorrect badge when isCorrect is false', () => {
    const row: VfrRtReviewRowType = {
      ...baseRow,
      isCorrect: false,
      answers: [
        { blank_index: null, selected_option_id: null, response_text: 'Wrong', is_correct: false },
      ],
    }
    render(<VfrRtReviewRow row={row} index={1} />)
    expect(screen.getByRole('img', { name: 'Incorrect' })).toBeInTheDocument()
  })

  it('renders student answer and correct answer for short_answer', () => {
    render(<VfrRtReviewRow row={baseRow} index={0} />)
    // Both "Your answer" and "Correct answer" show the same value here
    expect(screen.getAllByText('Nautical Height')).toHaveLength(2)
  })

  it('renders the explanation text', () => {
    render(<VfrRtReviewRow row={baseRow} index={0} />)
    expect(screen.getByText('QNH is the altimeter setting.')).toBeInTheDocument()
  })
})

describe('VfrRtReviewRow — multiple_choice with options', () => {
  const mcRow: VfrRtReviewRowType = {
    questionId: 'q-2',
    questionType: 'multiple_choice',
    questionText: 'Which is the correct call?',
    questionImageUrl: null,
    options: [
      { id: 'opt-a', text: 'Mayday' },
      { id: 'opt-b', text: 'Pan-Pan' },
      { id: 'opt-c', text: 'Wilco' },
    ],
    answers: [
      {
        blank_index: null,
        selected_option_id: 'opt-a',
        response_text: null,
        is_correct: true,
      },
    ],
    key: { correct_option_id: 'opt-a' },
    explanationText: 'Mayday is the distress call.',
    explanationImageUrl: null,
    isCorrect: true,
  }

  it('renders option texts when options are present', () => {
    render(<VfrRtReviewRow row={mcRow} index={1} />)
    expect(screen.getByText('Mayday')).toBeInTheDocument()
    expect(screen.getByText('Pan-Pan')).toBeInTheDocument()
    expect(screen.getByText('Wilco')).toBeInTheDocument()
  })

  it('marks the correct option', () => {
    render(<VfrRtReviewRow row={mcRow} index={1} />)
    expect(screen.getByText('Correct · Your answer')).toBeInTheDocument()
  })

  it('marks the wrong pick and highlights the correct option separately', () => {
    const mcWrongRow: VfrRtReviewRowType = {
      ...mcRow,
      answers: [
        { blank_index: null, selected_option_id: 'opt-b', response_text: null, is_correct: false },
      ],
      isCorrect: false,
    }
    render(<VfrRtReviewRow row={mcWrongRow} index={1} />)
    // The wrong pick (opt-b) is labelled "Your answer"; the key (opt-a) "Correct".
    expect(screen.getByText('Your answer')).toBeInTheDocument()
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.queryByText('Correct · Your answer')).not.toBeInTheDocument()
  })
})

describe('VfrRtReviewRow — multiple_choice without options (fallback)', () => {
  const mcNoOptsRow: VfrRtReviewRowType = {
    questionId: 'q-3',
    questionType: 'multiple_choice',
    questionText: 'Select the correct option.',
    questionImageUrl: null,
    options: null,
    answers: [
      {
        blank_index: null,
        selected_option_id: 'opt-b',
        response_text: null,
        is_correct: false,
      },
    ],
    key: { correct_option_id: 'opt-a' },
    explanationText: '',
    explanationImageUrl: null,
    isCorrect: false,
  }

  it('renders fallback text when options are null', () => {
    render(<VfrRtReviewRow row={mcNoOptsRow} index={2} />)
    expect(screen.getByText(/You answered:/)).toBeInTheDocument()
    expect(screen.getByText('opt-b')).toBeInTheDocument()
    expect(screen.getByText(/Correct:/)).toBeInTheDocument()
    expect(screen.getByText('opt-a')).toBeInTheDocument()
  })
})

describe('VfrRtReviewRow — dialog_fill', () => {
  const dialogRow: VfrRtReviewRowType = {
    questionId: 'q-4',
    questionType: 'dialog_fill',
    questionText: 'Complete the dialog.',
    questionImageUrl: null,
    options: null,
    answers: [
      {
        blank_index: 0,
        selected_option_id: null,
        response_text: 'Golf',
        is_correct: true,
      },
      {
        blank_index: 1,
        selected_option_id: null,
        response_text: 'Alpha',
        is_correct: false,
      },
    ],
    key: {
      blanks: [
        { index: 0, canonical: 'Golf', synonyms: [] },
        { index: 1, canonical: 'Bravo', synonyms: ['B'] },
      ],
    },
    explanationText: '',
    explanationImageUrl: null,
    isCorrect: false,
  }

  it('renders per-blank student and correct answers', () => {
    render(<VfrRtReviewRow row={dialogRow} index={3} />)
    expect(screen.getByText(/Blank 1/)).toBeInTheDocument()
    expect(screen.getByText(/Blank 2/)).toBeInTheDocument()
    // "Golf" is both the student answer and the correct answer for blank 1
    expect(screen.getAllByText('Golf').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
  })
})
