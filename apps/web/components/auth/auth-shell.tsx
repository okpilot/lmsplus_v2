import type * as React from 'react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'

type AuthShellProps = Readonly<{
  subtitle?: string
  children: React.ReactNode
}>

export function AuthShell({ subtitle, children }: Readonly<AuthShellProps>) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-auth">
        <CardHeader className="justify-items-center gap-2 text-center">
          <div
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-control bg-primary"
          >
            <span className="text-heading text-primary-foreground">L</span>
          </div>
          <h1 className="text-title">LMS Plus</h1>
          {subtitle ? <p className="text-body text-muted-foreground">{subtitle}</p> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  )
}
