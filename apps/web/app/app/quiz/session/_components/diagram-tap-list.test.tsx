import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DiagramAnswerRow, DiagramTapPool } from './diagram-tap-list'

const ZONE = { id: 'z1' } as never

function row(props: { locked: boolean; result?: 'correct' | 'incorrect' }) {
  render(
    <ol>
      <DiagramAnswerRow
        zone={ZONE}
        n={1}
        placed={null}
        armed={null}
        disabled
        locked={props.locked}
        result={props.result}
        onTap={vi.fn()}
      />
    </ol>,
  )
  return screen.getByTestId('diagram-row-z1')
}

describe('DiagramAnswerRow locked state (round 4 #2)', () => {
  it('keeps full opacity when locked without a graded result', () => {
    expect(row({ locked: true })).toHaveClass('disabled:opacity-100')
  })

  it('does not force full opacity when neither locked nor graded', () => {
    expect(row({ locked: false })).not.toHaveClass('disabled:opacity-100')
  })
})

function pool(props: { disabled?: boolean; placedArmed?: boolean; onTapPool?: () => void }) {
  render(
    <DiagramTapPool
      labels={[]}
      armed={props.placedArmed ? { kind: 'label', id: 'l1' } : null}
      placedArmed={props.placedArmed ?? false}
      disabled={props.disabled ?? false}
      onTapLabel={vi.fn()}
      onTapPool={props.onTapPool ?? vi.fn()}
    />,
  )
  return screen.getByTestId('diagram-tap-pool')
}

describe('DiagramTapPool background tap (#1676)', () => {
  it('marks the pool element role="presentation"', () => {
    expect(pool({})).toHaveAttribute('role', 'presentation')
  })

  it('calls onTapPool once when the pool background is clicked', () => {
    const onTapPool = vi.fn()
    fireEvent.click(pool({ onTapPool }))
    expect(onTapPool).toHaveBeenCalledTimes(1)
  })

  it('calls nothing when the pool background is clicked while disabled', () => {
    const onTapPool = vi.fn()
    fireEvent.click(pool({ disabled: true, onTapPool }))
    expect(onTapPool).not.toHaveBeenCalled()
  })

  it('calls onTapPool once in total when the Return to pool button is clicked', () => {
    const onTapPool = vi.fn()
    pool({ placedArmed: true, onTapPool })
    fireEvent.click(screen.getByRole('button', { name: 'Return to pool' }))
    expect(onTapPool).toHaveBeenCalledTimes(1)
  })
})
