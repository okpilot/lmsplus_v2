import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../actions/upsert-subtopic', () => ({ upsertSubtopic: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./delete-button', () => ({ DeleteButton: () => null }))
vi.mock('./inline-form', () => ({ InlineForm: () => null }))

import { SubtopicRow } from './subtopic-row'

const SUBTOPIC = { id: 's1', code: '010.1', name: 'Rules', sort_order: 1, questionCount: 2 }

describe('SubtopicRow', () => {
  it('pads the row to a 44px tap pitch below lg and compacts it from lg', () => {
    render(<SubtopicRow subtopic={SUBTOPIC as never} topicId="t1" />)
    const row = screen.getByText('010.1').parentElement
    expect(row?.className).toContain('py-2.5')
    expect(row?.className).toContain('lg:py-1')
  })
})
