import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./_components/questions-content', () => ({
  QuestionsContent: () => <div />,
}))
vi.mock('./_components/questions-content-fallback', () => ({
  QuestionsContentFallback: () => <div />,
}))

import QuestionsPage from './page'

describe('QuestionsPage', () => {
  it('renders the page title as a level-1 heading', async () => {
    render(await QuestionsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Question Editor' })).toHaveClass(
      'text-title',
      'font-semibold',
    )
  })
})
