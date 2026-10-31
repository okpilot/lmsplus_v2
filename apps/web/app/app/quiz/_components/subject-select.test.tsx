import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

// Mock Collapsible as pass-through elements so tests exercise component logic
// without depending on Base UI internals. The shared context forwards
// onOpenChange from Collapsible to CollapsibleTrigger, enabling open-state tests.
// React is obtained via require() so this works inside the hoisted vi.mock factory.
vi.mock('@/components/ui/collapsible', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react') as typeof React
  type CollapsibleCtxType = { open: boolean; onOpenChange: (v: boolean) => void }
  const Ctx = R.createContext<CollapsibleCtxType>({ open: false, onOpenChange: () => {} })

  function Collapsible({
    children,
    open = false,
    onOpenChange = () => {},
  }: {
    children: React.ReactNode
    open?: boolean
    onOpenChange?: (v: boolean) => void
  }) {
    return (
      <Ctx.Provider value={{ open, onOpenChange }}>
        <div data-testid="collapsible" data-open={open}>
          {children}
        </div>
      </Ctx.Provider>
    )
  }

  function CollapsibleTrigger({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) {
    const { open, onOpenChange } = R.useContext(Ctx)
    return (
      <button
        type="button"
        data-testid="collapsible-trigger"
        className={className}
        onClick={() => onOpenChange(!open)}
      >
        {children}
      </button>
    )
  }

  function CollapsibleContent({ children }: { children: React.ReactNode }) {
    return <div data-testid="collapsible-content">{children}</div>
  }

  return { Collapsible, CollapsibleTrigger, CollapsibleContent }
})

vi.mock('lucide-react', () => ({
  ChevronDown: ({ className }: { className?: string }) => (
    <span data-testid="chevron" className={className} />
  ),
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
    await user.click(screen.getByTestId('collapsible-trigger'))
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
  })

  it('opens the panel when the trigger is clicked', async () => {
    const user = userEvent.setup()
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    expect(screen.getByTestId('collapsible')).toHaveAttribute('data-open', 'false')
    await user.click(screen.getByTestId('collapsible-trigger'))
    expect(screen.getByTestId('collapsible')).toHaveAttribute('data-open', 'true')
  })

  it('closes the panel after a subject row is selected', async () => {
    const user = userEvent.setup()
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    // Open first
    await user.click(screen.getByTestId('collapsible-trigger'))
    expect(screen.getByTestId('collapsible')).toHaveAttribute('data-open', 'true')
    // Select a row — component calls setOpen(false)
    await user.click(screen.getByText('Air Law'))
    expect(screen.getByTestId('collapsible')).toHaveAttribute('data-open', 'false')
  })

  it('rotates the chevron when the panel is open', async () => {
    const user = userEvent.setup()
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    const chevron = screen.getByTestId('chevron')
    expect(chevron.className).not.toContain('rotate-180')
    await user.click(screen.getByTestId('collapsible-trigger'))
    expect(chevron.className).toContain('rotate-180')
  })

  it('applies open-state border classes to the trigger when the panel is open', async () => {
    const user = userEvent.setup()
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    const trigger = screen.getByTestId('collapsible-trigger')
    expect(trigger.className).not.toContain('rounded-b-none')
    expect(trigger.className).not.toContain('border-b-transparent')
    await user.click(trigger)
    expect(trigger.className).toContain('rounded-b-none')
    expect(trigger.className).toContain('border-b-transparent')
  })

  it('highlights the selected row with a primary left border', async () => {
    const user = userEvent.setup()
    render(<SubjectSelect subjects={SUBJECTS} value="sub-1" onValueChange={vi.fn()} />)
    await user.click(screen.getByTestId('collapsible-trigger'))
    const content = screen.getByTestId('collapsible-content')
    const rowButtons = content.querySelectorAll('button')
    const airLawRow = rowButtons[0] as HTMLButtonElement
    const metRow = rowButtons[1] as HTMLButtonElement
    expect(airLawRow.className).toContain('border-l-primary')
    expect(metRow.className).toContain('border-l-transparent')
  })

  it('does not call onValueChange when clicking the already-selected subject', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<SubjectSelect subjects={SUBJECTS} value="sub-1" onValueChange={onValueChange} />)
    await user.click(screen.getByTestId('collapsible-trigger'))
    const options = screen.getAllByTestId('subject-option')
    await user.click(options[0]!) // Air Law row (already selected)
    expect(onValueChange).not.toHaveBeenCalled()
    // Panel should still close
    expect(screen.getByTestId('collapsible')).toHaveAttribute('data-open', 'false')
  })

  it('shows placeholder text in the trigger when no subject is selected', () => {
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    expect(screen.getByTestId('collapsible-trigger')).toHaveTextContent('Select a subject')
  })
})

function expectFieldLabel(el: HTMLElement) {
  expect(el.className).toMatch(/(?<![\w-])text-label(?![\w-])/)
  expect(el.className).toContain('text-muted-foreground')
  expect(el.className).not.toContain('text-[13px]')
}

describe('SubjectSelect label and code chip', () => {
  it('styles "Subject" as a muted field label', () => {
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    expectFieldLabel(screen.getByText('Subject'))
  })

  it('renders the selected trigger code as a code-chip without bg-primary/15', () => {
    const { container } = render(
      <SubjectSelect subjects={SUBJECTS} value="sub-1" onValueChange={vi.fn()} />,
    )
    const chips = container.querySelectorAll('[data-slot=code-chip]')
    expect(chips.length).toBeGreaterThan(0)
    for (const c of chips) expect(c.className).not.toContain('bg-primary/15')
  })

  it('renders the selected row code as a code-chip with the row keeping border-l-primary', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <SubjectSelect subjects={SUBJECTS} value="sub-1" onValueChange={vi.fn()} />,
    )
    await user.click(screen.getByTestId('collapsible-trigger'))
    const row = screen
      .getAllByTestId('subject-option')
      .find((el) => el.textContent?.includes('Air Law'))
    expect(row?.querySelector('[data-slot=code-chip]')).not.toBeNull()
    expect(row?.className).toContain('border-l-primary')
    expect(container.innerHTML).not.toContain('bg-primary/15')
  })
})
