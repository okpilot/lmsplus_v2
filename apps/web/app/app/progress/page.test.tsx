import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProgressPage from './page'

vi.mock('./_components/progress-content', () => ({ ProgressContent: () => null }))
vi.mock('./_components/progress-content-skeleton', () => ({
  ProgressContentSkeleton: () => null,
}))

describe('ProgressPage', () => {
  it('renders the Progress title and description in the shared page header', () => {
    render(<ProgressPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Progress' })).toHaveClass('text-title')
    expect(screen.getByText(/detailed breakdown of your mastery/i)).toHaveClass(
      'text-muted-foreground',
    )
  })
})
