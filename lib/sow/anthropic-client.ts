import Anthropic from '@anthropic-ai/sdk'

/**
 * Lazy-initialized Anthropic SDK client. Reads ANTHROPIC_API_KEY from
 * process.env at call time — never at module load — so missing-env errors
 * surface where the call is made (the server action), not at import time.
 *
 * NEVER expose this client (or its key) to the browser. All callers must
 * be inside a 'use server' module or an API route.
 */

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.length < 10) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env.local before using the SOW pipeline.',
    )
  }
  _client = new Anthropic({ apiKey })
  return _client
}

/** Default model for SOW extraction + scaffolding. */
export const SOW_MODEL = 'claude-opus-4-7'
