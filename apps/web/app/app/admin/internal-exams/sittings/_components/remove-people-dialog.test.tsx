import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The real dialog unmounts its content at once in jsdom, so render the title it is given.
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ title }: { title: string }) => <h2>{title}</h2>,
}))
vi.mock('../actions/remove-candidates', () => ({ removeCandidates: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { RemovePeopleDialog } from './remove-people-dialog'

const tree = (userIds: readonly string[] | null) => (
  <SittingUiProvider>
    <RemovePeopleDialog sittingId="sit-1" userIds={userIds} onClose={vi.fn()} />
  </SittingUiProvider>
)

describe('RemovePeopleDialog', () => {
  it('titles a single person in the singular', () => {
    render(tree(['a']))
    expect(screen.getByText('Remove 1 person?')).toBeInTheDocument()
  })

  it('titles the dialog with the number of people being removed', () => {
    render(tree(['a', 'b']))
    expect(screen.getByText('Remove 2 people?')).toBeInTheDocument()
  })

  it('keeps the last count in the title while the dialog closes', () => {
    const { rerender } = render(tree(['a', 'b']))
    rerender(tree(null))
    expect(screen.queryByText('Remove 0 people?')).toBeNull()
    expect(screen.getByText('Remove 2 people?')).toBeInTheDocument()
  })
})
