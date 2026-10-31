import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DiagramAnswerRow } from './diagram-tap-list'

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
