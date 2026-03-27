import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsentCheckbox } from './consent-checkbox'

// ---- Helpers ---------------------------------------------------------------

type CheckboxProps = {
  id?: string
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  label?: string
  linkHref?: string
  linkText?: string
  required?: boolean
  description?: string
}

function renderCheckbox(overrides: CheckboxProps = {}) {
  const defaults = {
    id: 'test-checkbox',
    checked: false,
    onCheckedChange: vi.fn(),
    disabled: false,
    label: 'I accept the',
    linkHref: '/legal/terms',
    linkText: 'Terms of Service',
  }
  const props = { ...defaults, ...overrides }
  render(<ConsentCheckbox {...props} />)
  return props
}

// ---- Tests -----------------------------------------------------------------

describe('ConsentCheckbox', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('label association', () => {
    it('renders a label element with htmlFor matching the checkbox id', () => {
      renderCheckbox({ id: 'my-checkbox' })
      const label = screen.getByText('I accept the', { exact: false }).closest('label')
      expect(label).toBeInTheDocument()
      expect(label).toHaveAttribute('for', 'my-checkbox')
    })
  })

  describe('link rendering', () => {
    it('renders the link with the correct href and text', () => {
      renderCheckbox({ linkHref: '/legal/terms', linkText: 'Terms of Service' })
      const link = screen.getByRole('link', { name: 'Terms of Service' })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/legal/terms')
    })

    it('renders the link with target _blank and rel noopener noreferrer', () => {
      renderCheckbox()
      const link = screen.getByRole('link', { name: 'Terms of Service' })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  describe('required indicator', () => {
    it('renders the required asterisk when required is true', () => {
      renderCheckbox({ required: true })
      expect(screen.getByText('*', { exact: false })).toBeInTheDocument()
    })

    it('does not render the required asterisk when required is not set', () => {
      renderCheckbox({ required: false })
      expect(screen.queryByText('*', { exact: false })).not.toBeInTheDocument()
    })
  })

  describe('description', () => {
    it('renders the description when provided', () => {
      renderCheckbox({ description: 'Help us improve the platform' })
      expect(screen.getByText('Help us improve the platform')).toBeInTheDocument()
    })

    it('does not render a description element when description is not provided', () => {
      renderCheckbox()
      expect(screen.queryByText('Help us improve')).not.toBeInTheDocument()
    })
  })

  describe('checkbox interaction', () => {
    it('calls onCheckedChange when the checkbox is toggled', async () => {
      const onCheckedChange = vi.fn()
      renderCheckbox({ onCheckedChange })

      const user = userEvent.setup()
      await user.click(screen.getByRole('checkbox'))

      expect(onCheckedChange).toHaveBeenCalledWith(true)
    })

    it('does not call onCheckedChange when the checkbox is disabled', async () => {
      const onCheckedChange = vi.fn()
      renderCheckbox({ disabled: true, onCheckedChange })

      const user = userEvent.setup()
      await user.click(screen.getByRole('checkbox'))

      expect(onCheckedChange).not.toHaveBeenCalled()
    })
  })

  describe('link placement inside label', () => {
    it('renders the link inside the label element so clicks are scoped correctly', () => {
      renderCheckbox()
      const label = screen.getByText('I accept the', { exact: false }).closest('label')
      const link = screen.getByRole('link', { name: 'Terms of Service' })
      expect(label).toContainElement(link)
    })
  })
})
