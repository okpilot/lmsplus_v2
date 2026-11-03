import type * as React from 'react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Heading } from '@/components/ui/heading'

type AuthShellProps = Readonly<{
  subtitle?: string
  children: React.ReactNode
}>

export function AuthShell({ subtitle, children }: Readonly<AuthShellProps>) {
  return (
    <main className="flex min-h-screen items-center justify-center px-gutter py-section">
      <Card className="w-full max-w-auth">
        <CardHeader className="justify-items-center gap-2 text-center">
          <Heading level={1} className="tracking-logo" aria-label="LMS Plus">
            lms<span className="text-muted-foreground">plus</span>
          </Heading>
          {subtitle ? <p className="text-body text-muted-foreground">{subtitle}</p> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  )
}
