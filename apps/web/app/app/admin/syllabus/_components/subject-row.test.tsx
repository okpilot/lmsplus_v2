import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockUpsertSubject, mockUpsertTopic, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockUpsertSubject: vi.fn(),
  mockUpsertTopic: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('../actions/upsert-subject', () => ({ upsertSubject: mockUpsertSubject }))
vi.mock('../actions/upsert-topic', () => ({ upsertTopic: mockUpsertTopic }))

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

// Mock lucide-react icons used directly in SubjectRow.
vi.mock('lucide-react', () => ({
  ChevronRight: ({ className }: { className?: string }) => (
    <span data-testid="chevron-right" className={className} />
  ),
}))

// Mock child components so tests stay focused on SubjectRow's own behaviour.
vi.mock('./topic-row', () => ({
  TopicRow: ({ topic }: { topic: { id: string; code: string; name: string } }) => (
    <div data-testid={`topic-row-${topic.id}`}>{topic.name}</div>
  ),
}))

vi.mock('./delete-button', () => ({
  DeleteButton: ({ label }: { label: string }) => (
    <button type="button" data-testid="delete-button">
      Delete {label}
    </button>
  ),
}))

vi.mock('./inline-form', () => ({
  InlineForm: ({
    onSubmit,
    onCancel,
    submitLabel,
    fields,
  }: {
    fields: Array<{ name: string; placeholder: string }>
    onSubmit: (data: Record<string, string>) => void
    onCancel?: () => void
    submitLabel?: string
  }) => (
    <div data-testid="inline-form">
      {fields.map((f) => (
        <input key={f.name} aria-label={f.placeholder} data-field={f.name} />
      ))}
      <button
        type="button"
        data-testid={`inline-form-submit-${submitLabel ?? 'Add'}`}
        onClick={() => {
          const data: Record<string, string> = {}
          for (const f of fields) {
            const el = document.querySelector<HTMLInputElement>(`[data-field="${f.name}"]`)
            data[f.name] = el?.value ?? ''
          }
          onSubmit(data)
        }}
      >
        {submitLabel ?? 'Add'}
      </button>
      {onCancel && (
        <button type="button" data-testid="inline-form-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  ),
}))

// Collapsible and CollapsibleTrigger: wire open state through click so
// CollapsibleContent visibility is testable.
vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
    onOpenChange: (v: boolean) => void
  }) => (
    <div data-testid="collapsible" data-open={open}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({
    children,
    render: renderProp,
  }: {
    children: React.ReactNode
    render?: React.ReactElement
  }) => {
    // The component passes a render prop (Base UI pattern). We render a button
    // that forwards the aria-label from the render prop and triggers a click.
    const label =
      renderProp && 'props' in renderProp
        ? (renderProp.props as { 'aria-label'?: string })['aria-label']
        : undefined
    return (
      <button type="button" data-testid="collapsible-trigger" aria-label={label}>
        {children}
      </button>
    )
  },
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
}))

// ---- Subject under test ----------------------------------------------------

import { SubjectRow } from './subject-row'

// ---- Fixtures --------------------------------------------------------------

import type { SyllabusSubject } from '../types'

const SUBJECT: SyllabusSubject = {
  id: 'subj-1',
  code: '050',
  name: 'Meteorology',
  short: 'MET',
  sort_order: 1,
  questionCount: 10,
  topics: [
    {
      id: 'topic-1',
      code: '050-01',
      name: 'The Atmosphere',
      sort_order: 1,
      questionCount: 5,
      subtopics: [],
    },
  ],
}

// ---- Tests -----------------------------------------------------------------

