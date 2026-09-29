/** The minimal crypto the login flow needs. */
export type CryptoAdapter = {
  randomBytes(n: number): Uint8Array;
  sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array>;
};

/**
 * WebCrypto (Node 20+, browsers). React Native doesn't ship it: pass an
 * adapter there instead, e.g. backed by expo-crypto (see README).
 */
export function webCrypto(): CryptoAdapter {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues || !c.subtle) {
    throw new Error('WebCrypto is not available in this environment: pass the `crypto` option.');
  }
  return {
    randomBytes: (n) => c.getRandomValues(new Uint8Array(n)),
    sha256: async (data) => new Uint8Array(await c.subtle.digest('SHA-256', data)),
  };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Unpadded base64url (RFC 4648 §5), without relying on btoa/Buffer. */
export function base64url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

function asciiBytes(s: string): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

export async function challengeFor(verifier: string, crypto: CryptoAdapter): Promise<string> {
  return base64url(await crypto.sha256(asciiBytes(verifier)));
}

/** PKCE S256 (verifier, challenge) pair, same as _pkce_pair() in cookidoo-api. */
export async function pkcePair(crypto: CryptoAdapter): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.randomBytes(48));
  return { verifier, challenge: await challengeFor(verifier, crypto) };
}

export function randomState(crypto: CryptoAdapter): string {
  return base64url(crypto.randomBytes(12));
}
