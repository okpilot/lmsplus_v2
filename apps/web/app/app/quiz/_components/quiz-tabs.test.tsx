import { fireEvent, render, screen } from '@testing-library/react'
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

    it('links tabs to their panel via aria-controls', () => {
      renderTabs()
      const newTab = screen.getByTestId('tab-new')
      expect(newTab).toHaveAttribute('aria-controls', 'tabpanel-new')
    })

    it('renders a tabpanel linked to the active tab', () => {
      renderTabs()
      const panel = screen.getByRole('tabpanel')
      expect(panel).toHaveAttribute('aria-labelledby', 'tab-new')
      expect(panel).toHaveAttribute('id', 'tabpanel-new')
    })
  })

  describe('keyboard navigation', () => {
    it('moves focus to next tab on ArrowRight', () => {
      renderTabs()
      const newTab = screen.getByTestId('tab-new')
      newTab.focus()
      fireEvent.keyDown(newTab, { key: 'ArrowRight' })
      expect(screen.getByTestId('tab-saved')).toHaveFocus()
      expect(screen.getByTestId('saved-draft')).toBeInTheDocument()
    })

    it('wraps focus from last tab to first on ArrowRight', () => {
      renderTabs()
      fireEvent.click(screen.getByTestId('tab-saved'))
      const savedTab = screen.getByTestId('tab-saved')
      savedTab.focus()
      fireEvent.keyDown(savedTab, { key: 'ArrowRight' })
      expect(screen.getByTestId('tab-new')).toHaveFocus()
    })

    it('moves focus to previous tab on ArrowLeft', () => {
      renderTabs()
      fireEvent.click(screen.getByTestId('tab-saved'))
      const savedTab = screen.getByTestId('tab-saved')
      savedTab.focus()
      fireEvent.keyDown(savedTab, { key: 'ArrowLeft' })
      expect(screen.getByTestId('tab-new')).toHaveFocus()
    })

    it('moves focus to first tab on Home', () => {
      renderTabs()
      fireEvent.click(screen.getByTestId('tab-saved'))
      const savedTab = screen.getByTestId('tab-saved')
      savedTab.focus()
      fireEvent.keyDown(savedTab, { key: 'Home' })
      expect(screen.getByTestId('tab-new')).toHaveFocus()
    })

    it('moves focus to last tab on End', () => {
      renderTabs()
      const newTab = screen.getByTestId('tab-new')
      newTab.focus()
      fireEvent.keyDown(newTab, { key: 'End' })
      expect(screen.getByTestId('tab-saved')).toHaveFocus()
    })
  })
})
