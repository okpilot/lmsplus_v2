import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./_components/internal-exams-content', () => ({
  InternalExamsContent: (p: { tab?: string; scope?: string; dlg?: string }) => (
    <div data-testid="content" data-tab={p.tab} data-scope={p.scope} data-dlg={p.dlg} />
  ),
}))
vi.mock('./_components/internal-exams-header-action', () => ({
  InternalExamsHeaderAction: () => <div data-testid="header-action" />,
}))
vi.mock('./_components/internal-exams-fallback', () => ({
  InternalExamsFallback: () => <div />,
}))

import InternalExamsPage from './page'

describe('InternalExamsPage', () => {
  it('renders the page title as a level-1 heading', async () => {
    render(await InternalExamsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Internal Exams' })).toHaveClass(
      'text-title',
    )
  })

  it('renders no description under the title', async () => {
    render(await InternalExamsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.queryByText(/Issue one-time exam codes/)).not.toBeInTheDocument()
  })

  it('renders the new-sitting header action', async () => {
    render(await InternalExamsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('header-action')).toBeInTheDocument()
  })

  it('passes the parsed tab, scope and dlg to the content', async () => {
    render(
      await InternalExamsPage({
        searchParams: Promise.resolve({ tab: 'sittings', scope: 'open', dlg: 'new' }),
      }),
    )
    const el = screen.getByTestId('content')
    expect(el).toHaveAttribute('data-tab', 'sittings')
    expect(el).toHaveAttribute('data-scope', 'open')
    expect(el).toHaveAttribute('data-dlg', 'new')
  })
})
