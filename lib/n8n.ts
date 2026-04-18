/**
 * n8n webhook integration — port of middleware-logger.js + n8n-integration.js
 *
 * Emits structured events to the n8n webhook URL for audit logging,
 * workflow automation, and error tracking.
 *
 * Config via env vars (never hard-coded):
 *   N8N_WEBHOOK_URL        — destination URL
 *   N8N_WEBHOOK_ENABLED    — 'true' to enable (default: disabled)
 *   N8N_BLOCK_ON_FAILURE   — 'true' to throw on webhook error (default: swallow)
 */

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'authorization', 'cookie',
  'resetPasswordToken', 'reset_password_token', 'x-api-key',
])

/** Recursively scrub sensitive fields from a payload before logging. */
function scrubPayload(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map((item) => scrubPayload(item, depth + 1))

  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([key, value]) => {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) return [key, '[REDACTED]']
      return [key, scrubPayload(value, depth + 1)]
    }),
  )
}

export interface N8nEvent {
  event: string
  payload: Record<string, unknown>
  timestamp: string
  environment: string
  source?: string
}

/**
 * Emit a named event to the n8n webhook.
 *
 * @param eventName  Snake-case event name, e.g. 'USER_CREATED'
 * @param payload    Arbitrary data — sensitive fields are auto-scrubbed
 */
export async function emit(
  eventName: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (process.env.N8N_WEBHOOK_ENABLED !== 'true') return

  const webhookUrl = process.env.N8N_WEBHOOK_URL
  if (!webhookUrl) {
    console.warn('[n8n] N8N_WEBHOOK_URL is not set — skipping event:', eventName)
    return
  }

  const body: N8nEvent = {
    event:       eventName,
    payload:     scrubPayload(payload) as Record<string, unknown>,
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
  }

  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(5_000), // 5s timeout
    })

    if (!res.ok) {
      const err = new Error(`[n8n] Webhook returned ${res.status} for event: ${eventName}`)
      if (process.env.N8N_BLOCK_ON_FAILURE === 'true') throw err
      console.warn(err.message)
    }
  } catch (error) {
    if (process.env.N8N_BLOCK_ON_FAILURE === 'true') throw error
    console.warn('[n8n] Webhook emission failed for event:', eventName, (error as Error).message)
  }
}

/**
 * Log an incoming API request + response pair.
 * Call this from middleware after the response is sent.
 */
export async function logApiRequest(data: {
  method: string
  url: string
  ip?: string
  userAgent?: string
  responseStatus: number
  durationMs: number
  isError: boolean
  errorType?: string
  source?: string
}): Promise<void> {
  await emit('API_REQUEST', data)
}
