'use client'

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function Checkbox({ className, ...props }: Readonly<CheckboxPrimitive.Root.Props>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-inner border border-input bg-field-fill transition-colors outline-none group-has-disabled/field:opacity-disabled after:absolute after:-inset-x-tap-x after:-inset-y-tap-y focus-visible:border-ring focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-ring focus-visible:outline-offset-focus disabled:cursor-not-allowed disabled:opacity-disabled aria-invalid:border-invalid-border aria-invalid:ring-focus aria-invalid:ring-invalid-ring aria-invalid:aria-checked:border-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-icon-sm"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
