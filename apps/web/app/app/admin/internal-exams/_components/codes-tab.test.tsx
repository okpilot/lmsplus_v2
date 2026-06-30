import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------
// Stub child components to plain HTML so CodesTab's wiring logic is testable
// without pulling in their full dependency trees.

let capturedOnIssued:
  | ((issued: { codeId: string; code: string; expiresAt: string }) => void)
  | null = null
let capturedOnDismiss: (() => void) | null = null

vi.mock('./issue-code-form', () => ({
  IssueCodeForm: ({
    onIssued,
  }: {
    students: unknown[]
    subjects: unknown[]
    onIssued: (issued: { codeId: string; code: string; expiresAt: string }) => void
  }) => {
    capturedOnIssued = onIssued
    return <button type="button" data-testid="issue-form-stub" />
  },
}))

vi.mock('./issued-code-panel', () => ({
  IssuedCodePanel: ({
    codeId,
    code,
    expiresAt,
    onDismiss,
  }: {
    codeId: string
    code: string
    expiresAt: string
    onDismiss: () => void
  }) => {
    capturedOnDismiss = onDismiss
    return (
      <div
        data-testid="issued-code-panel-stub"
        data-code-id={codeId}
        data-code={code}
        data-expires-at={expiresAt}
      />
    )
  },
}))

const { mockCodesTableProps } = vi.hoisted(() => ({ mockCodesTableProps: vi.fn() }))
vi.mock('./codes-table', () => ({
  CodesTable: (props: unknown) => {
    mockCodesTableProps(props)
    return <div data-testid="codes-table-stub" />
  },
}))

// ---- Subject under test ---------------------------------------------------

import { CodesTab } from './codes-tab'

// ---- Fixtures --------------------------------------------------------------

const STUDENTS = [{ id: 'stu-1', fullName: 'Alice', email: 'alice@example.com' }]
const SUBJECTS = [{ id: 'sub-1', code: '050', name: 'Meteorology' }]
const ISSUED = { codeId: 'code-uuid-1', code: 'ABCD2345', expiresAt: '2026-04-30T12:00:00.000Z' }

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  capturedOnIssued = null
  capturedOnDismiss = null
})

describe('CodesTab', () => {
  it('does not show the IssuedCodePanel before a code is issued', () => {
    render(
      <CodesTab students={STUDENTS} subjects={SUBJECTS} codes={[]} totalCount={0} pageSize={25} />,
    )
    expect(screen.queryByTestId('issued-code-panel-stub')).not.toBeInTheDocument()
  })

  it('shows the IssuedCodePanel with codeId, code, and expiresAt after a code is issued', () => {
    render(
      <CodesTab students={STUDENTS} subjects={SUBJECTS} codes={[]} totalCount={0} pageSize={25} />,
    )

    act(() => {
      capturedOnIssued?.(ISSUED)
    })

    const panel = screen.getByTestId('issued-code-panel-stub')
    expect(panel).toBeInTheDocument()
    expect(panel).toHaveAttribute('data-code-id', ISSUED.codeId)
    expect(panel).toHaveAttribute('data-code', ISSUED.code)
    expect(panel).toHaveAttribute('data-expires-at', ISSUED.expiresAt)
  })

  it('hides the IssuedCodePanel when onDismiss is called', () => {
    render(
      <CodesTab students={STUDENTS} subjects={SUBJECTS} codes={[]} totalCount={0} pageSize={25} />,
    )

    act(() => {
      capturedOnIssued?.(ISSUED)
    })
    expect(screen.getByTestId('issued-code-panel-stub')).toBeInTheDocument()

    act(() => {
      capturedOnDismiss?.()
    })
    expect(screen.queryByTestId('issued-code-panel-stub')).not.toBeInTheDocument()
  })

  it('replaces the panel with new codeId when a second code is issued', () => {
    render(
      <CodesTab students={STUDENTS} subjects={SUBJECTS} codes={[]} totalCount={0} pageSize={25} />,
    )

    act(() => {
      capturedOnIssued?.(ISSUED)
    })
    expect(screen.getByTestId('issued-code-panel-stub')).toHaveAttribute(
      'data-code-id',
      'code-uuid-1',
    )

    const second = {
      codeId: 'code-uuid-2',
      code: 'ZZZZ7777',
      expiresAt: '2027-01-01T00:00:00.000Z',
    }
    act(() => {
      capturedOnIssued?.(second)
    })
    expect(screen.getByTestId('issued-code-panel-stub')).toHaveAttribute(
      'data-code-id',
      'code-uuid-2',
    )
  })

  it('always renders the CodesTable', () => {
    render(
      <CodesTab students={STUDENTS} subjects={SUBJECTS} codes={[]} totalCount={0} pageSize={25} />,
    )
    expect(screen.getByTestId('codes-table-stub')).toBeInTheDocument()
  })

  it('renders the codes table with the active status filter and pagination totals', () => {
    render(
      <CodesTab
        students={STUDENTS}
        subjects={SUBJECTS}
        status="active"
        codes={[]}
        totalCount={42}
        pageSize={25}
      />,
    )
    expect(mockCodesTableProps).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', rows: [], totalCount: 42, pageSize: 25 }),
    )
  })
})
