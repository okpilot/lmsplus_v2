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
          <div
            aria-hidden="true"
            className="flex size-icon-box items-center justify-center rounded-control bg-primary"
          >
            <span className="text-heading text-primary-foreground">L</span>
          </div>
          <Heading level={1}>LMS Plus</Heading>
          {subtitle ? <p className="text-body text-muted-foreground">{subtitle}</p> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  )
}
