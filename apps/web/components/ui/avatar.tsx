'use client'

import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill bg-muted text-chip font-semibold text-muted-foreground select-none',
  {
    variants: { medium: { true: 'size-avatar-md', false: 'size-avatar' } },
    defaultVariants: { medium: false },
  },
)

function Avatar({
  className,
  size,
  ...props
}: Readonly<AvatarPrimitive.Root.Props & { size?: 'sm' | 'md' }>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(avatarVariants({ medium: size === 'md' }), className)}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: Readonly<AvatarPrimitive.Image.Props>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('size-full object-cover', className)}
      {...props}
    />
  )
}

function AvatarFallback({ className, ...props }: Readonly<AvatarPrimitive.Fallback.Props>) {
  return <AvatarPrimitive.Fallback data-slot="avatar-fallback" className={className} {...props} />
}

export { Avatar, AvatarFallback, AvatarImage }
