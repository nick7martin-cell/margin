import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KEEP_ALIVE_INTERVAL_MS,
  KeepAliveService,
} from '@/services/database/keepAliveService'

const { getSupabaseClientMock, isLocalDevModeMock, isSupabaseConfiguredMock } = vi.hoisted(
  () => ({
    getSupabaseClientMock: vi.fn(),
    isLocalDevModeMock: vi.fn(() => false),
    isSupabaseConfiguredMock: vi.fn(() => true),
  }),
)

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: getSupabaseClientMock,
}))

vi.mock('@/lib/env', () => ({
  isLocalDevMode: isLocalDevModeMock,
  isSupabaseConfigured: isSupabaseConfiguredMock,
}))

const keepAliveFailedMock = vi.fn()

vi.mock('@/lib/logger', () => ({
  logger: {
    keepAliveFailed: (...args: unknown[]) => keepAliveFailedMock(...args),
  },
}))

describe('KeepAliveService', () => {
  let service: KeepAliveService
  let selectMock: ReturnType<typeof vi.fn>
  let limitMock: ReturnType<typeof vi.fn>
  let fromMock: ReturnType<typeof vi.fn>
  let getSessionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    service = new KeepAliveService()
    selectMock = vi.fn()
    limitMock = vi.fn()
    fromMock = vi.fn(() => ({ select: selectMock }))
    selectMock.mockReturnValue({ limit: limitMock })
    limitMock.mockResolvedValue({ error: null })
    getSessionMock = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    getSupabaseClientMock.mockReturnValue({
      auth: { getSession: getSessionMock },
      from: fromMock,
    })
    isLocalDevModeMock.mockReturnValue(false)
    isSupabaseConfiguredMock.mockReturnValue(true)
  })

  afterEach(() => {
    service.stop()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('queries accounts on start and every 12 hours when signed in', async () => {
    service.start()

    await Promise.resolve()
    expect(getSessionMock).toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalledWith('accounts')
    expect(selectMock).toHaveBeenCalledWith('id')
    expect(limitMock).toHaveBeenCalledWith(1)
    expect(fromMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_INTERVAL_MS)
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it('skips the ping when there is no active session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })

    service.start()
    await Promise.resolve()

    expect(fromMock).not.toHaveBeenCalled()
  })

  it('creates only one timer when start is called repeatedly', async () => {
    service.start()
    service.start()
    service.start()

    await Promise.resolve()
    expect(fromMock).toHaveBeenCalledTimes(1)
    expect(service.isRunning()).toBe(true)
  })

  it('does not start when Supabase is not configured', () => {
    isSupabaseConfiguredMock.mockReturnValue(false)

    service.start()

    expect(service.isRunning()).toBe(false)
    expect(getSupabaseClientMock).not.toHaveBeenCalled()
  })

  it('logs errors without throwing when the ping fails', async () => {
    limitMock.mockResolvedValue({ error: { message: 'network down', code: 'PGRST001' } })

    service.start()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(keepAliveFailedMock).toHaveBeenCalledTimes(1)
    expect(service.isRunning()).toBe(true)
  })

  it('logs errors without throwing when the client throws', async () => {
    getSupabaseClientMock.mockImplementation(() => {
      throw new Error('offline')
    })

    service.start()
    await Promise.resolve()

    expect(keepAliveFailedMock).toHaveBeenCalledTimes(1)
    expect(service.isRunning()).toBe(true)
  })

  it('stop clears the timer', async () => {
    service.start()
    await Promise.resolve()

    service.stop()
    expect(service.isRunning()).toBe(false)

    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_INTERVAL_MS)
    expect(fromMock).toHaveBeenCalledTimes(1)
  })
})
