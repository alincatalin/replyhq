import crypto from 'crypto';

/**
 * Generate a cryptographically secure API key
 * @returns Base64URL-encoded random 32-byte string
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash an API key using SHA-256 with a random salt
 * @param apiKey - The plain API key to hash
 * @returns Salted hash in format "salt:hash"
 */
export function hashApiKey(apiKey: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(salt + apiKey)
    .digest('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify an API key against its stored hash using timing-safe comparison
 * @param providedKey - The API key to verify
 * @param storedHash - The stored hash in format "salt:hash"
 * @returns True if the key matches the hash
 */
export function verifyApiKey(
  providedKey: string,
  storedHash: string
): boolean {
  try {
    if (!providedKey || !storedHash) {
      return false;
    }

    const parts = storedHash.split(':');
    if (parts.length !== 2) {
      return false;
    }

    const [salt, hash] = parts;
    const computedHash = crypto
      .createHash('sha256')
      .update(salt + providedKey)
      .digest('hex');

    const hashBuffer = Buffer.from(hash, 'hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');

    // CRITICAL: Check buffer lengths match before timing-safe comparison
    // This prevents timing-safe comparison from throwing on length mismatch
    if (hashBuffer.length !== computedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(hashBuffer, computedBuffer);
  } catch (error) {
    // Log error but don't expose details to caller
    console.error('API key verification error:', error);
    return false;
  }
}
