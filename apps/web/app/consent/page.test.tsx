import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ConsentPage from './page'

// ConsentForm has its own test file. Here we only verify the page validates
// the incoming next param and passes it down — not the form internals.
vi.mock('./_components/consent-form', () => ({
  ConsentForm: ({ nextPath }: { nextPath?: string | null }) => (
    <div data-testid="consent-form" data-next-path={nextPath ?? ''} />
  ),
}))

async function renderPage(searchParams: Record<string, string> = {}) {
  const jsx = await ConsentPage({ searchParams: Promise.resolve(searchParams) })
  render(jsx)
}

describe('ConsentPage', () => {
  it('keeps a safe same-app destination for after consent', async () => {
    await renderPage({ next: '/app/internal-exam' })
    expect(screen.getByTestId('consent-form').dataset.nextPath).toBe('/app/internal-exam')
  })

  it('leaves the destination unset when no next param is present', async () => {
    await renderPage()
    expect(screen.getByTestId('consent-form').dataset.nextPath).toBe('')
  })

  it('drops an off-site next destination', async () => {
    await renderPage({ next: '//evil.com' })
    expect(screen.getByTestId('consent-form').dataset.nextPath).toBe('')
  })
})
