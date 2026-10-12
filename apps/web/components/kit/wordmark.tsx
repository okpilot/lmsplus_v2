import Link from 'next/link'
import { cn } from '@/lib/utils'

export function WordmarkText({ className }: Readonly<{ className?: string }>) {
  return (
    <span className={cn('text-[18px] font-semibold leading-none tracking-[-0.055em]', className)}>
      lms<span className="opacity-45">plus</span>
    </span>
  )
}

export function Wordmark() {
  return (
    <Link href="/app/dashboard" aria-label="lmsplus home">
      <WordmarkText />
    </Link>
  )
}
