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

const ICONS: ToasterProps['icons'] = {
  success: <CircleCheckIcon className="size-4" />,
  info: <InfoIcon className="size-4" />,
  warning: <TriangleAlertIcon className="size-4" />,
  error: <OctagonXIcon className="size-4" />,
  loading: <Loader2Icon className="size-4 animate-spin" />,
}

const TOAST_CLASS_NAMES = {
  toast: 'w-fit! max-w-[min(var(--width),calc(100vw-2rem))]! gap-2!',
  success: 'border-success-solid! [&_[data-icon]]:text-success',
  error: 'border-danger-solid! [&_[data-icon]]:text-danger',
  warning: 'border-caution-solid! [&_[data-icon]]:text-caution',
  info: 'border-info-solid! [&_[data-icon]]:text-info',
}

const Toaster = ({ ...props }: Readonly<ToasterProps>) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group z-toast!"
      expand
      offset="1rem"
      mobileOffset="1rem"
      icons={ICONS}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{ classNames: TOAST_CLASS_NAMES }}
      {...props}
    />
  )
}

export { Toaster }
