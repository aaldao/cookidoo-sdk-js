import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CookidooHttpError, memoryTokenStore } from '../src/auth.ts';
import { Cookidoo } from '../src/client.ts';
import { URUGUAY } from '../src/config.ts';
import { appendImageFile, MAX_IMAGE_BYTES, RecipeValidationError, type RecipeImage } from '../src/recipes.ts';
import { fakeFetch, path, type Call } from './fake-fetch.ts';
import { LIST_RESPONSE } from './fixtures/custom-recipes.ts';

const RECIPE = LIST_RESPONSE.items[0];
const ID = RECIPE.recipeId;
const CLOUDINARY = 'https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload';
const PUBLIC_ID = 'prod/img/customer-recipe/w4wyke7twqrhvlecv15q';
const DISPLAY = `https://ugc.assets.tmecosys.com/image/upload/{transformation}/${PUBLIC_ID}.jpg`;

/** The recipe as Cookidoo returns it once it has the uploaded photo. */
const WITH_PHOTO = {
  ...RECIPE,
  recipeContent: { ...RECIPE.recipeContent, image: DISPLAY, isImageCopyrightOwned: false },
};

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

const later = () => Date.now() / 1000 + 9999;
const isDiscovery = (c: Call) => c.url.endsWith('.well-known/home');

type Reply = { status: number; body?: unknown };

/** Cookidoo + Cloudinary as observed on a real account (2026-10-04). */
function happy(c: Call): Reply {
  if (c.url.endsWith('/image/signature')) return { status: 200, body: { signature: 'sig123' } };
  if (c.url === CLOUDINARY) return { status: 200, body: { public_id: PUBLIC_ID, format: 'jpg', secure_url: 'https://x' } };
  if (c.method === 'PATCH') return { status: 200, body: WITH_PHOTO };
  return { status: 200, body: WITH_PHOTO };
}

function client(respond: (c: Call) => Reply = happy, accessToken = 't') {
  const f = fakeFetch((c) => {
    if (c.url.includes('openid-configuration'))
      return { status: 200, body: { authorization_endpoint: 'https://ciam/auth', token_endpoint: 'https://ciam/token' } };
    if (c.url === 'https://ciam/token') return { status: 200, body: { access_token: 'new', refresh_token: 'r2' } };
    return isDiscovery(c) ? { status: 404 } : respond(c);
  });
  const c = new Cookidoo({
    localization: URUGUAY,
    fetch: f.fetch,
    tokenStore: memoryTokenStore({ accessToken, refreshToken: 'r', expiresAt: later() }),
  });
  const api = () =>
    f.calls.filter((x) => !isDiscovery(x) && !x.url.includes('openid-configuration') && x.url !== 'https://ciam/token');
  return { c, f, api };
}

const where = (x: Call) => [x.method, x.url === CLOUDINARY ? 'cloudinary' : path(x.url)];

test('upload: sign with Cookidoo, send the file to Cloudinary, then set it on the recipe', async () => {
  const { c, f, api } = client();
  const before = Math.floor(Date.now() / 1000);
  const r = await c.uploadCustomRecipeImage(ID, { data: JPEG, mimeType: 'image/jpeg' });

  assert.equal(r.id, ID);
  assert.equal(r.image, DISPLAY.replace('{transformation}', 't_web_rdp_recipe_584x480_1_5x'));
  const calls = api();
  assert.deepEqual(calls.map(where), [
    ['POST', 'created-recipes/es/image/signature'],
    ['POST', 'cloudinary'],
    // The PATCH answers with the full recipe, so there's no reload.
    ['PATCH', `created-recipes/es/${ID}`],
  ]);
  assert.equal(f.maxActive(), 1);

  const [sign, upload, patch] = calls;
  const signed = JSON.parse(sign.body ?? '') as { timestamp: number; source: string };
  assert.deepEqual(Object.keys(signed).sort(), ['source', 'timestamp']);
  assert.equal(signed.source, 'uw');
  assert.ok(Number.isInteger(signed.timestamp) && signed.timestamp >= before && signed.timestamp < 1e11, 'seconds');
  assert.equal(sign.auth, 'Bearer t');

  // Cloudinary never sees the Cookidoo token; fetch sets the multipart Content-Type itself.
  assert.equal(upload.auth, undefined);
  assert.equal(upload.contentType, undefined);
  const form = upload.form!;
  assert.deepEqual(
    [...form.keys()],
    ['api_key', 'timestamp', 'source', 'signature', 'upload_preset', 'file'],
  );
  assert.equal(form.get('api_key'), '993585863591145');
  assert.equal(form.get('timestamp'), String(signed.timestamp));
  assert.equal(form.get('signature'), 'sig123');
  assert.equal(form.get('source'), 'uw');
  assert.equal(form.get('upload_preset'), 'prod-customer-recipe-signed');
  const file = form.get('file') as File;
  assert.equal(file.name, 'recipe.jpg');
  assert.equal(file.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), JPEG);

  // Like the Cookidoo website: only the image fields, and not owned unless declared.
  assert.deepEqual(JSON.parse(patch.body ?? ''), { image: `${PUBLIC_ID}.jpg`, isImageOwnedByUser: false });
});

