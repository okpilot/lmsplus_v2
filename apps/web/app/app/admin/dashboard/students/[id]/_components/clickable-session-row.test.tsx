import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRouterPush = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

// Minimal table wrappers so TableRow/TableCell render valid HTML in jsdom
vi.mock('@/components/ui/table', () => ({
  TableRow: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr {...props}>{children}</tr>
  ),
  TableCell: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <td className={className}>{children}</td>
  ),
}))

// ---- Subject under test ---------------------------------------------------

import type { StudentSession } from '../../../types'
import { ClickableSessionRow } from './clickable-session-row'

// ---- Fixtures ---------------------------------------------------------------

function makeSession(overrides: Partial<StudentSession> = {}): StudentSession {
  return {
    sessionId: 'sess-42',
    subjectName: 'Meteorology',
    topicName: 'Clouds',
    mode: 'quick_quiz',
    scorePercentage: 75,
    totalQuestions: 20,
    correctCount: 15,
    startedAt: '2026-03-12T10:00:00Z',
    endedAt: '2026-03-12T10:20:00Z',
    ...overrides,
  }
}

// ---- Tests -----------------------------------------------------------------

describe('ClickableSessionRow', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('navigates to the admin session report page when clicked', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession()} />
        </tbody>
      </table>,
    )
    const row = screen.getByRole('row')
    fireEvent.click(row)
    expect(mockRouterPush).toHaveBeenCalledWith('/app/admin/dashboard/sessions/sess-42')
  })

  it('navigates when Enter key is pressed on the row', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession()} />
        </tbody>
      </table>,
    )
    const row = screen.getByRole('row')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(mockRouterPush).toHaveBeenCalledWith('/app/admin/dashboard/sessions/sess-42')
  })

  it('navigates when Space key is pressed on the row', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession()} />
        </tbody>
      </table>,
    )
    const row = screen.getByRole('row')
    fireEvent.keyDown(row, { key: ' ' })
    expect(mockRouterPush).toHaveBeenCalledWith('/app/admin/dashboard/sessions/sess-42')
  })

  it('does not navigate when an irrelevant key is pressed', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession()} />
        </tbody>
      </table>,
    )
    const row = screen.getByRole('row')
    fireEvent.keyDown(row, { key: 'Tab' })
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('displays score percentage with percent sign when present', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession({ scorePercentage: 80 })} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('displays em dash when score percentage is null', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession({ scorePercentage: null })} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('\u2014')).toBeInTheDocument()
  })

  it('displays correct count and total questions', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession({ correctCount: 15, totalQuestions: 20 })} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('15/20')).toBeInTheDocument()
  })

  it('displays em dash when subjectName is null', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession({ subjectName: null, topicName: null })} />
        </tbody>
      </table>,
    )
    // Two em dashes expected: one for subject, one for topic
    const emDashes = screen.getAllByText('\u2014')
    expect(emDashes.length).toBeGreaterThanOrEqual(2)
  })

  it('renders mode in a table cell', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession({ mode: 'timed_exam' })} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('timed_exam')).toBeInTheDocument()
  })

  it('has tabIndex 0 for keyboard accessibility', () => {
    render(
      <table>
        <tbody>
          <ClickableSessionRow session={makeSession()} />
        </tbody>
      </table>,
    )
    const row = screen.getByRole('row')
    expect(row).toHaveAttribute('tabIndex', '0')
  })
})
