import { cn } from '@/lib/utils'

export function Shimmer({ className }: Readonly<{ className?: string }>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-xl bg-foreground/[0.04] opacity-0 [animation:look-appear_200ms_ease-out_400ms_forwards] motion-reduce:opacity-100 motion-reduce:[animation:none]',
        className,
      )}
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent [animation:look-shimmer_2.8s_ease-in-out_infinite] motion-reduce:hidden" />
    </div>
  )
}
