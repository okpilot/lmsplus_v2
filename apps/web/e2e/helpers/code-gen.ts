import { randomUUID } from 'node:crypto'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

/** A random 8-character internal-exam code over the product alphabet (no 0, 1, I, O). */
export function randomCode(): string {
  const bytes = randomUUID().replaceAll('-', '')
  return Array.from({ length: CODE_LENGTH }, (_, i) => {
    const n = Number.parseInt(bytes.slice(i * 2, i * 2 + 2), 16)
    return CODE_ALPHABET[n % CODE_ALPHABET.length]
  }).join('')
}
