import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuizTabs } from './quiz-tabs'

describe('QuizTabs', () => {
  it('renders both tabs', () => {
    render(
      <QuizTabs
        draftCount={0}
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
        draftCount={0}
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
        draftCount={0}
        newQuizContent={<div data-testid="new-quiz">New</div>}
        savedDraftContent={<div data-testid="saved-draft">Saved</div>}
      />,
    )
    fireEvent.click(screen.getByTestId('tab-saved'))
    expect(screen.queryByTestId('new-quiz')).not.toBeInTheDocument()
    expect(screen.getByTestId('saved-draft')).toBeInTheDocument()
  })

  it('shows badge with count when draftCount > 0', () => {
    render(
      <QuizTabs
        draftCount={3}
        newQuizContent={<div>New</div>}
        savedDraftContent={<div>Saved</div>}
      />,
    )
    expect(screen.getByTestId('draft-count-badge')).toHaveTextContent('3')
  })

  it('does not show badge when draftCount is 0', () => {
    render(
      <QuizTabs
        draftCount={0}
        newQuizContent={<div>New</div>}
        savedDraftContent={<div>Saved</div>}
      />,
    )
    expect(screen.queryByTestId('draft-count-badge')).not.toBeInTheDocument()
  })

  it('shows badge with count 20 at the maximum', () => {
    render(
      <QuizTabs
        draftCount={20}
        newQuizContent={<div>New</div>}
        savedDraftContent={<div>Saved</div>}
      />,
    )
    expect(screen.getByTestId('draft-count-badge')).toHaveTextContent('20')
  })
})
