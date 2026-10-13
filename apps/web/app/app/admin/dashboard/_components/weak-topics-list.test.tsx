import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WeakTopicsList } from './weak-topics-list'

describe('WeakTopicsList', () => {
  it('renders the section title as a level-2 heading', () => {
    render(<WeakTopicsList topics={[]} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Weakest Topics' })).toHaveClass(
      'text-heading',
      'font-semibold',
    )
  })

  it('shows the empty state in the shared empty part when there are no topics', () => {
    const { container } = render(<WeakTopicsList topics={[]} />)
    expect(container.querySelector('[data-slot="empty"]')).toHaveTextContent('No quiz data yet.')
  })
})
