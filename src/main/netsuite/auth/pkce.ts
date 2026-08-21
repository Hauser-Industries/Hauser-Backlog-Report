import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const PKCE_VERIFIER_BYTES = 64
const OAUTH_STATE_BYTES = 32

function toBase64Url(value: Buffer): string {
  return value.toString('base64url')
}

export interface PkceValues {
  codeVerifier: string
  codeChallenge: string
  state: string
}

export function createPkceValues(): PkceValues {
  const codeVerifier = toBase64Url(randomBytes(PKCE_VERIFIER_BYTES))
  return {
    codeVerifier,
    codeChallenge: toBase64Url(createHash('sha256').update(codeVerifier, 'ascii').digest()),
    state: toBase64Url(randomBytes(OAUTH_STATE_BYTES))
  }
}

export function oauthStateMatches(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  )
}