test('upload: PNG bytes as an ArrayBuffer, a file name, ownership declared, and a reload when the PATCH is empty', async () => {
  const { c, api } = client((x) => (x.method === 'PATCH' ? { status: 204 } : happy(x)));
  const r = await c.uploadCustomRecipeImage(
    ID,
    { data: PNG.buffer, mimeType: 'image/png', fileName: 'bread.png' },
    { ownedByUser: true },
  );
  assert.equal(r.id, ID);
  const calls = api();
  assert.deepEqual(calls.map(where), [
    ['POST', 'created-recipes/es/image/signature'],
    ['POST', 'cloudinary'],
    ['PATCH', `created-recipes/es/${ID}`],
    ['GET', `created-recipes/es/${ID}`],
  ]);
  const file = calls[1].form!.get('file') as File;
  assert.equal(file.name, 'bread.png');
  assert.equal(file.type, 'image/png');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), PNG);
  // Cloudinary decides the stored format (it may turn a PNG into a JPEG).
  assert.deepEqual(JSON.parse(calls[2].body ?? ''), { image: `${PUBLIC_ID}.jpg`, isImageOwnedByUser: true });
});

test('upload: a Blob is sent as it is', async () => {
  const { c, api } = client();
  await c.uploadCustomRecipeImage(ID, { data: new Blob([JPEG], { type: 'image/jpeg' }), mimeType: 'image/jpeg' });
  const file = api()[1].form!.get('file') as File;
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), JPEG);
});

test('React Native: a file uri goes into the form as { uri, name, type }', () => {
  const parts: unknown[][] = [];
  const form = { append: (...args: unknown[]) => parts.push(args) };
  appendImageFile(form, { uri: 'file:///data/photo.jpg', mimeType: 'image/jpeg' });
  appendImageFile(form, { uri: 'file:///data/photo.png', mimeType: 'image/png', fileName: 'pan.png' });
  assert.deepEqual(parts, [
    ['file', { uri: 'file:///data/photo.jpg', name: 'recipe.jpg', type: 'image/jpeg' }],
    ['file', { uri: 'file:///data/photo.png', name: 'pan.png', type: 'image/png' }],
  ]);
});

test('invalid images are rejected before any request', async () => {
  const { c, f } = client();
  const tooBig = new Uint8Array(MAX_IMAGE_BYTES + 1);
  tooBig.set(JPEG);
  const bad: [string, RecipeImage, RegExp][] = [
    ['', { data: JPEG, mimeType: 'image/jpeg' }, /recipe id/],
    [ID, { data: JPEG, mimeType: 'image/gif' as 'image/jpeg' }, /JPEG or PNG/],
    [ID, { data: new Uint8Array(), mimeType: 'image/jpeg' }, /empty/],
    [ID, { data: PNG, mimeType: 'image/jpeg' }, /not a JPEG/],
    [ID, { data: JPEG, mimeType: 'image/png' }, /not a PNG/],
    [ID, { data: tooBig, mimeType: 'image/jpeg' }, /10 MB/],
    [ID, { data: new Blob([tooBig]), mimeType: 'image/jpeg' }, /10 MB/],
    [ID, { uri: 'file:///big.jpg', mimeType: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 }, /10 MB/],
    [ID, { uri: '', mimeType: 'image/jpeg' }, /uri/],
    [ID, { mimeType: 'image/jpeg' } as RecipeImage, /either `data` or `uri`/],
    [ID, { uri: 'file:///a.jpg', data: JPEG, mimeType: 'image/jpeg' } as unknown as RecipeImage, /either `data` or `uri`/],
  ];
  for (const [id, image, message] of bad) {
    await assert.rejects(c.uploadCustomRecipeImage(id, image), (e: Error) => {
      assert.ok(e instanceof RecipeValidationError, e.message);
      assert.match(e.message, message);
      return true;
    });
  }
  assert.equal(f.calls.length, 0);
});

