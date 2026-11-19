import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RemovedEntriesList } from './removed-entries-list'

const row = (over: Record<string, unknown> = {}) => ({
  entryId: 'e1',
  userId: 'u1',
  studentName: 'Ann Student',
  subjectShort: 'FPM',
  passedAt: '2026-11-17T10:00:00Z',
  removedAt: '2026-11-17T10:01:00Z',
  noticeSent: false,
  noNotice: false,
  ...over,
})

describe('RemovedEntriesList', () => {
  it('renders nothing when no entry was removed', () => {
    const { container } = render(<RemovedEntriesList rows={[]} total={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists student, subject and pass date', () => {
    render(<RemovedEntriesList rows={[row() as never]} total={1} />)
    expect(screen.getByText(/Ann Student · FPM · passed /)).toBeInTheDocument()
  })

  it('marks the pass date as UTC', () => {
    render(<RemovedEntriesList rows={[row() as never]} total={1} />)
    expect(screen.getByText(/passed 17 Nov 2026 UTC · /)).toBeInTheDocument()
  })

  it('omits the pass date segment when passedAt is null', () => {
    render(<RemovedEntriesList rows={[row({ passedAt: null }) as never]} total={1} />)
    expect(screen.getByText('Ann Student · FPM · notice pending')).toBeInTheDocument()
  })

  it('names an empty subject Unknown subject', () => {
    render(<RemovedEntriesList rows={[row({ subjectShort: '' }) as never]} total={1} />)
    expect(screen.getByText(/Ann Student · Unknown subject · passed /)).toBeInTheDocument()
  })

  it('shows notice sent or pending per row', () => {
    render(
      <RemovedEntriesList
        rows={[
          row() as never,
          row({ entryId: 'e2', studentName: 'Bob', noticeSent: true }) as never,
        ]}
        total={2}
      />,
    )
    expect(screen.getByText(/notice sent/i)).toBeInTheDocument()
    expect(screen.getByText(/pending/i)).toBeInTheDocument()
  })

  it('labels an unsent entry of an undeliverable student "no notice (deactivated)"', () => {
    render(<RemovedEntriesList rows={[row({ noNotice: true }) as never]} total={1} />)
    expect(screen.getByText(/no notice \(deactivated\)/)).toBeInTheDocument()
    expect(screen.queryByText(/pending/)).toBeNull()
  })

  it('labels an unsent entry of a deliverable student "notice pending"', () => {
    render(<RemovedEntriesList rows={[row() as never]} total={1} />)
    expect(screen.getByText(/notice pending/)).toBeInTheDocument()
    expect(screen.queryByText(/no notice/)).toBeNull()
  })

  it('labels a sent entry "notice sent" even when noNotice is set', () => {
    render(
      <RemovedEntriesList rows={[row({ noticeSent: true, noNotice: true }) as never]} total={1} />,
    )
    expect(screen.getByText(/notice sent/)).toBeInTheDocument()
    expect(screen.queryByText(/no notice/)).toBeNull()
  })

  it('shows Showing 200 of N beyond 200 rows', () => {
    const rows = Array.from({ length: 200 }, (_, i) => row({ entryId: `e${i}` }) as never)
    render(<RemovedEntriesList rows={rows} total={340} />)
    expect(screen.getByText('Showing 200 of 340')).toBeInTheDocument()
  })

  it('shows a neutral fallback for a blank student name', () => {
    render(<RemovedEntriesList rows={[row({ studentName: '' }) as never]} total={1} />)
    expect(screen.queryByText(/^ · FPM/)).toBeNull()
    expect(screen.getByText(/\S+ · FPM · passed /)).toBeInTheDocument()
  })
})
