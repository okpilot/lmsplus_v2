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

  it('shows the empty note as centred inline text rather than a card', () => {
    render(<WeakTopicsList topics={[]} />)
    const note = screen.getByText('No quiz data yet.')
    expect(note.closest('[data-slot="empty"]')).toBeNull()
    expect(note).toHaveClass('text-center')
  })

  it.each([
    { avgScore: 30, tone: 'danger' },
    { avgScore: 49, tone: 'danger' },
    { avgScore: 50, tone: 'caution' },
    { avgScore: 79, tone: 'caution' },
    { avgScore: 80, tone: 'success' },
    { avgScore: 90, tone: 'success' },
  ])(
    'colours the bar and score for a $avgScore% average with the $tone tone',
    ({ avgScore, tone }) => {
      const topic = {
        topicId: 't1',
        topicName: 'Topic',
        subjectName: 'Subject',
        subjectShort: 'SUB',
        avgScore,
        studentCount: 2,
      }
      const { container } = render(<WeakTopicsList topics={[topic]} />)
      const bar = container.querySelector('li [style]')
      expect(bar).toHaveClass(`bg-${tone}-solid`)
      expect(screen.getByText(`${avgScore}%`)).toHaveClass(`text-${tone}`)
    },
  )
})
