import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { RowMenu } from './row-menu'

describe('RowMenu', () => {
  it('forwards triggerRef to the trigger button', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <RowMenu label="More actions" triggerRef={ref}>
        <span />
      </RowMenu>,
    )
    expect(ref.current).toBe(screen.getByRole('button', { name: 'More actions' }))
  })
})
