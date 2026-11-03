import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/require-auth-user', () => ({
  requireAuthUser: vi.fn().mockResolvedValue({ id: 'u-1' }),
}))
vi.mock('./_components/internal-exam-content', () => ({
  InternalExamContent: () => <div data-testid="content" />,
}))

import InternalExamPage from './page'

describe('InternalExamPage', () => {
  it('titles the page with a level-1 heading and its description', async () => {
    render(await InternalExamPage())
    const h1 = screen.getByRole('heading', { level: 1, name: 'Internal Exam' })
    expect(h1.className).toContain('text-title')
    expect(screen.getByText(/enter the code from your administrator/i)).toBeInTheDocument()
  })
})
