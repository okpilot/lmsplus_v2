let cached: string | null = null

/** @internal Test-only reset for the module-level cache. */
export function _resetQuizDeviceId() {
  cached = null
}

/** v4-shaped uuid from crypto.getRandomValues, which works without a secure context. */
function fallbackUuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function generateUuid(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : fallbackUuid()
}

/**
 * Device id for quiz progress saves: one per page load, held in module memory only. It is never
 * persisted — a duplicated tab copies sessionStorage, which would make two tabs share one id and
 * hide takeover. A reload gets a new id and claims the session on load.
 */
export function getQuizDeviceId(): string {
  cached ??= generateUuid()
  return cached
}
