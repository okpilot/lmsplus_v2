import { randomInt } from 'node:crypto'

const PASSWORD_LENGTH = 14

// Excludes visually similar characters: 0, O, 1, l, I.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * Generates a random temporary password server-side, via `node:crypto`'s
 * `randomInt` (CSPRNG, unbiased — no modulo bias). Never logged, never
 * persisted in plaintext beyond the single Auth write that consumes it.
 */
export function generateTempPassword(): string {
  let password = ''
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return password
}
