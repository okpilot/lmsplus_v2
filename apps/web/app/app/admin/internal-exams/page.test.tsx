import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./_components/internal-exams-content', () => ({
  InternalExamsContent: () => <div />,
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
})
