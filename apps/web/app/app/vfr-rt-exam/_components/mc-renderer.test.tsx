import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { McRenderer } from './mc-renderer'

const OPTIONS = [
  { id: 'opt-a', text: 'Climb to 3000 feet' },
  { id: 'opt-b', text: 'Maintain present level' },
  { id: 'opt-c', text: 'Descend to 2000 feet' },
]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('McRenderer', () => {
  it('renders one selectable row per option', () => {
    render(<McRenderer options={OPTIONS} value={null} onChange={vi.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('calls onChange with the clicked option id', () => {
    const onChange = vi.fn()
    render(<McRenderer options={OPTIONS} value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('Maintain present level'))
    expect(onChange).toHaveBeenCalledWith('opt-b')
  })

  it('marks the option matching value as checked', () => {
    render(<McRenderer options={OPTIONS} value="opt-c" onChange={vi.fn()} />)
    const checked = screen.getAllByRole('radio', { checked: true })
    expect(checked).toHaveLength(1)
    expect(checked[0]).toHaveAttribute('value', 'opt-c')
  })

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn()
    render(<McRenderer options={OPTIONS} value={null} onChange={onChange} disabled />)
    fireEvent.click(screen.getByText('Climb to 3000 feet'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders nothing when there are no options', () => {
    render(<McRenderer options={[]} value={null} onChange={vi.fn()} />)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('labels options A, B, C by position', () => {
    render(<McRenderer options={OPTIONS} value={null} onChange={vi.fn()} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('disables all radio inputs when disabled is set', () => {
    render(<McRenderer options={OPTIONS} value={null} onChange={vi.fn()} disabled />)
    const radios = screen.getAllByRole('radio')
    for (const radio of radios) {
      expect(radio).toBeDisabled()
    }
  })
})
