import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

vi.mock('../actions', () => ({
  recordConsent: vi.fn(),
}))

const mockRouterPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

// ---- Subject under test ---------------------------------------------------

import { recordConsent } from '../actions'
import { ConsentForm } from './consent-form'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ConsentForm', () => {
  describe('initial render', () => {
    it('renders the welcome heading', () => {
      render(<ConsentForm />)
      expect(screen.getByText('Welcome to LMS Plus')).toBeInTheDocument()
    })

    it('renders TOS and Privacy checkboxes unchecked', () => {
      render(<ConsentForm />)
      expect(screen.getByLabelText('I accept the Terms of Service')).not.toBeChecked()
      expect(screen.getByLabelText('I accept the Privacy Policy')).not.toBeChecked()
    })

    it('does not render an analytics checkbox', () => {
      render(<ConsentForm />)
      expect(screen.queryByLabelText(/analytics/i)).not.toBeInTheDocument()
    })

    it('renders the Continue button disabled when no checkboxes are checked', () => {
      render(<ConsentForm />)
      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
    })
  })

  describe('submit button enablement', () => {
    it('remains disabled when only TOS is checked', async () => {
      const user = userEvent.setup()
      render(<ConsentForm />)

      await user.click(screen.getByLabelText('I accept the Terms of Service'))

      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
    })

    it('remains disabled when only Privacy is checked', async () => {
      const user = userEvent.setup()
      render(<ConsentForm />)

      await user.click(screen.getByLabelText('I accept the Privacy Policy'))

      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
    })

    it('becomes enabled when both TOS and Privacy are checked', async () => {
      const user = userEvent.setup()
      render(<ConsentForm />)

      await user.click(screen.getByLabelText('I accept the Terms of Service'))
      await user.click(screen.getByLabelText('I accept the Privacy Policy'))

      expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled()
    })
  })

  describe('successful submission', () => {
    it('navigates to the dashboard when TOS and Privacy are accepted', async () => {
      vi.mocked(recordConsent).mockResolvedValue({ success: true })
      const user = userEvent.setup()
      render(<ConsentForm />)

      await user.click(screen.getByLabelText('I accept the Terms of Service'))
      await user.click(screen.getByLabelText('I accept the Privacy Policy'))
      await user.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        expect(recordConsent).toHaveBeenCalledWith({
          acceptedTos: true,
          acceptedPrivacy: true,
        })
        expect(mockRouterPush).toHaveBeenCalledWith('/app/dashboard')
      })
    })
  })

  describe('error handling', () => {
    it('shows the server error message when consent recording fails', async () => {
      vi.mocked(recordConsent).mockResolvedValue({
        success: false,
        error: 'Failed to record consent',
      })
      const user = userEvent.setup()
      render(<ConsentForm />)

      await user.click(screen.getByLabelText('I accept the Terms of Service'))
      await user.click(screen.getByLabelText('I accept the Privacy Policy'))
      await user.click(screen.getByRole('button', { name: /continue/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to record consent')
      expect(mockRouterPush).not.toHaveBeenCalled()
    })

    it('shows a fallback error message when the action throws unexpectedly', async () => {
      vi.mocked(recordConsent).mockRejectedValue(new Error('Network error'))
      const user = userEvent.setup()
      render(<ConsentForm />)

      await user.click(screen.getByLabelText('I accept the Terms of Service'))
      await user.click(screen.getByLabelText('I accept the Privacy Policy'))
      await user.click(screen.getByRole('button', { name: /continue/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Something went wrong. Please try again.',
      )
      expect(mockRouterPush).not.toHaveBeenCalled()
    })

    it('clears a previous error when submitting again', async () => {
      vi.mocked(recordConsent)
        .mockResolvedValueOnce({ success: false, error: 'Failed to record consent' })
        .mockResolvedValueOnce({ success: true })
      const user = userEvent.setup()
      render(<ConsentForm />)

      await user.click(screen.getByLabelText('I accept the Terms of Service'))
      await user.click(screen.getByLabelText('I accept the Privacy Policy'))

      // First submit — fails
      await user.click(screen.getByRole('button', { name: /continue/i }))
      expect(await screen.findByRole('alert')).toBeInTheDocument()

      // Second submit — succeeds
      await user.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })
    })
  })
})