describe('SubjectRow', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the subject code, name, and short label', () => {
    render(<SubjectRow subject={SUBJECT} />)
    expect(screen.getByText('050')).toBeInTheDocument()
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
    expect(screen.getByText('MET')).toBeInTheDocument()
  })

  it('renders the question count badge', () => {
    render(<SubjectRow subject={SUBJECT} />)
    expect(screen.getByText('10 Q')).toBeInTheDocument()
  })

  it('renders the collapsible trigger with aria-label containing code and name', () => {
    render(<SubjectRow subject={SUBJECT} />)
    expect(screen.getByTestId('collapsible-trigger')).toHaveAttribute(
      'aria-label',
      'Toggle 050 Meteorology',
    )
  })

  it('renders the edit button', () => {
    render(<SubjectRow subject={SUBJECT} />)
    expect(screen.getByRole('button', { name: 'Edit subject' })).toBeInTheDocument()
  })

  it('renders the delete button', () => {
    render(<SubjectRow subject={SUBJECT} />)
    expect(screen.getByTestId('delete-button')).toBeInTheDocument()
  })

  it('renders topic rows inside the collapsible content', () => {
    render(<SubjectRow subject={SUBJECT} />)
    expect(screen.getByTestId('topic-row-topic-1')).toBeInTheDocument()
  })

  it('switches to edit mode when the edit button is clicked', async () => {
    const user = userEvent.setup()
    render(<SubjectRow subject={SUBJECT} />)

    await user.click(screen.getByRole('button', { name: 'Edit subject' }))

    // InlineForm is rendered with a Save submit button in edit mode
    expect(screen.getByTestId('inline-form-submit-Save')).toBeInTheDocument()
    // Normal row content is no longer visible
    expect(screen.queryByText('Meteorology')).not.toBeInTheDocument()
  })

  it('returns to view mode when the cancel button is clicked during editing', async () => {
    const user = userEvent.setup()
    render(<SubjectRow subject={SUBJECT} />)

    await user.click(screen.getByRole('button', { name: 'Edit subject' }))
    await user.click(screen.getByTestId('inline-form-cancel'))

    expect(screen.getByText('Meteorology')).toBeInTheDocument()
  })

  it('shows a success toast and closes edit mode on successful subject update', async () => {
    mockUpsertSubject.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<SubjectRow subject={SUBJECT} />)

    await user.click(screen.getByRole('button', { name: 'Edit subject' }))
    await user.click(screen.getByTestId('inline-form-submit-Save'))

    expect(mockUpsertSubject).toHaveBeenCalled()
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('updated'))
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
  })

  it('shows an error toast when subject update returns an error', async () => {
    mockUpsertSubject.mockResolvedValue({ success: false, error: 'Code already exists' })
    const user = userEvent.setup()
    render(<SubjectRow subject={SUBJECT} />)

    await user.click(screen.getByRole('button', { name: 'Edit subject' }))
    await user.click(screen.getByTestId('inline-form-submit-Save'))

    expect(mockToastError).toHaveBeenCalledWith('Code already exists')
    // Stays in edit mode on failure
    expect(screen.getByTestId('inline-form-submit-Save')).toBeInTheDocument()
  })

  it('shows a generic error toast when subject update throws', async () => {
    mockUpsertSubject.mockRejectedValue(new Error('Network failure'))
    const user = userEvent.setup()
    render(<SubjectRow subject={SUBJECT} />)

    await user.click(screen.getByRole('button', { name: 'Edit subject' }))
    await user.click(screen.getByTestId('inline-form-submit-Save'))

    expect(mockToastError).toHaveBeenCalledWith('Service error. Please try again.')
  })

  it('calls upsertTopic with the subject id when the add-topic form is submitted', async () => {
    mockUpsertTopic.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<SubjectRow subject={SUBJECT} />)

    await user.click(screen.getByTestId('inline-form-submit-Add'))

    expect(mockUpsertTopic).toHaveBeenCalledWith(expect.objectContaining({ subject_id: 'subj-1' }))
  })

  it('shows a success toast when a topic is added successfully', async () => {
    mockUpsertTopic.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<SubjectRow subject={SUBJECT} />)

    await user.click(screen.getByTestId('inline-form-submit-Add'))

    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('added'))
  })

  it('shows an error toast when adding a topic returns an error', async () => {
    mockUpsertTopic.mockResolvedValue({ success: false, error: 'Duplicate code' })
    const user = userEvent.setup()
    render(<SubjectRow subject={SUBJECT} />)

    await user.click(screen.getByTestId('inline-form-submit-Add'))

    expect(mockToastError).toHaveBeenCalledWith('Duplicate code')
  })

  it('shows a generic error toast when adding a topic throws', async () => {
    mockUpsertTopic.mockRejectedValue(new Error('Timeout'))
    const user = userEvent.setup()
    render(<SubjectRow subject={SUBJECT} />)

    await user.click(screen.getByTestId('inline-form-submit-Add'))

    expect(mockToastError).toHaveBeenCalledWith('Service error. Please try again.')
  })
})
