'use client'

import { Loader2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { Button } from './button'

type LoadingButtonProps = ComponentProps<typeof Button> & {
  /** When true, the button shows a spinner and is disabled. */
  loading?: boolean
  /** Optional label shown while loading (e.g. "Saving..."). Falls back to children. */
  loadingText?: ReactNode
}

/**
 * Button with a built-in loading state: shows a spinner and disables itself
 * while an async action is in flight. The spinner is aria-hidden so the
 * accessible name stays equal to `loadingText ?? children`.
 */
function LoadingButton({
  loading = false,
  loadingText,
  disabled,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button disabled={loading || disabled} {...props}>
      {loading && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      {loading ? (loadingText ?? children) : children}
    </Button>
  )
}

export { LoadingButton }
