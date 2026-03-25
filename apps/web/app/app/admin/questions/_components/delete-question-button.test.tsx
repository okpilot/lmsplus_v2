import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockSoftDeleteQuestion, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockSoftDeleteQuestion: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('../actions/soft-delete-question', () => ({
  softDeleteQuestion: (...args: unknown[]) => mockSoftDeleteQuestion(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

// Mock the AlertDialog family so we can control open/close state in jsdom.
// The production component uses @base-ui/react/alert-dialog which is not
// compatible with jsdom; a simple controlled stub is sufficient for behaviour tests.
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog">{children}</div>
  ),
  AlertDialogTrigger: ({
    children,
    render: renderProp,
  }: {
    children?: React.ReactNode
    render?: React.ReactElement
  }) => {
    // The production component uses the Base UI `render` prop pattern.
    // Render the trigger element directly so jsdom can click it.
    if (renderProp) {
      return (
        <div data-testid="alert-dialog-trigger">
          {renderProp}
          {children}
        </div>
      )
    }
    return <div data-testid="alert-dialog-trigger">{children}</div>
  },
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" data-testid="alert-dialog-action" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type="button" data-testid="alert-dialog-cancel">
      {children}
    </button>
  ),
}))

vi.mock('lucide-react', () => ({
  Trash2: ({ className }: { className?: string }) => (
    <span data-testid="trash-icon" className={className} />
  ),
}))

// ---- Subject under test ----------------------------------------------------

import { DeleteQuestionButton } from './delete-question-button'

// ---- Tests -----------------------------------------------------------------

describe('DeleteQuestionButton', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders a delete trigger button', () => {
    render(<DeleteQuestionButton id="q-1" label="Q001" />)
    // The trigger wraps a ghost icon button — the trash icon is always visible.
    expect(screen.getByTestId('trash-icon')).toBeInTheDocument()
  })

  it('renders the confirmation dialog with the question label', () => {
    render(<DeleteQuestionButton id="q-1" label="What is lift?" />)

    expect(screen.getByText('Delete question?')).toBeInTheDocument()
    expect(screen.getByText(/What is lift\?/)).toBeInTheDocument()
  })

  it('calls softDeleteQuestion with the correct id when Delete is confirmed', async () => {
    mockSoftDeleteQuestion.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(<DeleteQuestionButton id="q-42" label="Q042" />)
    await user.click(screen.getByTestId('alert-dialog-action'))

    expect(mockSoftDeleteQuestion).toHaveBeenCalledWith({ id: 'q-42' })
  })

  it('shows a success toast with the label after successful deletion', async () => {
    mockSoftDeleteQuestion.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(<DeleteQuestionButton id="q-1" label="My Question" />)
    await user.click(screen.getByTestId('alert-dialog-action'))

    expect(mockToastSuccess).toHaveBeenCalledWith('Deleted "My Question"')
  })

  it('shows an error toast when softDeleteQuestion returns an error', async () => {
    mockSoftDeleteQuestion.mockResolvedValue({
      success: false,
      error: 'Question not found or not accessible',
    })
    const user = userEvent.setup()

    render(<DeleteQuestionButton id="q-1" label="Q001" />)
    await user.click(screen.getByTestId('alert-dialog-action'))

    expect(mockToastError).toHaveBeenCalledWith('Question not found or not accessible')
  })

  it('shows a generic error toast when softDeleteQuestion throws', async () => {
    mockSoftDeleteQuestion.mockRejectedValue(new Error('Network failure'))
    const user = userEvent.setup()

    render(<DeleteQuestionButton id="q-1" label="Q001" />)
    await user.click(screen.getByTestId('alert-dialog-action'))

    expect(mockToastError).toHaveBeenCalledWith('Service error. Please try again.')
  })

  it('does not call softDeleteQuestion when only the trigger area is interacted with', () => {
    render(<DeleteQuestionButton id="q-1" label="Q001" />)

    // softDeleteQuestion must not be called at render time.
    expect(mockSoftDeleteQuestion).not.toHaveBeenCalled()
  })
})
