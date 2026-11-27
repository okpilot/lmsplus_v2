import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordEmailedCodes } from './record-emailed-codes'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`)

describe('recordEmailedCodes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('records every id and returns 0 when all succeed', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    expect(await recordEmailedCodes(rpc, ids(120))).toBe(0)
    expect(rpc).toHaveBeenCalledTimes(120)
    expect(rpc).toHaveBeenCalledWith('record_internal_exam_code_emailed', { p_code_id: 'id-119' })
  })

  it('runs at most 50 calls concurrently', async () => {
    let inFlight = 0
    let peak = 0
    const rpc = vi.fn().mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight--
      return { error: null }
    })
    await recordEmailedCodes(rpc, ids(120))
    expect(peak).toBe(50)
  })

  it('counts returned errors and rejections as failed', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'boom' } })
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce({ error: null })
    expect(await recordEmailedCodes(rpc, ids(3))).toBe(2)
  })

  it('returns 0 without calling rpc for no ids', async () => {
    const rpc = vi.fn()
    expect(await recordEmailedCodes(rpc, [])).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })
})
