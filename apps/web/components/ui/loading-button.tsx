'use client'

import { Loader2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { Button } from './button'

type LoadingButtonProps = ComponentProps<typeof Button> & {
  /** When true, the button shows a spinner and is disabled. */
  loading?: boolean
  /**
   * Optional label shown while loading (e.g. "Saving..."). Falls back to children.
   * For icon-only buttons (size="icon" / "icon-sm" / "icon-xs" / "icon-lg"),
   * supply either this prop or an `aria-label` on the button — otherwise the
   * button has no accessible name while the spinner is visible.
   */
  loadingText?: ReactNode
}

/**
 * Button with a built-in loading state: shows a spinner and disables itself
 * while an async action is in flight. The spinner is aria-hidden so the
 * accessible name stays equal to `loadingText ?? children`.
 *
 * @remarks The `render` prop (from Base UI) is forwarded unchanged; non-button
 * elements (e.g. an `<a>`) do not honour the `disabled` attribute, so the
 * loading guard is a no-op in that case.
 */
function LoadingButton({
  loading = false,
  loadingText,
  disabled,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button {...props} disabled={loading || disabled} aria-busy={loading || undefined}>
      {loading && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      {loading ? (loadingText ?? children) : children}
    </Button>
  )
}

export { LoadingButton }
