import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockExportMyData, mockToastSuccess, mockToastError, mockToastWarning } = vi.hoisted(() => ({
  mockExportMyData: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastWarning: vi.fn(),
}))

vi.mock('../gdpr-actions', () => ({ exportMyData: mockExportMyData }))
vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError, warning: mockToastWarning },
}))

// jsdom does not implement URL.createObjectURL / URL.revokeObjectURL
vi.stubGlobal('URL', {
  createObjectURL: vi.fn().mockReturnValue('blob:mock'),
  revokeObjectURL: vi.fn(),
})

// ---- Subject under test ---------------------------------------------------

import { DataExportCard } from './data-export-card'

// ---- Helpers ---------------------------------------------------------------

const MOCK_PAYLOAD = {
  exported_at: '2026-03-27T10:00:00.000Z',
  warnings: [],
  user: {
    id: 'u-1',
    email: 'student@example.com',
    full_name: 'Jane Smith',
    role: 'student',
    created_at: '2026-01-01T00:00:00Z',
    last_active_at: null,
  },
  quiz_sessions: [],
  quiz_answers: [],
  student_responses: [],
  fsrs_cards: [],
  flagged_questions: [],
  question_comments: [],
  user_consents: [],
  audit_events: [],
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

/**
 * Stub document.createElement so the anchor's .click() is a no-op (jsdom does not
 * implement navigation). Returns the spy so a test can restore the original
 * mid-test if it needs the real createElement; cross-test cleanup is handled
 * globally by restoreMocks (vitest.config.ts).
 */
function stubLinkClick() {
  const originalCreateElement = document.createElement.bind(document)
  return vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = originalCreateElement(tag)
    if (tag === 'a') {
      Object.defineProperty(el, 'click', { value: vi.fn(), writable: true })
    }
    return el
  })
}

describe('DataExportCard', () => {
  describe('rendering', () => {
    it('renders the card heading', () => {
      render(<DataExportCard />)
      expect(screen.getByText('Your Data')).toBeInTheDocument()
    })

    it('renders the export button', () => {
      render(<DataExportCard />)
      expect(screen.getByRole('button', { name: /export my data/i })).toBeInTheDocument()
    })

    it('renders the GDPR article reference in the description', () => {
      render(<DataExportCard />)
      expect(screen.getByText(/GDPR Articles 15/i)).toBeInTheDocument()
    })
  })

  describe('happy path', () => {
    it('shows success toast when export succeeds', async () => {
      mockExportMyData.mockResolvedValue({ success: true, data: MOCK_PAYLOAD })
      const createElementSpy = stubLinkClick()
      try {
        const user = userEvent.setup()
        render(<DataExportCard />)

        await user.click(screen.getByRole('button', { name: /export my data/i }))

        await waitFor(() => {
          expect(mockToastSuccess).toHaveBeenCalledWith('Data exported successfully')
        })
      } finally {
        createElementSpy.mockRestore()
      }
    })

    it('shows a warning toast (not success) when the export has incomplete sections', async () => {
      mockExportMyData.mockResolvedValue({
        success: true,
        data: { ...MOCK_PAYLOAD, warnings: [{ section: 'quiz_sessions', message: 'incomplete' }] },
      })
      const createElementSpy = stubLinkClick()
      try {
        const user = userEvent.setup()
        render(<DataExportCard />)

        await user.click(screen.getByRole('button', { name: /export my data/i }))

        await waitFor(() => {
          expect(mockToastWarning).toHaveBeenCalledWith(expect.stringContaining('incomplete'))
        })
        expect(mockToastSuccess).not.toHaveBeenCalled()
      } finally {
        createElementSpy.mockRestore()
      }
    })
  })

  describe('error path', () => {
    it('shows an error toast when the export action returns failure', async () => {
      mockExportMyData.mockResolvedValue({ success: false, error: 'Failed to export data' })
      const user = userEvent.setup()
      render(<DataExportCard />)

      await user.click(screen.getByRole('button', { name: /export my data/i }))

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to export data')
      })
      expect(mockToastSuccess).not.toHaveBeenCalled()
    })
  })

  describe('pending state', () => {
    it('shows Exporting text and disables the button while the action is in flight', async () => {
      // Keep the promise pending so we can assert the loading state
      let resolve: (value: unknown) => void = () => {}
      mockExportMyData.mockReturnValue(
        new Promise((r) => {
          resolve = r
        }),
      )
      const user = userEvent.setup()
      render(<DataExportCard />)

      await user.click(screen.getByRole('button', { name: /export my data/i }))

      expect(screen.getByRole('button', { name: /exporting/i })).toBeDisabled()

      // Clean up by resolving the promise
      resolve({ success: false, error: 'cancelled' })
    })
  })
})
