import { describe, expect, it } from 'vitest'
import { buttonVariants } from './button-variants'

describe('buttonVariants', () => {
  it('applies the primary background by default', () => {
    expect(buttonVariants()).toContain('bg-primary')
  })

  it('applies the border token for the outline variant', () => {
    expect(buttonVariants({ variant: 'outline' })).toContain('border-border')
  })
})
