'use client'

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { cn } from '@/lib/utils'

const ICONS: ToasterProps['icons'] = {
  success: <CircleCheckIcon className="size-4" />,
  info: <InfoIcon className="size-4" />,
  warning: <TriangleAlertIcon className="size-4" />,
  error: <OctagonXIcon className="size-4" />,
  loading: <Loader2Icon className="size-4 animate-spin" />,
}

// -0.5rem cancels the +0.5rem gap when no reload banner has published --reload-banner-h.
const OFFSET = {
  top: '1rem',
  right: '1rem',
  left: '1rem',
  bottom: 'calc(1rem + var(--reload-banner-h, -0.5rem) + 0.5rem)',
}

const TOAST_CLASS_NAMES = {
  toast: 'w-fit! max-w-[min(var(--width),calc(100vw-2rem))]! gap-2!',
  success: 'border-success-solid! [&_[data-icon]]:text-success',
  error: 'border-danger-solid! [&_[data-icon]]:text-danger',
  warning: 'border-caution-solid! [&_[data-icon]]:text-caution',
  info: 'border-info-solid! [&_[data-icon]]:text-info',
}

type ToastClassNames = NonNullable<NonNullable<ToasterProps['toastOptions']>['classNames']>

function mergeClassNames(caller: ToastClassNames = {}): ToastClassNames {
  const keys = new Set([...Object.keys(TOAST_CLASS_NAMES), ...Object.keys(caller)])
  const merged: ToastClassNames = {}
  for (const key of keys as Set<keyof ToastClassNames>) {
    const base = (TOAST_CLASS_NAMES as ToastClassNames)[key]
    merged[key] = cn(base, caller[key])
  }
  return merged
}

const VARS = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': 'var(--radius)',
} as React.CSSProperties

const Toaster = ({ className, style, toastOptions, ...props }: Readonly<ToasterProps>) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      expand
      offset={OFFSET}
      mobileOffset={OFFSET}
      icons={ICONS}
      {...props}
      className={cn('toaster group z-toast!', className)}
      style={{ ...VARS, ...style }}
      toastOptions={{
        ...toastOptions,
        classNames: mergeClassNames(toastOptions?.classNames),
      }}
    />
  )
}

export { Toaster }
