import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { base64url, challengeFor, pkcePair, webCrypto } from '../src/pkce.ts';

test('base64url matches Buffer', () => {
  for (let n = 0; n < 50; n++) {
    const b = randomBytes(n);
    assert.equal(base64url(new Uint8Array(b)), b.toString('base64url'));
  }
});

test('challenge S256', async () => {
  for (let k = 0; k < 20; k++) {
    const v = randomBytes(48).toString('base64url');
    assert.equal(await challengeFor(v, webCrypto()), createHash('sha256').update(v).digest('base64url'));
  }
  assert.equal((await pkcePair(webCrypto())).verifier.length, 64);
});
