import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ search: '', open: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(m.search),
}))
vi.mock('../sittings/_hooks/sitting-ui-context', () => ({
  useSittingUi: () => ({ open: m.open }),
}))

import { InternalExamsHeaderAction } from './internal-exams-header-action'

beforeEach(() => m.open.mockReset())

describe('InternalExamsHeaderAction', () => {
  it('opens the new-sitting dialog with the button as opener on the sittings tab', async () => {
    m.search = 'tab=sittings&scope=open'
    render(<InternalExamsHeaderAction />)
    const button = screen.getByRole('button', { name: /New sitting/ })
    await userEvent.setup().click(button)
    expect(m.open).toHaveBeenCalledWith('new', button)
  })

  it.each(['tab=codes', 'tab=attempts', '', 'tab=bogus', 'tab=sittings&tab=codes'])(
    'renders nothing for "%s"',
    (qs) => {
      m.search = qs
      const { container } = render(<InternalExamsHeaderAction />)
      expect(container).toBeEmptyDOMElement()
    },
  )
})
