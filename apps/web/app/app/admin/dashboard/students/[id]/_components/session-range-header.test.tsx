import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => <span />,
}))

import { SessionRangeHeader } from './session-range-header'

describe('SessionRangeHeader', () => {
  it('renders the title as a level-2 heading', () => {
    render(<SessionRangeHeader range="30d" onRangeChange={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Session History' })).toHaveClass(
      'text-heading',
      'font-semibold',
    )
  })
})
