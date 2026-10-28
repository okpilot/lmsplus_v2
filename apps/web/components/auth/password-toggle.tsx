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
      className="absolute inset-y-0 right-1.5 my-auto text-muted-foreground"
    >
      <Icon aria-hidden="true" />
    </Button>
  )
}
