import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSort } from '../../../types'
import { SortableSessionHead } from './sortable-session-head'

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

describe('SortableSessionHead', () => {
  const baseProps = {
    field: 'date' as SessionSort,
    label: 'Date',
    activeSort: 'date' as SessionSort,
    activeDir: 'asc' as const,
    onSort: vi.fn(),
  }

  it('shows an ascending indicator when the field is the active sort and direction is asc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableSessionHead {...baseProps} />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveTextContent('Date ▲')
  })

  it('shows a descending indicator when the field is the active sort and direction is desc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableSessionHead {...baseProps} activeDir="desc" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveTextContent('Date ▼')
  })

  it('shows no indicator when the field is not the active sort', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableSessionHead {...baseProps} activeSort="score" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader').textContent).toBe('Date')
  })

  it('calls onSort with the field when the button is clicked', () => {
    const onSort = vi.fn()
    render(
      <table>
        <thead>
          <tr>
            <SortableSessionHead {...baseProps} onSort={onSort} />
          </tr>
        </thead>
      </table>,
    )
    fireEvent.click(screen.getByRole('button', { name: /date/i }))
    expect(onSort).toHaveBeenCalledWith('date')
    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('sets aria-sort to ascending when the field is active and direction is asc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableSessionHead {...baseProps} activeDir="asc" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('sets aria-sort to descending when the field is active and direction is desc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableSessionHead {...baseProps} activeDir="desc" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending')
  })

  it('sets aria-sort to none when the field is not the active sort', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableSessionHead {...baseProps} activeSort="score" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none')
  })
})
