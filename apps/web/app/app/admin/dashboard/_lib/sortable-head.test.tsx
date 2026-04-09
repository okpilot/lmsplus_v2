import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SortableTableHead } from './sortable-head'

beforeEach(() => {
  vi.resetAllMocks()
})

type TestField = 'name' | 'date' | 'score'

describe('SortableTableHead', () => {
  const baseProps = {
    field: 'name' as TestField,
    label: 'Name',
    activeSort: 'name' as TestField,
    activeDir: 'asc' as const,
    onSort: vi.fn<(field: TestField) => void>(),
  }

  it('renders the label text', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHead {...baseProps} />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('Name')
  })

  it('shows an ascending indicator when active and direction is asc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHead {...baseProps} />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveTextContent('Name ▲')
  })

  it('shows a descending indicator when active and direction is desc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHead {...baseProps} activeDir="desc" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveTextContent('Name ▼')
  })

  it('shows no indicator when not the active sort field', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHead {...baseProps} activeSort="date" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader').textContent).toBe('Name')
  })

  it('calls onSort with the field when clicked', () => {
    const onSort = vi.fn<(field: TestField) => void>()
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHead {...baseProps} onSort={onSort} />
          </tr>
        </thead>
      </table>,
    )
    fireEvent.click(screen.getByRole('button', { name: /name/i }))
    expect(onSort).toHaveBeenCalledWith('name')
    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('sets aria-sort to ascending when active and direction is asc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHead {...baseProps} />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('sets aria-sort to descending when active and direction is desc', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHead {...baseProps} activeDir="desc" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending')
  })

  it('sets aria-sort to none when not the active sort field', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHead {...baseProps} activeSort="score" />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none')
  })
})
