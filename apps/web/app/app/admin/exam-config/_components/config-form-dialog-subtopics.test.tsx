'use client'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectWithConfig } from '../types'
import { ConfigFormDialog } from './config-form-dialog'

vi.mock('../actions/upsert-exam-config', () => ({
  upsertExamConfig: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { upsertExamConfig } from '../actions/upsert-exam-config'

const SUBTOPICS = Array.from({ length: 11 }, (_, i) => ({
  id: `st-${i + 1}`,
  code: `100-04-${String(i + 1).padStart(2, '0')}`,
  name: `Objective ${i + 1}`,
  availableQuestions: i + 5,
}))

const subject: SubjectWithConfig = {
  id: 'subj-100',
  code: '100',
  name: 'KSA',
  short: 'KSA',
  config: null,
  topics: [
    {
      id: 'top-1',
      code: '100-04',
      name: 'Navigation',
      availableQuestions: 55,
      subtopics: SUBTOPICS,
    },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ConfigFormDialog sub-topic rows', () => {
  it('enables Save and submits 11 sub-topic rows with their subtopicIds when 11 x 2 equals total 22', async () => {
    vi.mocked(upsertExamConfig).mockResolvedValue({ success: true })
    render(<ConfigFormDialog subject={subject} open={true} onOpenChange={vi.fn()} />)

    const [totalInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    fireEvent.change(totalInput!, { target: { value: '22' } })
    for (const st of SUBTOPICS) {
      fireEvent.change(screen.getByLabelText(`${st.code} questions`), { target: { value: '2' } })
    }

    expect(screen.getByText(/Total: 22 \/ 22/)).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Save Config' }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    await userEvent.click(save)

    await waitFor(() => expect(upsertExamConfig).toHaveBeenCalled())
    const arg = vi.mocked(upsertExamConfig).mock.calls[0]![0] as {
      distributions: { topicId: string; subtopicId: string | null; questionCount: number }[]
    }
    expect(arg.distributions).toHaveLength(11)
    for (const st of SUBTOPICS) {
      expect(arg.distributions).toContainEqual({
        topicId: 'top-1',
        subtopicId: st.id,
        questionCount: 2,
      })
    }
  })
})
