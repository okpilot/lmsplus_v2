import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SubjectGrid } from './subject-grid'

const SUBJECTS = [
  {
    id: '1',
    code: '050',
    name: 'Meteorology',
    masteryPercentage: 75,
    answeredCorrectly: 15,
    totalQuestions: 20,
  },
  {
    id: '2',
    code: '010',
    name: 'Air Law',
    masteryPercentage: 50,
    answeredCorrectly: 5,
    totalQuestions: 10,
  },
]

describe('SubjectGrid', () => {
  it('renders a card for each subject', () => {
    render(<SubjectGrid subjects={SUBJECTS} />)
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
    expect(screen.getByText('Air Law')).toBeInTheDocument()
  })

  it('shows subject code', () => {
    render(<SubjectGrid subjects={SUBJECTS} />)
    expect(screen.getByText('050')).toBeInTheDocument()
    expect(screen.getByText('010')).toBeInTheDocument()
  })

  it('shows mastery percentage', () => {
    render(<SubjectGrid subjects={SUBJECTS} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows questions mastered count', () => {
    render(<SubjectGrid subjects={SUBJECTS} />)
    expect(screen.getByText('15 / 20 questions mastered')).toBeInTheDocument()
    expect(screen.getByText('5 / 10 questions mastered')).toBeInTheDocument()
  })

  it('shows empty message when no subjects', () => {
    render(<SubjectGrid subjects={[]} />)
    expect(screen.getByText(/no subjects available/i)).toBeInTheDocument()
  })
})
