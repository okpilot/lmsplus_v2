'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { SubjectOption } from '@/lib/queries/quiz'

type SubjectSelectProps = {
  subjects: SubjectOption[]
  value: string
  onValueChange: (value: string) => void
}

export function SubjectSelect({ subjects, value, onValueChange }: SubjectSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = subjects.find((s) => s.id === value)

  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-medium">Subject</span>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className={`flex w-full items-center justify-between rounded-[10px] border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 ${
            open ? 'rounded-b-none border-b-transparent' : ''
          }`}
        >
          {selected ? (
            <span className="flex items-center gap-2.5">
              <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                {selected.code}
              </span>
              <span className="text-foreground">{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select a subject</span>
          )}
          <span className="text-muted-foreground">
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden transition-[height] duration-150 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0">
          <div className="divide-y divide-border rounded-b-[10px] border border-t-0 border-border">
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onValueChange(s.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 ${
                  s.id === value ? 'border-l-primary bg-primary/5' : 'border-l-transparent'
                }`}
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs ${
                    s.id === value
                      ? 'bg-primary/15 font-semibold text-primary'
                      : 'bg-muted font-medium text-muted-foreground'
                  }`}
                >
                  {s.code}
                </span>
                <span
                  className={`flex-1 text-left ${
                    s.id === value ? 'font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
