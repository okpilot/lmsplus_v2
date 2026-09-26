import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const mockRandomInt = vi.hoisted(() => vi.fn())

vi.mock('node:crypto', () => ({
  randomInt: mockRandomInt,
  default: { randomInt: mockRandomInt },
}))

// ---- Subject under test ------------------------------------------------------

import { generateTempPassword } from './generate-temp-password'

// ---- Tests --------------------------------------------------------------------

beforeEach(() => {
  mockRandomInt.mockClear()
})

describe('generateTempPassword', () => {
  it('returns a 14-character password', () => {
    mockRandomInt.mockReturnValue(0)

    expect(generateTempPassword()).toHaveLength(14)
  })

  it('draws every character from the CSPRNG via an unbiased randomInt(0, alphabetLength) call', () => {
    mockRandomInt.mockReturnValue(0)

    generateTempPassword()

    expect(mockRandomInt).toHaveBeenCalledTimes(14)
    for (const call of mockRandomInt.mock.calls) {
      expect(call[0]).toBe(0)
      expect(call[1]).toBeGreaterThan(0)
    }
  })

  it('produces different passwords across draws when randomInt varies', async () => {
    let call = 0
    mockRandomInt.mockImplementation(() => {
      call += 1
      return call % 10
    })

    const first = generateTempPassword()
    const second = generateTempPassword()

    expect(first).not.toBe(second)
  })
})

describe('generateTempPassword (real CSPRNG)', () => {
  it('never contains a visually similar character across many draws', async () => {
    vi.doUnmock('node:crypto')
    vi.resetModules()
    const { generateTempPassword: realGenerate } = await import('./generate-temp-password')

    for (let i = 0; i < 100; i++) {
      const password = realGenerate()
      expect(password).toHaveLength(14)
      expect(password).not.toMatch(/[0O1lI]/)
    }
  })
})
