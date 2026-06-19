import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShortAnswerRenderer } from './short-answer-renderer'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ShortAnswerRenderer', () => {
  it('reflects the value prop in the input', () => {
    render(<ShortAnswerRenderer value="descending" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('descending')
  })

  it('calls onChange with the typed text', () => {
    const onChange = vi.fn()
    render(<ShortAnswerRenderer value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'cleared to land' } })
    expect(onChange).toHaveBeenCalledWith('cleared to land')
  })

  it('disables the input when disabled is set', () => {
    render(<ShortAnswerRenderer value="" onChange={vi.fn()} disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })
})
