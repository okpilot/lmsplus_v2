import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiscardConfirm, SubmitConfirm } from './dialog-confirms'

const submitBase = {
  confirming: true,
  unanswered: 2,
  timeExpired: false,
  submitting: false,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
}

const discardBase = {
  confirming: true,
  canDiscard: true,
  submitting: false,
  onDiscard: vi.fn(),
  onCancel: vi.fn(),
}

describe('SubmitConfirm', () => {
  it('shows the submit-anyway panel when confirming with unanswered questions', () => {
    render(<SubmitConfirm {...submitBase} />)
    expect(screen.getByRole('button', { name: 'Submit anyway' })).toBeInTheDocument()
  })

  it('renders nothing when the user is not confirming', () => {
    const { container } = render(<SubmitConfirm {...submitBase} confirming={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when every question is answered', () => {
    const { container } = render(<SubmitConfirm {...submitBase} unanswered={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the time has expired', () => {
    const { container } = render(<SubmitConfirm {...submitBase} timeExpired />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('DiscardConfirm', () => {
  it('shows the discard panel when confirming and discard is allowed', () => {
    render(<DiscardConfirm {...discardBase} />)
    expect(screen.getByRole('button', { name: 'Yes, discard' })).toBeInTheDocument()
  })

  it('renders nothing when the user is not confirming', () => {
    const { container } = render(<DiscardConfirm {...discardBase} confirming={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when discard is not allowed', () => {
    const { container } = render(<DiscardConfirm {...discardBase} canDiscard={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
