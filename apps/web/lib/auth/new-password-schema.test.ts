import { describe, expect, it } from 'vitest'
import { NewPasswordSchema } from './new-password-schema'

describe('NewPasswordSchema', () => {
  it('accepts a valid matching password pair', () => {
    const result = NewPasswordSchema.safeParse({
      password: 'newpass123',
      confirmPassword: 'newpass123',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a password shorter than 6 characters', () => {
    const result = NewPasswordSchema.safeParse({
      password: '12345',
      confirmPassword: '12345',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.message).toBe('Password must be at least 6 characters')
  })

  it('rejects a mismatched confirmation on the confirmPassword path', () => {
    const result = NewPasswordSchema.safeParse({
      password: 'newpass123',
      confirmPassword: 'different123',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.message).toBe('Passwords do not match')
    expect(result.error.issues[0]?.path).toEqual(['confirmPassword'])
  })
})
