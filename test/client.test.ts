import assert from 'node:assert/strict';
import { test } from 'node:test';

import { memoryTokenStore, parseRedirect, type Tokens } from '../src/auth.ts';
import { Cookidoo, normalizeHref } from '../src/client.ts';
import { URUGUAY } from '../src/config.ts';
import { fakeFetch, path } from './fake-fetch.ts';

const later = () => Date.now() / 1000 + 9999;

test('normalizeHref', () => {
  assert.equal(normalizeHref('https://cookidoo.international/shopping/{lang}', 'shopping/{language}'), 'shopping/{language}');
  assert.equal(
    normalizeHref('/planning/{lang}/api/my-week/{dayKey}{?x,y}', 'planning/{language}/api/my-week/{day}'),
    'planning/{language}/api/my-week/{day}',
  );
  // Live path segments win; unknown token names are substituted by position.
  assert.equal(normalizeHref('/created-recipes/{lang}/v2/{recipe}', 'created-recipes/{language}/{id}'), 'created-recipes/{language}/v2/{id}');
  // A different number of variables, or a known token in the wrong place, is rejected.
  assert.equal(normalizeHref('/x/{lang}/{id}', 'x/{language}'), null);
  assert.equal(normalizeHref('/x/{id}/{lang}', 'x/{language}/{id}'), null);
});

test('parseRedirect', () => {
  assert.deepEqual(parseRedirect('com.vorwerk.cookidoo://code-grant?code=abc&state=xyz'), {
    code: 'abc',
    state: 'xyz',
    error: undefined,
  });
});

test('requests run one at a time and use the fallback paths', async () => {
  const f = fakeFetch((c) => {
    if (c.url.endsWith('.well-known/home')) return { status: 404 };
    if (c.url.endsWith('/remove')) return { status: 200 };
    return { status: 200, body: { data: [{ id: 'n1', name: 'pan', isOwned: false }] } };
  });
  const tokens: Tokens = { accessToken: 't', refreshToken: 'r', expiresAt: later() };
  const c = new Cookidoo({ localization: URUGUAY, fetch: f.fetch, tokenStore: memoryTokenStore(tokens) });

  const [added] = await Promise.all([
    c.addAdditionalItems(['pan']),
    c.removeAdditionalItems(['x']),
    c.setIngredientsOwned([{ id: 'i1', isOwned: true }]),
  ]);

  assert.equal(f.maxActive(), 1);
  assert.deepEqual(added.map((a) => a.id), ['n1']);
  assert.equal(c.usedFallbackPaths, true);
  // One discovery document per service: shopping, planning, recipes/recipe, created-recipes.
  assert.equal(f.calls.filter((x) => x.url.endsWith('.well-known/home')).length, 4);
  const posts = f.calls.filter((x) => x.method === 'POST');
  assert.deepEqual(posts.map((x) => path(x.url)), [
    'shopping/es/additional-items/add',
    'shopping/es/additional-items/remove',
    'shopping/es/owned-ingredients/ownership/edit',
  ]);
  assert.deepEqual(JSON.parse(posts[0].body!), { itemsValue: ['pan'] });
  assert.deepEqual(JSON.parse(posts[1].body!), { additionalItemIDs: ['x'] });
  const own = JSON.parse(posts[2].body!).ingredients[0];
  assert.equal(own.id, 'i1');
  assert.equal(own.isOwned, true);
  assert.ok(Number.isInteger(own.ownedTimestamp) && own.ownedTimestamp < 1e11, 'timestamp in seconds');
});

test('uses the paths discovered in .well-known/home', async () => {
  const f = fakeFetch((c) => {
    if (c.url.endsWith('shopping/.well-known/home'))
      return { status: 200, body: { _links: { 'pantry:home': { href: 'https://x/shopping/{lang}/v2' } } } };
    if (c.url.endsWith('.well-known/home')) return { status: 404 };
    return { status: 200, body: { recipes: [], customerRecipes: [], additionalItems: [] } };
  });
  const c = new Cookidoo({
    localization: URUGUAY,
    fetch: f.fetch,
    tokenStore: memoryTokenStore({ accessToken: 't', refreshToken: 'r', expiresAt: later() }),
  });
  await c.getShoppingList();
  assert.equal(path(f.calls.at(-1)!.url), 'shopping/es/v2');
});

