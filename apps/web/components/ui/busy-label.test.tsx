import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { simulateTranslator } from '@/lib/test-support/simulate-translator'
import { BusyLabel } from './busy-label'

describe('BusyLabel', () => {
  it('shows only the label when idle', () => {
    const { container } = render(<BusyLabel busy={false}>Save</BusyLabel>)
    expect(container.textContent).toBe('Save')
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('shows a decorative spinner beside the label when busy', () => {
    const { container } = render(<BusyLabel busy>Save</BusyLabel>)
    expect(container.textContent).toBe('Save')
    expect(container.querySelector('.animate-spin')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps the label out of the layout so icon children sit beside their text', () => {
    const { container } = render(<BusyLabel busy={false}>Save</BusyLabel>)
    expect(container.querySelector('span')).toHaveClass('contents')
  })

  it('toggles the spinner and label on a translated page', () => {
    const { container, rerender } = render(<BusyLabel busy={false}>Save</BusyLabel>)
    simulateTranslator(container)
    expect(() => rerender(<BusyLabel busy>Saving...</BusyLabel>)).not.toThrow()
    expect(() => rerender(<BusyLabel busy={false}>Save</BusyLabel>)).not.toThrow()
    expect(container.querySelector('.animate-spin')).toBeNull()
  })
})
