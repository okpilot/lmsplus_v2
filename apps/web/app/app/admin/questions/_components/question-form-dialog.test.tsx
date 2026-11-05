import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../actions/upsert-question', () => ({ upsertQuestion: vi.fn() }))
vi.mock('../actions/get-correct-option', () => ({ getCorrectOption: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const UUID = '00000000-0000-4000-a000-000000000001'

type FieldProps = {
  onSubjectChange: (v: string) => void
  onTopicChange: (v: string) => void
  onQuestionTextChange: (v: string) => void
  onOptionsChange: (v: { id: 'a' | 'b' | 'c' | 'd'; text: string }[]) => void
  onCorrectOptionChange: (v: 'a' | 'b' | 'c' | 'd') => void
  onExplanationTextChange: (v: string) => void
}

vi.mock('./question-form-fields', () => ({
  QuestionFormFields: (p: FieldProps) => (
    <div>
      <button
        type="button"
        onClick={() => {
          p.onSubjectChange(UUID)
          p.onTopicChange(UUID)
        }}
      >
        set-syllabus
      </button>
      <button type="button" onClick={() => p.onQuestionTextChange('What?')}>
        set-text
      </button>
      <button
        type="button"
        onClick={() =>
          p.onOptionsChange([
            { id: 'a', text: 'A1' },
            { id: 'b', text: 'B1' },
            { id: 'c', text: 'C1' },
            { id: 'd', text: 'D1' },
          ])
        }
      >
        set-options
      </button>
      <button type="button" onClick={() => p.onCorrectOptionChange('a')}>
        set-correct
      </button>
      <button type="button" onClick={() => p.onExplanationTextChange('Because.')}>
        set-explanation
      </button>
    </div>
  ),
}))

import { QuestionFormDialog } from './question-form-dialog'

async function openDialog() {
  render(<QuestionFormDialog tree={[]} trigger={<button type="button">open</button>} />)
  await userEvent.click(screen.getByRole('button', { name: 'open' }))
}

const STEPS = ['set-syllabus', 'set-text', 'set-options', 'set-correct', 'set-explanation']

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QuestionFormDialog — submit gating (#888)', () => {
  it('disables Create Question on an empty form', async () => {
    await openDialog()
    expect(screen.getByRole('button', { name: 'Create Question' })).toBeDisabled()
  })

  it.each(STEPS)('keeps Create Question disabled when only %s is missing', async (missing) => {
    await openDialog()
    for (const step of STEPS.filter((s) => s !== missing)) {
      await userEvent.click(screen.getByRole('button', { name: step }))
    }
    expect(screen.getByRole('button', { name: 'Create Question' })).toBeDisabled()
  })

  it('enables Create Question once every required field is set', async () => {
    await openDialog()
    for (const step of STEPS) {
      await userEvent.click(screen.getByRole('button', { name: step }))
    }
    expect(screen.getByRole('button', { name: 'Create Question' })).toBeEnabled()
  })
})
