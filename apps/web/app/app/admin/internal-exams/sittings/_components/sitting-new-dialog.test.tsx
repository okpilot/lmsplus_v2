import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ dlg: null as string | null }))
vi.mock('../_hooks/sitting-ui-context', () => ({
  useSittingUi: () => ({ dlg: m.dlg }),
}))
vi.mock('./sitting-form-dialog', () => ({
  SittingFormDialog: ({ mode }: Readonly<{ mode: string }>) => <div>form:{mode}</div>,
}))

import { SittingNewDialog } from './sitting-new-dialog'

beforeEach(() => {
  m.dlg = null
})

describe('SittingNewDialog', () => {
  it('renders nothing when the client URL has no dialog, even if the server rendered one', () => {
    const { container } = render(<SittingNewDialog invigilators={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while the Edit dialog is named', () => {
    m.dlg = 'edit'
    const { container } = render(<SittingNewDialog invigilators={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the New form while the URL names the New dialog', () => {
    m.dlg = 'new'
    render(<SittingNewDialog invigilators={[]} />)
    expect(screen.getByText('form:new')).toBeInTheDocument()
  })
})