test('on a 401 it refreshes once, stores the rotated token and retries', async () => {
  const f = fakeFetch((c) => {
    if (c.url.includes('openid-configuration'))
      return { status: 200, body: { authorization_endpoint: 'https://ciam/auth', token_endpoint: 'https://ciam/token' } };
    if (c.url === 'https://ciam/token')
      return { status: 200, body: { access_token: 'new', refresh_token: 'r2', expires_in: 43200 } };
    if (c.url.endsWith('.well-known/home')) return { status: 404 };
    if (c.auth === 'Bearer old') return { status: 401 };
    return { status: 200, body: { myDays: [{ id: 'd', dayKey: '2026-09-29', title: '29.09.2026', recipes: [{ id: 'r', title: 'Flan' }] }] } };
  });
  const store = memoryTokenStore({ accessToken: 'old', refreshToken: 'r1', expiresAt: later() });
  const c = new Cookidoo({ localization: URUGUAY, fetch: f.fetch, tokenStore: store });

  const week = await c.getWeek(new Date(2026, 8, 29));
  assert.deepEqual(week, [{ day: '2026-09-29', title: '29.09.2026', recipes: [{ id: 'r', name: 'Flan' }] }]);
  assert.equal(f.calls.filter((x) => x.url === 'https://ciam/token').length, 1);
  assert.match(f.calls.find((x) => x.url === 'https://ciam/token')!.body!, /refresh_token=r1/);
  assert.equal((await store.load())?.refreshToken, 'r2');
});

test('if the 401 persists after refreshing, it requires login', async () => {
  const f = fakeFetch((c) => {
    if (c.url.includes('openid-configuration'))
      return { status: 200, body: { authorization_endpoint: 'https://ciam/auth', token_endpoint: 'https://ciam/token' } };
    if (c.url === 'https://ciam/token') return { status: 200, body: { access_token: 'x', refresh_token: 'r2' } };
    if (c.url.endsWith('.well-known/home')) return { status: 404 };
    return { status: 401 };
  });
  const c = new Cookidoo({
    localization: URUGUAY,
    fetch: f.fetch,
    tokenStore: memoryTokenStore({ accessToken: 'a', refreshToken: 'r1', expiresAt: later() }),
  });
  await assert.rejects(c.getShoppingList(), { name: 'AuthRequiredError' });
  assert.equal(f.calls.filter((x) => x.url.startsWith('https://cookidoo.international/shopping/es')).length, 2);
});

test('login: PKCE URL, and the code is exchanged for tokens', async () => {
  const f = fakeFetch((c) => {
    if (c.url.includes('openid-configuration'))
      return { status: 200, body: { authorization_endpoint: 'https://ciam/auth', token_endpoint: 'https://ciam/token' } };
    return { status: 200, body: { access_token: 'a', refresh_token: 'r', expires_in: 43200 } };
  });
  const store = memoryTokenStore();
  const c = new Cookidoo({ localization: URUGUAY, fetch: f.fetch, tokenStore: store });
  assert.equal(await c.isLoggedIn(), false);

  const pending = await c.startLogin();
  const q = new URL(pending.url).searchParams;
  assert.equal(q.get('client_id'), 'mobile-android');
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('market'), 'uy');

  await assert.rejects(c.finishLogin(pending, 'com.vorwerk.cookidoo://code-grant?code=c&state=other'), /state mismatch/);
  await c.finishLogin(pending, `com.vorwerk.cookidoo://code-grant?code=c&state=${pending.state}`);
  assert.equal((await store.load())?.accessToken, 'a');
  assert.equal(await c.isLoggedIn(), true);
});
