import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Table, TableHeader, TableRow } from './table'

describe('Table surface', () => {
  it('container is a bordered card surface that scrolls horizontally', () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow />
        </TableHeader>
      </Table>,
    )
    const box = container.querySelector('[data-slot="table-container"]') as HTMLElement
    for (const c of ['rounded-card', 'border', 'border-border', 'bg-card', 'overflow-x-auto']) {
      expect(box.className.split(/\s+/)).toContain(c)
    }
  })

  it('header has bg-muted and neutralises row hover', () => {
    const { container } = render(
      <table>
        <TableHeader />
      </table>,
    )
    const head = container.querySelector('[data-slot="table-header"]') as HTMLElement
    expect(head.className.split(/\s+/)).toContain('bg-muted')
    expect(head.className).toContain('[&_tr]:hover:bg-transparent')
  })
})