test('a failed upload leaves the recipe untouched', async () => {
  const cases: [string, (c: Call) => Reply, number, string[]][] = [
    [
      'signature',
      (x) => (x.url.endsWith('/image/signature') ? { status: 500, body: { error: 'boom' } } : happy(x)),
      500,
      ['POST created-recipes/es/image/signature'],
    ],
    [
      'cloudinary',
      (x) => (x.url === CLOUDINARY ? { status: 400, body: { error: { message: 'Invalid Signature' } } } : happy(x)),
      400,
      ['POST created-recipes/es/image/signature', 'POST cloudinary'],
    ],
    [
      // Cloudinary's 401 is about the signature, not the Cookidoo session: no refresh, no retry.
      'cloudinary 401',
      (x) => (x.url === CLOUDINARY ? { status: 401 } : happy(x)),
      401,
      ['POST created-recipes/es/image/signature', 'POST cloudinary'],
    ],
  ];
  for (const [name, respond, status, sequence] of cases) {
    const { c, f, api } = client(respond);
    await assert.rejects(c.uploadCustomRecipeImage(ID, { data: JPEG, mimeType: 'image/jpeg' }), (e: unknown) => {
      assert.ok(e instanceof CookidooHttpError, name);
      assert.equal(e.status, status, name);
      return true;
    });
    assert.deepEqual(api().map((x) => where(x).join(' ')), sequence, name);
    assert.equal(f.calls.filter((x) => x.url === 'https://ciam/token').length, 0, name);
  }
});

test('an unexpected signature or Cloudinary response stops before the PATCH', async () => {
  for (const respond of [
    (x: Call): Reply => (x.url.endsWith('/image/signature') ? { status: 200, body: {} } : happy(x)),
    (x: Call): Reply => (x.url === CLOUDINARY ? { status: 200, body: { public_id: 'https://evil/x', format: 'jpg' } } : happy(x)),
  ]) {
    const { c, api } = client(respond);
    await assert.rejects(c.uploadCustomRecipeImage(ID, { data: JPEG, mimeType: 'image/jpeg' }), /Unexpected image/);
    assert.equal(api().filter((x) => x.method === 'PATCH').length, 0);
  }
});

test('on a 401 from Cookidoo it refreshes once and retries, like any other request', async () => {
  const { c, f, api } = client((x) => (x.auth === 'Bearer old' ? { status: 401 } : happy(x)), 'old');
  await c.uploadCustomRecipeImage(ID, { data: JPEG, mimeType: 'image/jpeg' });
  assert.equal(f.calls.filter((x) => x.url === 'https://ciam/token').length, 1);
  assert.deepEqual(api().map((x) => [...where(x), x.auth]), [
    ['POST', 'created-recipes/es/image/signature', 'Bearer old'],
    ['POST', 'created-recipes/es/image/signature', 'Bearer new'],
    ['POST', 'cloudinary', undefined],
    ['PATCH', `created-recipes/es/${ID}`, 'Bearer new'],
  ]);
});

test('if the 401 persists, it requires login and nothing is uploaded', async () => {
  const { c, api } = client((x) => (x.url === CLOUDINARY ? happy(x) : { status: 401 }));
  await assert.rejects(c.uploadCustomRecipeImage(ID, { data: JPEG, mimeType: 'image/jpeg' }), { name: 'AuthRequiredError' });
  assert.deepEqual(api().map((x) => where(x).join(' ')), [
    'POST created-recipes/es/image/signature',
    'POST created-recipes/es/image/signature',
  ]);
});

test('later updates keep the uploaded photo and its ownership', async () => {
  for (const owned of [true, false]) {
    const recipe = { ...WITH_PHOTO, recipeContent: { ...WITH_PHOTO.recipeContent, isImageCopyrightOwned: owned } };
    const { c, api } = client((x) => (x.method === 'PATCH' ? { status: 204 } : { status: 200, body: recipe }));
    const current = await c.getCustomRecipe(ID);
    assert.equal(current.imageOwnedByUser, owned);
    await c.updateCustomRecipe(ID, { name: 'Vongole con foto' });
    const patch = JSON.parse(api().find((x) => x.method === 'PATCH')!.body ?? '') as Record<string, unknown>;
    assert.equal(patch.name, 'Vongole con foto');
    assert.equal(patch.image, `${PUBLIC_ID}.jpg`);
    assert.equal(patch.isImageOwnedByUser, owned);
  }
});

test("an update refuses to drop a photo of the user's that it can't recover", async () => {
  const recipe = {
    ...WITH_PHOTO,
    recipeContent: { ...WITH_PHOTO.recipeContent, image: DISPLAY.replace('.jpg', '') },
  };
  const { c, api } = client((x) => (x.method === 'PATCH' ? { status: 204 } : { status: 200, body: recipe }));
  await assert.rejects(c.updateCustomRecipe(ID, { name: 'x' }), RecipeValidationError);
  assert.equal(api().filter((x) => x.method === 'PATCH').length, 0);
});
