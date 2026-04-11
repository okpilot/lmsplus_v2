'use client'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectWithConfig } from '../types'
import { ExamConfigPageShell } from './exam-config-page-shell'

// ---- Mocks -----------------------------------------------------------------

vi.mock('./subject-config-card', () => ({
  SubjectConfigCard: ({ subject, onEdit }: { subject: SubjectWithConfig; onEdit: () => void }) => (
    <button type="button" onClick={onEdit} data-testid={`card-${subject.id}`}>
      {subject.name}
    </button>
  ),
}))

vi.mock('./config-form-dialog', () => ({
  ConfigFormDialog: ({
    subject,
    open,
    onOpenChange,
  }: {
    subject: SubjectWithConfig
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div data-testid="dialog" data-subject-id={subject.id}>
        <button type="button" onClick={() => onOpenChange(false)}>
          Close Dialog
        </button>
      </div>
    ) : null,
}))

// ---- Fixtures --------------------------------------------------------------

const SUBJECT_1: SubjectWithConfig = {
  id: 'subj-1',
  code: 'AGK',
  name: 'General Knowledge',
  short: 'GK',
  config: null,
  topics: [],
}

const SUBJECT_2: SubjectWithConfig = {
  id: 'subj-2',
  code: 'MET',
  name: 'Meteorology',
  short: 'MET',
  config: null,
  topics: [],
}

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ExamConfigPageShell', () => {
  describe('rendering', () => {
    it('renders a card for every subject', () => {
      render(<ExamConfigPageShell subjects={[SUBJECT_1, SUBJECT_2]} />)
      expect(screen.getByTestId('card-subj-1')).toBeTruthy()
      expect(screen.getByTestId('card-subj-2')).toBeTruthy()
    })

    it('does not render the dialog when no subject is being edited', () => {
      render(<ExamConfigPageShell subjects={[SUBJECT_1]} />)
      expect(screen.queryByTestId('dialog')).toBeNull()
    })
  })

  describe('editing a subject', () => {
    it('opens the dialog for the correct subject when a card edit is triggered', async () => {
      render(<ExamConfigPageShell subjects={[SUBJECT_1, SUBJECT_2]} />)

      await userEvent.click(screen.getByTestId('card-subj-2'))

      const dialog = screen.getByTestId('dialog')
      expect(dialog.getAttribute('data-subject-id')).toBe('subj-2')
    })

    it('closes the dialog when onOpenChange(false) is called', async () => {
      render(<ExamConfigPageShell subjects={[SUBJECT_1]} />)

      await userEvent.click(screen.getByTestId('card-subj-1'))
      expect(screen.getByTestId('dialog')).toBeTruthy()

      await userEvent.click(screen.getByRole('button', { name: 'Close Dialog' }))

      await waitFor(() => {
        expect(screen.queryByTestId('dialog')).toBeNull()
      })
    })

    it('switches the dialog to a different subject when another card edit is triggered', async () => {
      render(<ExamConfigPageShell subjects={[SUBJECT_1, SUBJECT_2]} />)

      await userEvent.click(screen.getByTestId('card-subj-1'))
      expect(screen.getByTestId('dialog').getAttribute('data-subject-id')).toBe('subj-1')

      // Close first, then open the second subject
      await userEvent.click(screen.getByRole('button', { name: 'Close Dialog' }))
      await userEvent.click(screen.getByTestId('card-subj-2'))

      expect(screen.getByTestId('dialog').getAttribute('data-subject-id')).toBe('subj-2')
    })
  })
})
