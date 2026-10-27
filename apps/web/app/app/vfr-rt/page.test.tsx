import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/require-auth-user', () => ({
  requireAuthUser: vi.fn().mockResolvedValue({ id: 'u-1' }),
}))
vi.mock('@/app/app/quiz/_components/quiz-tabs', () => ({ QuizTabs: () => <div /> }))
vi.mock('./_components/vfr-rt-active-banners', () => ({ VfrRtActiveBanners: () => <div /> }))
vi.mock('./_components/vfr-rt-saved-placeholder', () => ({
  VfrRtSavedPlaceholder: () => <div />,
}))
vi.mock('./_components/vfr-rt-setup', () => ({ VfrRtSetup: () => <div /> }))

import VfrRtPage from './page'

describe('VfrRtPage', () => {
  it('titles the page with a level-1 heading and its description', async () => {
    render(await VfrRtPage())
    const h1 = screen.getByRole('heading', { level: 1, name: 'Practice' })
    expect(h1.className).toContain('text-title')
    expect(screen.getByText(/configure and start a vfr radiotelephony/i)).toBeInTheDocument()
  })
})
