'use client'

import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'

type PasswordToggleProps = Readonly<{
  shown: boolean
  onToggle: () => void
  label?: string
}>

export function PasswordToggle({
  shown,
  onToggle,
  label = 'password',
}: Readonly<PasswordToggleProps>) {
  const Icon = shown ? EyeOff : Eye
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      aria-label={`${shown ? 'Hide' : 'Show'} ${label}`}
      aria-pressed={shown}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
    >
      <Icon aria-hidden="true" />
    </Button>
  )
}
