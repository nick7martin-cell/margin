import { env, isLocalDevMode, isSupabaseConfigured } from '@/lib/env'
import { logger } from '@/lib/logger'

/** Ping Supabase every 12 hours to prevent free-tier project pause. */
export const KEEP_ALIVE_INTERVAL_MS = 12 * 60 * 60 * 1000

export class KeepAliveService {
  private timerId: ReturnType<typeof setInterval> | null = null

  /** Starts the keep-alive schedule. No-op if already running or Supabase is unavailable. */
  start(): void {
    if (this.timerId !== null) return
    if (isLocalDevMode() || !isSupabaseConfigured()) return

    void this.ping()

    this.timerId = setInterval(() => {
      void this.ping()
    }, KEEP_ALIVE_INTERVAL_MS)
  }

  /** Clears the keep-alive schedule. Safe to call when not running. */
  stop(): void {
    if (this.timerId === null) return
    clearInterval(this.timerId)
    this.timerId = null
  }

  /** Returns true when a keep-alive timer is active. */
  isRunning(): boolean {
    return this.timerId !== null
  }

  private async ping(): Promise<void> {
    try {
      const url = `${env.supabaseUrl.replace(/\/$/, '')}/auth/v1/health`
      const response = await fetch(url, {
        headers: {
          apikey: env.supabaseAnonKey,
        },
      })

      if (!response.ok) {
        logger.keepAliveFailed(new Error(`Keep-alive ping failed: HTTP ${response.status}`))
      }
    } catch (error) {
      logger.keepAliveFailed(error)
    }
  }
}

export const keepAliveService = new KeepAliveService()
