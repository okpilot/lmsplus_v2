import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ErrorLine } from './dialog-summary'

describe('ErrorLine', () => {
  it('shows the message as an alert', () => {
    render(<ErrorLine message="Something failed" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something failed')
  })

  it.each([null, undefined, ''])('renders nothing for an empty message (%s)', (message) => {
    const { container } = render(<ErrorLine message={message} />)
    expect(container).toBeEmptyDOMElement()
  })
})
