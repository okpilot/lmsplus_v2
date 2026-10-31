import Link from 'next/link'

export function Wordmark() {
  return (
    <Link href="/app/dashboard" aria-label="lmsplus home" className="text-heading tracking-logo">
      lms<span className="text-muted-foreground">plus</span>
    </Link>
  )
}
