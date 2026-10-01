import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { useQuizConfig } from '@/app/app/quiz/_hooks/use-quiz-config'
import { VfrRtPracticeSections } from './vfr-rt-practice-sections'

vi.mock('@/app/app/quiz/_components/topic-tree', () => ({
  TopicTree: () => <div data-testid="topic-tree" />,
}))
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
    ...over,
  } as unknown as Config
}

describe('VfrRtPracticeSections', () => {
  it('shows the topic tree and question count when topics exist', () => {
    render(<VfrRtPracticeSections config={makeConfig()} />)
    expect(screen.getByTestId('topic-tree')).toBeInTheDocument()
    expect(screen.getByTestId('question-count')).toBeInTheDocument()
  })

  it('hides the topic tree when there are no topics', () => {
    render(<VfrRtPracticeSections config={makeConfig({ topicTree: { topics: [] } })} />)
    expect(screen.queryByTestId('topic-tree')).not.toBeInTheDocument()
  })

  it('starts practice when Start Practice is clicked', async () => {
    const config = makeConfig()
    render(<VfrRtPracticeSections config={config} />)
    await userEvent.click(screen.getByRole('button', { name: /start practice/i }))
    expect(config.handleStart).toHaveBeenCalledTimes(1)
  })

  it('disables start when no questions are available', () => {
    render(<VfrRtPracticeSections config={makeConfig({ availableCount: 0 })} />)
    expect(screen.getByRole('button', { name: /start practice/i })).toBeDisabled()
  })

  it('shows the session-expired alert on an auth error', () => {
    render(<VfrRtPracticeSections config={makeConfig({ authError: true })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Session expired')
  })

  it('shows the config error message', () => {
    render(<VfrRtPracticeSections config={makeConfig({ error: 'Boom' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
  })
})
