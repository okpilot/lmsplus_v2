import { randomBytes } from 'node:crypto'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

/**
 * A random 8-character internal-exam code over the product alphabet (no 0, 1, I, O).
 *
 * 256 is a multiple of 32, so reducing a byte adds no bias.
 */
export function randomCode(): string {
  return Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(
    '',
  )
}
