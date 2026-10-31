'use client'

import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { cn } from '@/lib/utils'

function RadioGroup({ className, ...props }: Readonly<RadioGroupPrimitive.Props>) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn(className)} {...props} />
}

function Radio({ className, ...props }: Readonly<RadioPrimitive.Root.Props>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio"
      className={cn(
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-pill border border-input bg-card transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-disabled:cursor-not-allowed data-disabled:opacity-disabled aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-muted/30 data-checked:border-primary data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-indicator"
        className="block size-2 rounded-pill bg-primary-foreground"
      />
    </RadioPrimitive.Root>
  )
}

export { Radio, RadioGroup }
