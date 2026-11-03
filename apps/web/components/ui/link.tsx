import { cva, type VariantProps } from 'class-variance-authority'
import NextLink from 'next/link'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const linkVariants = cva(
  'underline underline-offset-4 outline-none focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-ring focus-visible:outline-offset-focus',
  {
    variants: {
      tone: {
        inherit: 'hover:text-primary-text',
        muted: 'text-muted-foreground hover:text-primary-text',
        primary: 'text-primary-text',
      },
    },
    defaultVariants: { tone: 'inherit' },
  },
)

function Link({
  className,
  tone,
  ...props
}: Readonly<React.ComponentProps<typeof NextLink> & VariantProps<typeof linkVariants>>) {
  return <NextLink data-slot="link" className={cn(linkVariants({ tone }), className)} {...props} />
}

export { Link }
