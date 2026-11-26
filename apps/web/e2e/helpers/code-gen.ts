import { randomBytes } from 'node:crypto'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

/**
 * A random 8-character internal-exam code over the product alphabet (no 0, 1, I, O).
 *
 * `randomBytes`, not `randomUUID`: a stripped UUID's hex digit 12 is the fixed version nibble `4`,
 * which pinned code index 6 to `0x4_ % 32`, half the alphabet. 256 is a multiple of 32, so
 * reducing a byte adds no bias.
 */
export function randomCode(): string {
  return Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(
    '',
  )
}
