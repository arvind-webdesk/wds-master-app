import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

// AES-256-GCM symmetric encryption for connection credentials.
// Ciphertext format: base64( iv(12) | authTag(16) | ciphertext )
//
// Key source: process.env.CONNECTION_ENCRYPTION_KEY — either a 32-byte base64
// string, or any passphrase which we SHA-256 down to 32 bytes (dev fallback).

const ALGO    = 'aes-256-gcm'
const IV_LEN  = 12
const TAG_LEN = 16

function getKey(): Buffer {
  const raw = process.env.CONNECTION_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'CONNECTION_ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }
  // If it decodes cleanly to 32 bytes, use it directly; otherwise hash down.
  try {
    const buf = Buffer.from(raw, 'base64')
    if (buf.length === 32) return buf
  } catch {
    // fall through
  }
  return createHash('sha256').update(raw, 'utf8').digest()
}

export function encryptJson(payload: unknown): string {
  const key    = getKey()
  const iv     = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const plain  = Buffer.from(JSON.stringify(payload), 'utf8')
  const enc    = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag    = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptJson<T = unknown>(ciphertext: string): T {
  const key      = getKey()
  const buf      = Buffer.from(ciphertext, 'base64')
  const iv       = buf.subarray(0, IV_LEN)
  const tag      = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc      = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plain    = Buffer.concat([decipher.update(enc), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as T
}
