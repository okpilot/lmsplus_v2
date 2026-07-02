import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizState } from '../_hooks/use-quiz-state'

// ---- Mocks -----------------------------------------------------------------

vi.mock('@/app/app/_components/answer-options', () => ({
  AnswerOptions: () => <div data-testid="answer-options" />,
}))

vi.mock('./short-answer-input', () => ({
  ShortAnswerInput: () => <div data-testid="short-answer-input" />,
}))

vi.mock('./dialog-fill-input', () => ({
  DialogFillInput: () => <div data-testid="dialog-fill-input" />,
}))

vi.mock('./ordering-input', () => ({
  OrderingInput: ({ items }: { items: { id: string; text: string }[] }) => (
    <div data-testid="ordering-input" data-items={JSON.stringify(items.map((it) => it.id))} />
  ),
}))

vi.mock('./diagram-label-input', () => ({
  DiagramLabelInput: ({ zones }: { zones: { id: string }[] }) => (
    <div data-testid="diagram-label-input" data-zone-ids={JSON.stringify(zones.map((z) => z.id))} />
  ),
}))

// ---- Subject under test ----------------------------------------------------

import { AnswerInput } from './answer-input'

// ---- Helpers ---------------------------------------------------------------

function makeOrderingState(
  orderingItems: { id: string; text: string }[] | null,
  overrides: Partial<QuizState> = {},
): QuizState {
  return {
    isExam: false,
    question: {
      id: 'q-ord',
      question_text: 'Order these steps',
      question_image_url: null,
      question_number: '050-01-01-004',
      explanation_text: null,
      explanation_image_url: null,
      options: [],
      question_type: 'ordering',
      dialog_template: null,
      blanks_safe: null,
      ordering_items: orderingItems,
      diagram_config: null,
    },
    questionId: 'q-ord',
    currentFeedback: null,
    existingAnswer: undefined,
    submitting: false,
    answering: false,
    handleSelectAnswer: vi.fn(),
    handleTextAnswer: vi.fn(),
    handleDialogFillAnswer: vi.fn(),
    handleOrderingAnswer: vi.fn(),
    handleDiagramLabelAnswer: vi.fn(),
    ...overrides,
  } as unknown as QuizState
}

function makeDiagramLabelState(
  diagramConfig: {
    image_ref: string
    zones: { id: string; x: number; y: number; w: number; h: number }[]
    labels: { id: string; text: string }[]
  } | null,
  overrides: Partial<QuizState> = {},
): QuizState {
  return {
    isExam: false,
    question: {
      id: 'q-diagram',
      question_text: 'Label the traffic pattern',
      question_image_url: null,
      question_number: '050-01-01-005',
      explanation_text: null,
      explanation_image_url: null,
      options: [],
      question_type: 'diagram_label',
      dialog_template: null,
      blanks_safe: null,
      ordering_items: null,
      diagram_config: diagramConfig,
    },
    questionId: 'q-diagram',
    currentFeedback: null,
    existingAnswer: undefined,
    submitting: false,
    answering: false,
    handleSelectAnswer: vi.fn(),
    handleTextAnswer: vi.fn(),
    handleDialogFillAnswer: vi.fn(),
    handleOrderingAnswer: vi.fn(),
    handleDiagramLabelAnswer: vi.fn(),
    ...overrides,
  } as unknown as QuizState
}

// ---- Tests -----------------------------------------------------------------

describe('AnswerInput — ordering question item guard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows a refresh prompt when ordering items are absent', () => {
    render(<AnswerInput s={makeOrderingState(null)} />)
    expect(screen.getByRole('alert')).toHaveTextContent('refresh')
    expect(screen.queryByTestId('ordering-input')).not.toBeInTheDocument()
  })

  it('shows a refresh prompt when ordering items is an empty list', () => {
    render(<AnswerInput s={makeOrderingState([])} />)
    expect(screen.getByRole('alert')).toHaveTextContent('refresh')
    expect(screen.queryByTestId('ordering-input')).not.toBeInTheDocument()
  })

  it('shows a refresh prompt when only one ordering item is provided', () => {
    // An ordering question requires ≥2 items (CHECK-enforced in prod). A single-item
    // payload cannot be arranged into a meaningful sequence — the prior guard
    // (!ordering_items?.length) silently rendered a one-item drag area the student
    // could submit; the tightened guard (items.length < 2) fails closed instead.
    render(<AnswerInput s={makeOrderingState([{ id: 'a', text: 'Alpha' }])} />)
    expect(screen.getByRole('alert')).toHaveTextContent('refresh')
    expect(screen.queryByTestId('ordering-input')).not.toBeInTheDocument()
  })

  it('renders the ordering input when two or more items are provided', () => {
    render(
      <AnswerInput
        s={makeOrderingState([
          { id: 'a', text: 'Alpha' },
          { id: 'b', text: 'Bravo' },
        ])}
      />,
    )
    expect(screen.getByTestId('ordering-input')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('passes all item ids to the ordering input in the delivered order', () => {
    // Regression guard: confirms AnswerInput forwards ordering_items intact to
    // OrderingInput — a proxy/wrapper bug that drops or shuffles items would fail here.
    render(
      <AnswerInput
        s={makeOrderingState([
          { id: 'step-1', text: 'First' },
          { id: 'step-2', text: 'Second' },
          { id: 'step-3', text: 'Third' },
        ])}
      />,
    )
    expect(screen.getByTestId('ordering-input').getAttribute('data-items')).toBe(
      JSON.stringify(['step-1', 'step-2', 'step-3']),
    )
  })
})

describe('AnswerInput — diagram_label question config guard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows a refresh prompt when the diagram config is absent', () => {
    render(<AnswerInput s={makeDiagramLabelState(null)} />)
    expect(screen.getByRole('alert')).toHaveTextContent('refresh')
    expect(screen.queryByTestId('diagram-label-input')).not.toBeInTheDocument()
  })

  it('shows a refresh prompt when the diagram config has no zones', () => {
    render(
      <AnswerInput
        s={makeDiagramLabelState({
          image_ref: 'rwy-2709-lh-pattern',
          zones: [],
          labels: [{ id: 'l1', text: 'Upwind' }],
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('refresh')
    expect(screen.queryByTestId('diagram-label-input')).not.toBeInTheDocument()
  })

  it('shows a refresh prompt when the diagram config has no labels', () => {
    render(
      <AnswerInput
        s={makeDiagramLabelState({
          image_ref: 'rwy-2709-lh-pattern',
          zones: [{ id: 'z1', x: 0, y: 0, w: 0.1, h: 0.1 }],
          labels: [],
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('refresh')
    expect(screen.queryByTestId('diagram-label-input')).not.toBeInTheDocument()
  })

  it('renders the diagram label input when a valid config is provided', () => {
    render(
      <AnswerInput
        s={makeDiagramLabelState({
          image_ref: 'rwy-2709-lh-pattern',
          zones: [{ id: 'z1', x: 0, y: 0, w: 0.1, h: 0.1 }],
          labels: [{ id: 'l1', text: 'Upwind' }],
        })}
      />,
    )
    expect(screen.getByTestId('diagram-label-input')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders a drop-zone for each delivered zone id', () => {
    render(
      <AnswerInput
        s={makeDiagramLabelState({
          image_ref: 'rwy-2709-lh-pattern',
          zones: [
            { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.1 },
            { id: 'z2', x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
          ],
          labels: [{ id: 'l1', text: 'Upwind' }],
        })}
      />,
    )
    expect(screen.getByTestId('diagram-label-input').getAttribute('data-zone-ids')).toBe(
      JSON.stringify(['z1', 'z2']),
    )
  })
})
