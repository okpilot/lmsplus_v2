import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuizTabs } from './quiz-tabs'

describe('QuizTabs', () => {
  it('renders both tabs', () => {
    render(
      <QuizTabs
        hasDraft={false}
        newQuizContent={<div data-testid="new-quiz">New</div>}
        savedDraftContent={<div data-testid="saved-draft">Saved</div>}
      />,
    )
    expect(screen.getByTestId('tab-new')).toBeInTheDocument()
    expect(screen.getByTestId('tab-saved')).toBeInTheDocument()
  })

  it('shows new quiz content by default', () => {
    render(
      <QuizTabs
        hasDraft={false}
        newQuizContent={<div data-testid="new-quiz">New</div>}
        savedDraftContent={<div data-testid="saved-draft">Saved</div>}
      />,
    )
    expect(screen.getByTestId('new-quiz')).toBeInTheDocument()
    expect(screen.queryByTestId('saved-draft')).not.toBeInTheDocument()
  })

  it('switches to saved draft content when saved tab is clicked', () => {
    render(
      <QuizTabs
        hasDraft={false}
        newQuizContent={<div data-testid="new-quiz">New</div>}
        savedDraftContent={<div data-testid="saved-draft">Saved</div>}
      />,
    )
    fireEvent.click(screen.getByTestId('tab-saved'))
    expect(screen.queryByTestId('new-quiz')).not.toBeInTheDocument()
    expect(screen.getByTestId('saved-draft')).toBeInTheDocument()
  })

  it('shows badge when hasDraft is true', () => {
    render(
      <QuizTabs
        hasDraft={true}
        newQuizContent={<div>New</div>}
        savedDraftContent={<div>Saved</div>}
      />,
    )
    expect(screen.getByTestId('tab-saved')).toHaveTextContent('1')
  })

  it('does not show badge when hasDraft is false', () => {
    render(
      <QuizTabs
        hasDraft={false}
        newQuizContent={<div>New</div>}
        savedDraftContent={<div>Saved</div>}
      />,
    )
    expect(screen.getByTestId('tab-saved')).not.toHaveTextContent('1')
  })
})
