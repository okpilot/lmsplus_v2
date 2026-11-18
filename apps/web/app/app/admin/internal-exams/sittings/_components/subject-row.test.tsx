import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SubjectRow } from './subject-row'

const row = { subjectId: 's1', subjectShort: 'FPM', subjectName: 'Flight Performance' }
const view = (over: Record<string, unknown> = {}) => ({
  tickable: true,
  text: '',
  reasons: '',
  ...over,
})
const show = (v: unknown, over: Record<string, unknown> = {}) => {
  const onToggle = vi.fn()
  render(
    <ul>
      <SubjectRow
        row={row as never}
        view={v as never}
        checked={false}
        busy={false}
        onToggle={onToggle}
        {...(over as object)}
      />
    </ul>,
  )
  return onToggle
}

describe('SubjectRow', () => {
  it('has a labelled checkbox only when tickable (AC 36)', async () => {
    const onToggle = show(view())
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Add FPM' }))
    expect(onToggle).toHaveBeenCalledWith('s1')
  })

  it('has no checkbox when blocked and shows the state text and reasons (AC 36, 37)', () => {
    show(view({ tickable: false, text: 'Not enrolled', reasons: '2 passed' }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('Not enrolled')).toBeInTheDocument()
    expect(screen.getByText('2 passed')).toBeInTheDocument()
    expect(screen.getByText('Flight Performance')).toBeInTheDocument()
  })

  it('disables the checkbox while busy and reflects checked', () => {
    show(view(), { busy: true, checked: true })
    const cb = screen.getByRole('checkbox', { name: 'Add FPM' })
    expect(cb).toHaveAttribute('aria-disabled', 'true')
    expect(cb).toBeChecked()
  })
})
