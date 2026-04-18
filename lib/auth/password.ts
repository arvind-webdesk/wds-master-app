import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

/** Hash a plain-text password. Always call this before storing. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

/** Compare a plain-text password against a stored bcrypt hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
