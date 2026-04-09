import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

// Mock Collapsible as pass-through elements so tests exercise component logic
// without depending on Base UI internals.
vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, ...props }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="collapsible" data-open={props.open}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <button type="button" data-testid="collapsible-trigger" {...props}>
      {children}
    </button>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
}))

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron" />,
}))

// ---- Subject under test -----------------------------------------------------

import { SubjectSelect } from './subject-select'

// ---- Fixtures ---------------------------------------------------------------

const SUBJECTS = [
  { id: 'sub-1', code: '010', name: 'Air Law', short: 'ALW', questionCount: 40 },
  { id: 'sub-2', code: '050', name: 'Meteorology', short: 'MET', questionCount: 80 },
]

// ---- Tests ------------------------------------------------------------------

describe('SubjectSelect', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders all subject rows with code and name', () => {
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    expect(screen.getByText('Air Law')).toBeInTheDocument()
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
    expect(screen.getByText('010')).toBeInTheDocument()
    expect(screen.getByText('050')).toBeInTheDocument()
  })

  it('calls onValueChange when a subject row is clicked', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={onValueChange} />)
    await user.click(screen.getByText('Meteorology'))
    expect(onValueChange).toHaveBeenCalledWith('sub-2')
  })

  it('renders with an empty subjects list without crashing', () => {
    render(<SubjectSelect subjects={[]} value="" onValueChange={vi.fn()} />)
    expect(screen.getByText('Select a subject')).toBeInTheDocument()
  })

  it('shows the selected subject name in the trigger', () => {
    render(<SubjectSelect subjects={SUBJECTS} value="sub-1" onValueChange={vi.fn()} />)
    const trigger = screen.getByTestId('collapsible-trigger')
    expect(trigger).toHaveTextContent('Air Law')
    expect(trigger).toHaveTextContent('40 questions')
  })

  it('shows question count for each subject in the list', () => {
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
  })
})
