import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../actions/send-code-email', () => ({ sendInternalExamCodeEmail: vi.fn() }))

const { mockCodesTableProps } = vi.hoisted(() => ({ mockCodesTableProps: vi.fn() }))
vi.mock('./codes-table', () => ({
  CodesTable: (props: unknown) => {
    mockCodesTableProps(props)
    return <div data-testid="codes-table-stub" />
  },
}))

import { CodesTab } from './codes-tab'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('CodesTab', () => {
  it('renders no legacy issue-code form', () => {
    render(<CodesTab codes={[]} totalCount={0} pageSize={25} />)
    expect(screen.queryByTestId('issue-form-stub')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /issue code/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('issued-code-panel-stub')).not.toBeInTheDocument()
  })

  it('renders the codes table with the status filter and pagination totals', () => {
    render(<CodesTab status="active" codes={[]} totalCount={42} pageSize={25} />)
    expect(screen.getByTestId('codes-table-stub')).toBeInTheDocument()
    expect(mockCodesTableProps).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', rows: [], totalCount: 42, pageSize: 25 }),
    )
  })
})
