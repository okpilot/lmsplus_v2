import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Spinner + label for a busy control. The label always sits in its own <span>, so a browser
 * translator replacing the text cannot leave React inserting the spinner beside a detached node.
 * The span is `display: contents`, so icon + text children still lay out as items of the parent.
 */
export function BusyLabel({ busy, children }: Readonly<{ busy: boolean; children: ReactNode }>) {
  return (
    <>
      {busy && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      <span className="contents">{children}</span>
    </>
  )
}
