/**
 * HMAC-SHA256 helpers for runpod-callback webhook authentication.
 *
 * The shared secret never appears in the URL. Instead, a per-job
 * derived signature is computed: HMAC-SHA256(secret, job_id).
 * This prevents secret leakage in server/CDN logs (H-3).
 */

const enc = new TextEncoder()

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** Returns lowercase hex HMAC-SHA256(secret, data). */
export async function computeHmac(secret: string, data: string): Promise<string> {
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Constant-time comparison via the browser crypto verify call.
 * Returns false for empty or mismatched signatures.
 */
export async function verifyHmac(secret: string, data: string, candidate: string): Promise<boolean> {
  if (!candidate) return false
  try {
    const key = await importKey(secret)
    // Convert hex candidate back to bytes
    const bytes = new Uint8Array(candidate.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? [])
    if (bytes.length !== 32) return false
    return crypto.subtle.verify('HMAC', key, bytes, enc.encode(data))
  } catch {
    return false
  }
}
