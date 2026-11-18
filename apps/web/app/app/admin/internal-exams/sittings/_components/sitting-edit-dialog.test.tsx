import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SittingRow } from '../types'

const m = vi.hoisted(() => ({ dlg: null as string | null }))
vi.mock('../_hooks/sitting-ui-context', () => ({
  useSittingUi: () => ({ dlg: m.dlg }),
}))
vi.mock('./sitting-form-dialog', () => ({
  SittingFormDialog: ({ mode }: Readonly<{ mode: string }>) => <div>form:{mode}</div>,
}))

import { SittingEditDialog } from './sitting-edit-dialog'

const sitting = { id: 'sit-1' } as SittingRow

beforeEach(() => {
  m.dlg = null
})

describe('SittingEditDialog', () => {
  it('renders nothing when the URL names no dialog', () => {
    const { container } = render(<SittingEditDialog sitting={sitting} invigilators={[]} editable />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while the New dialog is named', () => {
    m.dlg = 'new'
    const { container } = render(<SittingEditDialog sitting={sitting} invigilators={[]} editable />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the sitting is no longer editable', () => {
    m.dlg = 'edit'
    const { container } = render(
      <SittingEditDialog sitting={sitting} invigilators={[]} editable={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the Edit form when the URL names Edit and the sitting is editable', () => {
    m.dlg = 'edit'
    render(<SittingEditDialog sitting={sitting} invigilators={[]} editable />)
    expect(screen.getByText('form:edit')).toBeInTheDocument()
  })
})
