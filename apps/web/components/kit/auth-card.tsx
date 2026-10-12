import type { ReactNode } from 'react'
import { WordmarkText } from './wordmark'

/** Brand heading and card surface shared by the sign-in and password pages. */
export function AuthCard({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="w-full max-w-[400px] rounded-xl border border-border bg-card p-6 md:p-8">
      <h1 aria-label="LMS Plus" className="mb-8 text-center leading-none">
        <WordmarkText className="text-[28px]" />
      </h1>
      {children}
    </div>
  )
}
