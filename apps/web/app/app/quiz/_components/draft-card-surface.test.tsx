import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../actions/discard-and-refresh', () => ({ deleteDraftAndRefresh: vi.fn() }))
vi.mock('../actions/resume', () => ({ resumeQuizSession: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { DraftCard } from './draft-card'

describe('DraftCard surface', () => {
  it('root is a list row carrying data-testid draft-card', () => {
    render(
      <DraftCard
        draft={{
          id: 'd1',
          sessionId: 's1',
          questionIds: ['q1', 'q2'],
          answers: {},
          currentIndex: 0,
          subjectName: 'Meteorology',
          subjectCode: 'MET',
          createdAt: '2026-03-12T10:00:00Z',
        }}
      />,
    )
    const root = screen.getByTestId('draft-card')
    expect(root.getAttribute('data-slot')).toBe('card-list-row')
  })
})
