import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordAuthEvent } from './record-auth-event'

type RpcMock = ReturnType<typeof vi.fn>

function makeClient(rpc: RpcMock) {
  return { rpc } as unknown as Parameters<typeof recordAuthEvent>[0]
}

describe('recordAuthEvent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('calls the record_auth_event RPC with only event type and resource id when no metadata is given', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    await recordAuthEvent(makeClient(mockRpc), {
      eventType: 'user.password_changed',
      resourceId: 'user-123',
      context: 'changePassword',
    })
    expect(mockRpc).toHaveBeenCalledWith('record_auth_event', {
      p_event_type: 'user.password_changed',
      p_resource_id: 'user-123',
    })
  })

  it('includes metadata in the RPC args when metadata is provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    await recordAuthEvent(makeClient(mockRpc), {
      eventType: 'user.created',
      resourceId: 'user-456',
      context: 'createStudent',
      metadata: { invited_by: 'admin-1' },
    })
    expect(mockRpc).toHaveBeenCalledWith('record_auth_event', {
      p_event_type: 'user.created',
      p_resource_id: 'user-456',
      p_metadata: { invited_by: 'admin-1' },
    })
  })

  it('resolves without throwing and logs the context-prefixed message when the RPC returns an error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: { message: 'permission denied' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      recordAuthEvent(makeClient(mockRpc), {
        eventType: 'user.deactivated',
        resourceId: 'user-789',
        context: 'toggleStudentStatus',
      }),
    ).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith(
      '[toggleStudentStatus] Audit event failed:',
      'permission denied',
    )
    errorSpy.mockRestore()
  })

  it('does not log when the RPC succeeds', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await recordAuthEvent(makeClient(mockRpc), {
      eventType: 'user.password_reset',
      resourceId: 'user-321',
      context: 'resetPassword',
    })
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
