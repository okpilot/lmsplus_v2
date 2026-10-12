import Link from 'next/link'

export function Wordmark() {
  return (
    <Link
      href="/app/dashboard"
      aria-label="lmsplus home"
      className="text-[18px] font-semibold leading-none tracking-[-0.055em]"
    >
      lms<span className="opacity-45">plus</span>
    </Link>
  )
}
