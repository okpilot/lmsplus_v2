'use client'

import { useState } from 'react'
import { CardList } from '@/components/ui/card'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import type { AvailableInternalExam } from '../queries'
import { AvailableRow } from './available-row'
import { CodeEntryModal } from './code-entry-modal'

type Props = { rows: AvailableInternalExam[] }

export function AvailableTab({ rows }: Readonly<Props>) {
  const [selected, setSelected] = useState<AvailableInternalExam | null>(null)

  if (rows.length === 0) {
    return (
      <Empty data-testid="available-empty">
        <EmptyDescription>
          No internal exams available — your administrator will issue you a code when one is ready.
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="space-y-stack">
      <CardList role="list" data-testid="available-list">
        {rows.map((row) => (
          <AvailableRow key={row.id} row={row} onStart={setSelected} />
        ))}
      </CardList>
      <CodeEntryModal
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null)
        }}
        subjectName={selected?.subjectName ?? ''}
        subjectShort={selected?.subjectShort ?? ''}
      />
    </div>
  )
}
