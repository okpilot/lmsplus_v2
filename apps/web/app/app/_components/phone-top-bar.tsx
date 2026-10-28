import { SignOutButton } from './sign-out-button'
import { ThemeToggle } from './theme-toggle'
import { Wordmark } from './wordmark'

export function PhoneTopBar() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 md:hidden">
      <Wordmark />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </div>
  )
}
