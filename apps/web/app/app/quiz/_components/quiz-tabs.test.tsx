import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { QuizTabs } from './quiz-tabs'

function renderTabs(draftCount = 0) {
  return render(
    <QuizTabs
      draftCount={draftCount}
      newQuizContent={<div data-testid="new-quiz">New</div>}
      savedDraftContent={<div data-testid="saved-draft">Saved</div>}
    />,
  )
}

describe('QuizTabs', () => {
  it('renders both tabs', () => {
    renderTabs()
    expect(screen.getByTestId('tab-new')).toBeInTheDocument()
    expect(screen.getByTestId('tab-saved')).toBeInTheDocument()
  })

  it('shows new quiz content by default', () => {
    renderTabs()
    expect(screen.getByTestId('new-quiz')).toBeInTheDocument()
    expect(screen.queryByTestId('saved-draft')).not.toBeInTheDocument()
  })

  it('switches to saved draft content when saved tab is clicked', () => {
    renderTabs()
    fireEvent.click(screen.getByTestId('tab-saved'))
    expect(screen.queryByTestId('new-quiz')).not.toBeInTheDocument()
    expect(screen.getByTestId('saved-draft')).toBeInTheDocument()
  })

  it('shows badge with count when draftCount > 0', () => {
    renderTabs(3)
    expect(screen.getByTestId('draft-count-badge')).toHaveTextContent('3')
  })

  it('does not show badge when draftCount is 0', () => {
    renderTabs()
    expect(screen.queryByTestId('draft-count-badge')).not.toBeInTheDocument()
  })

  it('shows badge with count 20 at the maximum', () => {
    renderTabs(20)
    expect(screen.getByTestId('draft-count-badge')).toHaveTextContent('20')
  })

  it('does not show a badge on the New Quiz tab even when draftCount > 0', () => {
    renderTabs(5)
    const newTab = screen.getByTestId('tab-new')
    expect(newTab.querySelector('[data-testid="draft-count-badge"]')).toBeNull()
  })

  it('switches back to new quiz content when new tab is clicked after switching away', () => {
    renderTabs()
    fireEvent.click(screen.getByTestId('tab-saved'))
    fireEvent.click(screen.getByTestId('tab-new'))
    expect(screen.getByTestId('new-quiz')).toBeInTheDocument()
    expect(screen.queryByTestId('saved-draft')).not.toBeInTheDocument()
  })

  describe('custom labels', () => {
    it('renders custom new/saved labels when provided', () => {
      render(
        <QuizTabs
          newLabel="New Practice Session"
          savedLabel="Saved Practice Sessions"
          newQuizContent={<div data-testid="new-quiz">New</div>}
          savedDraftContent={<div data-testid="saved-draft">Saved</div>}
        />,
      )
      expect(screen.getByText('New Practice Session')).toBeInTheDocument()
      expect(screen.getByText('Saved Practice Sessions')).toBeInTheDocument()
    })

    it('applies a custom aria-label on the tablist', () => {
      render(
        <QuizTabs
          ariaLabel="Practice options"
          newQuizContent={<div data-testid="new-quiz">New</div>}
          savedDraftContent={<div data-testid="saved-draft">Saved</div>}
        />,
      )
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Practice options')
    })

    it('defaults to "New Quiz"/"Saved Quizzes" and "Quiz options" when labels are omitted', () => {
      renderTabs()
      expect(screen.getByText('New Quiz')).toBeInTheDocument()
      expect(screen.getByText('Saved Quizzes')).toBeInTheDocument()
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Quiz options')
    })
  })

  describe('ARIA tablist pattern', () => {
    it('has a tablist container with accessible label', () => {
      renderTabs()
      const tablist = screen.getByRole('tablist')
      expect(tablist).toHaveAttribute('aria-label', 'Quiz options')
    })

    it('marks the active tab with aria-selected=true and inactive with false', () => {
      renderTabs()
      const newTab = screen.getByTestId('tab-new')
      const savedTab = screen.getByTestId('tab-saved')
      expect(newTab).toHaveAttribute('aria-selected', 'true')
      expect(savedTab).toHaveAttribute('aria-selected', 'false')
    })

    it('sets tabIndex=0 on active tab and tabIndex=-1 on inactive', () => {
      renderTabs()
      expect(screen.getByTestId('tab-new')).toHaveAttribute('tabindex', '0')
      expect(screen.getByTestId('tab-saved')).toHaveAttribute('tabindex', '-1')
    })

    it('links the active tab to the rendered panel with aria-controls', () => {
      renderTabs()
      const panel = screen.getByRole('tabpanel')
      expect(panel.id).not.toBe('')
      expect(screen.getByTestId('tab-new')).toHaveAttribute('aria-controls', panel.id)
    })

    it('renders a tabpanel labelled by the active tab', () => {
      renderTabs()
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-new')
    })
  })

  describe('keyboard navigation (Base UI roving focus)', () => {
    it('moves focus and selection to the next tab on ArrowRight', async () => {
      const user = userEvent.setup()
      renderTabs()
      screen.getByTestId('tab-new').focus()
      await user.keyboard('{ArrowRight}')
      expect(screen.getByTestId('tab-saved')).toHaveFocus()
      expect(screen.getByTestId('tab-saved')).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByTestId('saved-draft')).toBeInTheDocument()
    })

    it('moves focus and selection to the previous tab on ArrowLeft', async () => {
      const user = userEvent.setup()
      renderTabs()
      fireEvent.click(screen.getByTestId('tab-saved'))
      screen.getByTestId('tab-saved').focus()
      await user.keyboard('{ArrowLeft}')
      expect(screen.getByTestId('tab-new')).toHaveFocus()
      expect(screen.getByTestId('tab-new')).toHaveAttribute('aria-selected', 'true')
    })

    it('moves focus to the last tab on End', async () => {
      const user = userEvent.setup()
      renderTabs()
      screen.getByTestId('tab-new').focus()
      await user.keyboard('{End}')
      expect(screen.getByTestId('tab-saved')).toHaveFocus()
    })

    it('moves focus to the first tab on Home', async () => {
      const user = userEvent.setup()
      renderTabs()
      fireEvent.click(screen.getByTestId('tab-saved'))
      screen.getByTestId('tab-saved').focus()
      await user.keyboard('{Home}')
      expect(screen.getByTestId('tab-new')).toHaveFocus()
    })
  })

  describe('selected look', () => {
    it('styles the active tab with the shared segmented classes', () => {
      renderTabs(2)
      const tab = screen.getByTestId('tab-new')
      expect(tab).toHaveAttribute('data-active')
      expect(tab).toHaveClass('data-active:bg-card', 'data-active:border-primary')
    })

    it('renders the draft badge as a TabCount', () => {
      renderTabs(2)
      expect(screen.getByTestId('draft-count-badge')).toHaveClass('bg-card')
    })
  })
})
