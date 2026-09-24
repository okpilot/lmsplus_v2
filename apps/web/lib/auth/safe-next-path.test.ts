import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-next-path'

describe('safeNextPath', () => {
  it('accepts a plain /app path', () => {
    expect(safeNextPath('/app/internal-exam')).toBe('/app/internal-exam')
  })

  it('accepts an /app path with a query string', () => {
    expect(safeNextPath('/app/quiz?x=1')).toBe('/app/quiz?x=1')
  })

  it('drops a hash fragment from the returned path', () => {
    expect(safeNextPath('/app/quiz#section-2')).toBe('/app/quiz')
  })

  it('rejects null', () => {
    expect(safeNextPath(null)).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(safeNextPath('')).toBeNull()
  })

  it('rejects the bare root path', () => {
    expect(safeNextPath('/')).toBeNull()
  })

  it('rejects a protocol-relative URL', () => {
    expect(safeNextPath('//evil.com')).toBeNull()
  })

  it('rejects a backslash-prefixed host (browsers treat \\ as /)', () => {
    expect(safeNextPath('/\\evil.com')).toBeNull()
  })

  it('rejects an absolute URL to a different origin', () => {
    expect(safeNextPath('https://evil.com/app')).toBeNull()
  })

  it('rejects a path that traverses out of /app', () => {
    expect(safeNextPath('/app/../auth/reset-password')).toBeNull()
  })

  it('rejects a path that only starts with the /app prefix as a substring', () => {
    expect(safeNextPath('/appx')).toBeNull()
  })

  it('rejects a percent-encoded traversal that normalizes out of /app', () => {
    // The WHATWG URL parser decodes %2e%2e as a dot-segment during normalization,
    // so this resolves to /x — same rejection path as a literal '..' traversal.
    expect(safeNextPath('/app/%2e%2e/x')).toBeNull()
  })

  it('rejects a path containing a tab control character', () => {
    expect(safeNextPath('/app/foo\tbar')).toBeNull()
  })

  it('rejects a path containing a newline control character', () => {
    expect(safeNextPath('/app/foo\nbar')).toBeNull()
  })

  it('rejects a path over 512 characters', () => {
    expect(safeNextPath(`/app/${'a'.repeat(509)}`)).toBeNull()
  })

  it('returns null for the bare /app path', () => {
    expect(safeNextPath('/app')).toBeNull()
  })

  it('returns null for the bare /app/dashboard path', () => {
    expect(safeNextPath('/app/dashboard')).toBeNull()
  })
})
