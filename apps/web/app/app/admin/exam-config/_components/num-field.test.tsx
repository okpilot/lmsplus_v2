import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NumField } from './num-field'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('NumField', () => {
  describe('rendering', () => {
    it('displays the label text', () => {
      render(<NumField label="Total Questions" value={10} min={1} max={200} onChange={vi.fn()} />)
      expect(screen.getByText('Total Questions', { selector: 'label' })).toBeTruthy()
    })

    it('renders an input of type number with the provided value', () => {
      render(<NumField label="Pass Mark" value={75} min={1} max={100} onChange={vi.fn()} />)
      const input = screen.getByRole('spinbutton')
      expect((input as HTMLInputElement).value).toBe('75')
    })

    it('passes min and max attributes to the underlying input', () => {
      render(<NumField label="Time" value={60} min={10} max={3600} onChange={vi.fn()} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      expect(input.min).toBe('10')
      expect(input.max).toBe('3600')
    })
  })

  describe('onChange behaviour', () => {
    it('calls onChange with the typed number when the value is within range', async () => {
      const onChange = vi.fn()
      render(<NumField label="Total" value={0} min={0} max={200} onChange={onChange} />)
      const input = screen.getByRole('spinbutton')

      await userEvent.clear(input)
      await userEvent.type(input, '5')

      // Typing '5' fires one change event with value 5, within [0, 200]
      expect(onChange).toHaveBeenLastCalledWith(5)
    })

    it('clamps the value to max when typed number exceeds max', async () => {
      const onChange = vi.fn()
      render(<NumField label="Total" value={10} min={1} max={100} onChange={onChange} />)
      const input = screen.getByRole('spinbutton')

      await userEvent.clear(input)
      await userEvent.type(input, '150')

      const lastCall = onChange.mock.calls.at(-1)?.[0] as number
      expect(lastCall).toBeLessThanOrEqual(100)
    })

    it('clamps the value to min when typed number is below min', async () => {
      const onChange = vi.fn()
      render(<NumField label="Total" value={10} min={5} max={100} onChange={onChange} />)
      const input = screen.getByRole('spinbutton')

      await userEvent.clear(input)
      await userEvent.type(input, '1')

      // The clamped value must be at least min=5
      const lastCall = onChange.mock.calls.at(-1)?.[0] as number
      expect(lastCall).toBeGreaterThanOrEqual(5)
    })

    it('does not call onChange when the field is cleared (NaN guard)', async () => {
      const onChange = vi.fn()
      render(<NumField label="Total" value={10} min={1} max={200} onChange={onChange} />)
      const input = screen.getByRole('spinbutton')

      await userEvent.clear(input)

      // Clearing produces NaN — onChange must not be called
      expect(onChange).not.toHaveBeenCalled()
    })
  })
})
