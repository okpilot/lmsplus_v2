import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DialogFillRenderer } from './dialog-fill-renderer'

// The client only ever receives the STRIPPED template with bare {{n}} markers.
const TEMPLATE = '[atc] Cleared to land. {{0}} report vacated.\n[pilot] {{1}} runway 27.'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('DialogFillRenderer', () => {
  it('renders one input per blank marker in the template', () => {
    render(<DialogFillRenderer template={TEMPLATE} values={{}} onChange={vi.fn()} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
  })

  it('reflects the value for each blank index', () => {
    render(
      <DialogFillRenderer
        template={TEMPLATE}
        values={{ 0: 'foxtrot', 1: 'vacated' }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Blank 1')).toHaveValue('foxtrot')
    expect(screen.getByLabelText('Blank 2')).toHaveValue('vacated')
  })

  it('calls onChange with the blank index and typed text', () => {
    const onChange = vi.fn()
    render(<DialogFillRenderer template={TEMPLATE} values={{}} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Blank 2'), { target: { value: 'cleared to land' } })
    expect(onChange).toHaveBeenCalledWith(1, 'cleared to land')
  })

  it('renders the speaker labels', () => {
    render(<DialogFillRenderer template={TEMPLATE} values={{}} onChange={vi.fn()} />)
    expect(screen.getByText('ATC')).toBeInTheDocument()
    expect(screen.getByText('Pilot')).toBeInTheDocument()
  })

  it('strips canonical answers even if a pipe-form token reaches the renderer', () => {
    // Defense-in-depth: the RPC strips canonicals server-side, but assert the
    // parser→renderer chain also drops them — a {{n|canonical;syn}} token must
    // render as an empty input, never exposing the answer in the DOM.
    const { container } = render(
      <DialogFillRenderer
        template="[atc] {{0|S5-ABC;descending to 2500 feet}} cleared."
        values={{}}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(container.innerHTML).not.toContain('S5-ABC')
    expect(container.innerHTML).not.toContain('descending to 2500 feet')
  })

  it('renders no inputs and no text when the template is empty', () => {
    render(<DialogFillRenderer template="" values={{}} onChange={vi.fn()} />)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('disables all blank inputs when disabled is set', () => {
    render(<DialogFillRenderer template={TEMPLATE} values={{}} onChange={vi.fn()} disabled />)
    const inputs = screen.getAllByRole('textbox')
    for (const input of inputs) {
      expect(input).toBeDisabled()
    }
  })
})
