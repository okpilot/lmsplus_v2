import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { ResultBanner } from './result-banner'

let setBannerRef: ReturnType<typeof useSittingUi>['setBanner']

function Capture() {
  setBannerRef = useSittingUi().setBanner
  return null
}

function ui() {
  return render(
    <SittingUiProvider>
      <Capture />
      <ResultBanner />
    </SittingUiProvider>,
  )
}

describe('ResultBanner', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders nothing when there is no banner', () => {
    ui()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses role alert for a danger banner with its detail', () => {
    ui()
    act(() => setBannerRef({ tone: 'danger', title: 'Failed', detail: 'Try again' }))
    expect(screen.getByRole('alert').textContent).toContain('Failed')
    expect(screen.getByText('Try again')).toBeTruthy()
  })

  it('uses role status for a caution banner', () => {
    ui()
    act(() => setBannerRef({ tone: 'caution', title: 'Heads up' }))
    expect(screen.getByRole('status').textContent).toContain('Heads up')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears the banner when Dismiss is clicked', async () => {
    ui()
    act(() => setBannerRef({ tone: 'danger', title: 'Failed' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders each line of a caution banner', () => {
    ui()
    act(() =>
      setBannerRef({
        tone: 'caution',
        title: 'Added 1.',
        lines: ['Ann · FPM: passed', 'Bob · AGK: not enrolled'],
      }),
    )
    expect(screen.getByText('Ann · FPM: passed')).toBeInTheDocument()
    expect(screen.getByText('Bob · AGK: not enrolled')).toBeInTheDocument()
  })

  it('renders duplicate lines twice without a key warning', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    ui()
    act(() =>
      setBannerRef({ tone: 'caution', title: 'Skipped', lines: ['Same line', 'Same line'] }),
    )
    expect(screen.getAllByText('Same line')).toHaveLength(2)
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('renders no stray 0 or description for an empty lines array', () => {
    ui()
    act(() => setBannerRef({ tone: 'caution', title: 'Skipped', lines: [] }))
    const status = screen.getByRole('status')
    expect(status.textContent).not.toContain('0')
    expect(status.querySelector('ul')).toBeNull()
  })

  it('shows at most 50 lines, then "and N more"', () => {
    ui()
    const lines = Array.from({ length: 60 }, (_, i) => `line-${i}`)
    act(() => setBannerRef({ tone: 'caution', title: 'Skipped', lines }))
    expect(screen.getByText('line-49')).toBeInTheDocument()
    expect(screen.queryByText('line-50')).toBeNull()
    expect(screen.getByText('and 10 more')).toBeInTheDocument()
  })

  it('keeps a success banner with lines as a banner, not a toast', () => {
    ui()
    act(() => setBannerRef({ tone: 'success', title: 'Added 2.', lines: ['x'] }))
    expect(screen.getByRole('status').textContent).toContain('Added 2.')
  })

  it('turns a plain success into a toast without a banner', () => {
    ui()
    act(() => setBannerRef({ tone: 'success', title: 'Removed 1.' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows one banner at a time', () => {
    ui()
    act(() => setBannerRef({ tone: 'caution', title: 'First' }))
    act(() => setBannerRef({ tone: 'danger', title: 'Second' }))
    expect(screen.queryByText('First')).toBeNull()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })
})
