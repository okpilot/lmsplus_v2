import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardStudent } from '../types'
import type { SortField } from './student-table-helpers'
import { formatRelativeTime, masteryColor, SortableHead, StudentRow } from './student-table-helpers'

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  it('returns "Never" when value is null', () => {
    expect(formatRelativeTime(null)).toBe('Never')
  })

  it('returns minutes when elapsed is under 60 minutes', () => {
    const iso = new Date(Date.now() - 30 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('30m ago')
  })

  it('returns "0m ago" for a timestamp equal to now', () => {
    const iso = new Date(Date.now()).toISOString()
    expect(formatRelativeTime(iso)).toBe('0m ago')
  })

  it('returns hours when elapsed is 1–23 hours', () => {
    const iso = new Date(Date.now() - 5 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('5h ago')
  })

  it('returns days when elapsed is 1–29 days', () => {
    const iso = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('10d ago')
  })

  it('returns months when elapsed is 30+ days', () => {
    const iso = new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('2mo ago')
  })

  it('returns "1h ago" at the 60-minute boundary', () => {
    const iso = new Date(Date.now() - 60 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('1h ago')
  })

  it('returns "1d ago" at the 24-hour boundary', () => {
    const iso = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('1d ago')
  })

  it('returns "29d ago" just before the month boundary', () => {
    const iso = new Date(Date.now() - 29 * 24 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('29d ago')
  })

  it('returns "1mo ago" at the 30-day boundary', () => {
    const iso = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('1mo ago')
  })

  it('returns "Never" for invalid ISO strings', () => {
    expect(formatRelativeTime('not-a-date')).toBe('Never')
  })

  it('clamps future timestamps to "0m ago"', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(formatRelativeTime(future)).toBe('0m ago')
  })
})

// ---------------------------------------------------------------------------
// masteryColor
// ---------------------------------------------------------------------------

describe('masteryColor', () => {
  it('returns green class when mastery is 80 or above', () => {
    expect(masteryColor(80)).toBe('text-green-600')
    expect(masteryColor(100)).toBe('text-green-600')
  })

  it('returns amber class when mastery is 50–79', () => {
    expect(masteryColor(50)).toBe('text-amber-600')
    expect(masteryColor(79)).toBe('text-amber-600')
  })

  it('returns red class when mastery is below 50', () => {
    expect(masteryColor(0)).toBe('text-red-600')
    expect(masteryColor(49)).toBe('text-red-600')
  })
})

// ---------------------------------------------------------------------------
// SortableHead
// ---------------------------------------------------------------------------

describe('SortableHead', () => {
  const baseProps = {
    field: 'name' as SortField,
    label: 'Name',
    activeSort: 'name' as SortField,
    activeDir: 'asc' as const,
    onSort: vi.fn(),
  }

  it('shows an ascending indicator when field is the active sort and direction is asc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHead {...baseProps} />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveTextContent('Name ▲')
  })

  it('shows a descending indicator when field is the active sort and direction is desc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHead {...baseProps} activeDir="desc" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveTextContent('Name ▼')
  })

  it('shows no indicator when field is not the active sort', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHead {...baseProps} activeSort="mastery" />
          </tr>
        </thead>
      </table>,
    )
    // Exact text — no trailing indicator character
    expect(screen.getByRole('columnheader').textContent).toBe('Name')
  })

  it('calls onSort with the field when clicked', () => {
    const onSort = vi.fn()
    render(
      <table>
        <thead>
          <tr>
            <SortableHead {...baseProps} onSort={onSort} />
          </tr>
        </thead>
      </table>,
    )
    fireEvent.click(screen.getByRole('button', { name: /name/i }))
    expect(onSort).toHaveBeenCalledWith('name')
    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('sets aria-sort on the column header', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHead {...baseProps} activeDir="desc" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending')
  })

  it('sets aria-sort to none when field is not active', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHead {...baseProps} activeSort="mastery" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none')
  })
})

// ---------------------------------------------------------------------------
// StudentRow
// ---------------------------------------------------------------------------

function buildStudent(overrides: Partial<DashboardStudent> = {}): DashboardStudent {
  return {
    id: 'stu-1',
    fullName: 'Alice Martin',
    email: 'alice@example.com',
    lastActiveAt: null,
    sessionCount: 5,
    avgScore: 75,
    mastery: 70,
    isActive: true,
    hasRecentActivity: true,
    ...overrides,
  }
}

describe('StudentRow', () => {
  it('renders student full name and email', () => {
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent()} onClick={vi.fn()} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('renders an em dash when full name is null', () => {
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ fullName: null })} onClick={vi.fn()} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders "Never" in the last-active cell when lastActiveAt is null', () => {
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ lastActiveAt: null })} onClick={vi.fn()} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('renders avgScore as percentage when present', () => {
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ avgScore: 88 })} onClick={vi.fn()} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('renders an em dash when avgScore is null', () => {
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ avgScore: null })} onClick={vi.fn()} />
        </tbody>
      </table>,
    )
    // The em dash for avgScore is the only '—' on this render path (fullName present)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Active badge when student is active', () => {
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ isActive: true })} onClick={vi.fn()} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders Inactive badge when student is not active', () => {
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ isActive: false })} onClick={vi.fn()} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('calls onClick when the row is clicked', () => {
    const onClick = vi.fn()
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent()} onClick={onClick} />
        </tbody>
      </table>,
    )
    fireEvent.click(screen.getByRole('row'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onClick when Enter is pressed on a focused row', () => {
    const onClick = vi.fn()
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent()} onClick={onClick} />
        </tbody>
      </table>,
    )
    const row = screen.getByRole('row')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onClick when Space is pressed on a focused row', () => {
    const onClick = vi.fn()
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent()} onClick={onClick} />
        </tbody>
      </table>,
    )
    const row = screen.getByRole('row')
    fireEvent.keyDown(row, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not respond to Enter key when inactive', () => {
    const onClick = vi.fn()
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ isActive: false })} onClick={onClick} />
        </tbody>
      </table>,
    )
    fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not respond to Space key when inactive', () => {
    const onClick = vi.fn()
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ isActive: false })} onClick={onClick} />
        </tbody>
      </table>,
    )
    fireEvent.keyDown(screen.getByRole('row'), { key: ' ' })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not respond to mouse click when inactive', () => {
    const onClick = vi.fn()
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ isActive: false })} onClick={onClick} />
        </tbody>
      </table>,
    )
    fireEvent.click(screen.getByRole('row'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies a green mastery colour class when mastery is 80 or above', () => {
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ mastery: 90 })} onClick={vi.fn()} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('90%').className).toContain('text-green-600')
  })

  it('applies a red mastery colour class when mastery is below 50', () => {
    render(
      <table>
        <tbody>
          <StudentRow student={buildStudent({ mastery: 30 })} onClick={vi.fn()} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('30%').className).toContain('text-red-600')
  })
})
