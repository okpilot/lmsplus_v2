'use client'

import { Button as ButtonPrimitive } from '@base-ui/react/button'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { bareButtonVariants, buttonVariants } from './button-variants'

type StyledProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>
type BareProps = ButtonPrimitive.Props & { variant: 'bare'; size?: never }

function Button(props: Readonly<StyledProps | BareProps>) {
  if (props.variant === 'bare') {
    const { className, variant: _variant, size: _size, ...rest } = props
    return (
      <ButtonPrimitive
        data-slot="button"
        className={cn(bareButtonVariants({ className }))}
        {...rest}
      />
    )
  }
  const { className, variant = 'default', size = 'default', ...rest } = props
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...rest}
    />
  )
}

export { Button }
