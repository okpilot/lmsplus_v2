import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../actions/upsert-topic', () => ({ upsertTopic: vi.fn() }))
vi.mock('../actions/upsert-subtopic', () => ({ upsertSubtopic: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./delete-button', () => ({ DeleteButton: () => null }))
vi.mock('./inline-form', () => ({ InlineForm: () => null }))
vi.mock('./subtopic-row', () => ({ SubtopicRow: () => null }))

import { TopicRow } from './topic-row'

const TOPIC = {
  id: 't1',
  code: '010',
  name: 'Air Law',
  sort_order: 1,
  questionCount: 3,
  subtopics: [],
}

describe('TopicRow', () => {
  it('pads the row to a 44px tap pitch below lg and compacts it from lg', () => {
    render(<TopicRow topic={TOPIC as never} subjectId="s1" />)
    const row = screen.getByRole('button', { name: /Toggle 010 Air Law/ }).parentElement
    expect(row?.className).toContain('py-2.5')
    expect(row?.className).toContain('lg:py-1.5')
  })
})
