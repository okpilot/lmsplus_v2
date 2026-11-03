import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WeakTopicsList } from './weak-topics-list'

describe('WeakTopicsList', () => {
  it('renders the section title as a level-2 heading', () => {
    render(<WeakTopicsList topics={[]} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Weakest Topics' })).toHaveClass(
      'text-heading',
    )
  })

  it('shows the empty note as centred inline text rather than a card', () => {
    render(<WeakTopicsList topics={[]} />)
    const note = screen.getByText('No quiz data yet.')
    expect(note.closest('[data-slot="empty"]')).toBeNull()
    expect(note).toHaveClass('text-center')
  })

  it.each([
    { avgScore: 30, fill: 'bg-data', text: 'text-muted-foreground' },
    { avgScore: 89, fill: 'bg-data', text: 'text-muted-foreground' },
    { avgScore: 90, fill: 'bg-data-goal', text: 'text-success' },
  ])(
    'colours a $avgScore% average bar $fill and score $text, never danger or caution',
    ({ avgScore, fill, text }) => {
      const topic = {
        topicId: 't1',
        topicName: 'Topic',
        subjectName: 'Subject',
        subjectShort: 'SUB',
        avgScore,
        studentCount: 2,
      }
      const { container } = render(<WeakTopicsList topics={[topic]} />)
      const meter = screen.getByRole('meter', { name: 'Topic average score' })
      expect(meter.querySelector(`.${fill}`)).not.toBeNull()
      expect(screen.getByText(`${avgScore}%`)).toHaveClass(text)
      expect(container.querySelector('.text-danger, .text-caution, .bg-danger-solid')).toBeNull()
    },
  )
})
