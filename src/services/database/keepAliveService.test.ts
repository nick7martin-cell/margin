import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KEEP_ALIVE_INTERVAL_MS,
  KeepAliveService,
} from '@/services/database/keepAliveService'

const { isLocalDevModeMock, isSupabaseConfiguredMock } = vi.hoisted(() => ({
  isLocalDevModeMock: vi.fn(() => false),
  isSupabaseConfiguredMock: vi.fn(() => true),
}))

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
  },
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
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    service = new KeepAliveService()
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    isLocalDevModeMock.mockReturnValue(false)
    isSupabaseConfiguredMock.mockReturnValue(true)
  })

  afterEach(() => {
    service.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('pings auth health on start and every 12 hours', async () => {
    service.start()

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/health', {
      headers: { apikey: 'anon-key' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_INTERVAL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('creates only one timer when start is called repeatedly', async () => {
    service.start()
    service.start()
    service.start()

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(service.isRunning()).toBe(true)
  })

  it('does not start when Supabase is not configured', () => {
    isSupabaseConfiguredMock.mockReturnValue(false)

    service.start()

    expect(service.isRunning()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('logs errors without throwing when the ping fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })

    service.start()
    await Promise.resolve()

    expect(keepAliveFailedMock).toHaveBeenCalledTimes(1)
    expect(service.isRunning()).toBe(true)
  })

  it('logs errors without throwing when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))

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
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
