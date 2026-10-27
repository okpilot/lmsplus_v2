import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ReportsPage from './page'

vi.mock('./_components/reports-content', () => ({ ReportsContent: () => null }))
vi.mock('./_components/reports-content-fallback', () => ({ ReportsContentFallback: () => null }))

describe('ReportsPage', () => {
  it('renders the Reports title in the shared page header', async () => {
    render(await ReportsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toHaveClass('text-title')
  })
})
