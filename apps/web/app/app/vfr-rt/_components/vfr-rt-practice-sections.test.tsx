import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { useQuizConfig } from '@/app/app/quiz/_hooks/use-quiz-config'
import { VfrRtPracticeSections } from './vfr-rt-practice-sections'

vi.mock('@/app/app/quiz/_components/question-count', () => ({
  QuestionCount: () => <div data-testid="question-count" />,
}))

type Config = ReturnType<typeof useQuizConfig>

function makeConfig(over: Partial<Record<string, unknown>> = {}): Config {
  return {
    topicTree: { topics: [{ id: 't1' }] },
    availableCount: 5,
    loading: false,
    isPending: false,
    authError: false,
    error: null,
    handleStart: vi.fn(),
    blocked: { offer: null, saving: false, error: null, onAccept: vi.fn() },
    ...over,
  } as unknown as Config
}

describe('VfrRtPracticeSections', () => {
  it('shows the question count when topics exist', () => {
    render(<VfrRtPracticeSections config={makeConfig()} />)
    expect(screen.getByTestId('question-count')).toBeInTheDocument()
  })

  it('shows the session-expired alert on an auth error', () => {
    render(<VfrRtPracticeSections config={makeConfig({ authError: true })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Session expired')
  })

  it('shows the config error message', () => {
    render(<VfrRtPracticeSections config={makeConfig({ error: 'Boom' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
  })

  it('renders the session-expired message with the shared field-error part', () => {
    render(<VfrRtPracticeSections config={makeConfig({ authError: true })} />)
    expect(screen.getByRole('alert')).toHaveAttribute('data-slot', 'field-error')
  })
})
