import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-control bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
