import assert from 'node:assert/strict';
import { test } from 'node:test';

import { memoryTokenStore } from '../src/auth.ts';
import { Cookidoo } from '../src/client.ts';
import { URUGUAY } from '../src/config.ts';
import { RecipeValidationError } from '../src/recipes.ts';
import { fakeFetch, path, type Call } from './fake-fetch.ts';

const later = () => Date.now() / 1000 + 9999;
const isDiscovery = (c: Call) => c.url.endsWith('.well-known/home');
const OCT_5 = new Date(2026, 9, 5);

/** The enhanced week, as Cookidoo answered it on a real account (2026-10-05), trimmed. */
const WEEK = {
  myDays: [
    {
      id: '2026-10-05',
      dayKey: '2026-10-05',
      title: '05.10.2026',
      plannedRecipes: [
        { recipeId: '01M055HRMPF137HA6VW5WSRWH6', recipeType: 'CUSTOMER', title: 'Batido de banana y maní', totalTime: '300' },
        { recipeId: 'r426333', recipeType: 'VORWERK', title: 'Tacos de lechuga con pollo', totalTime: '1800.0' },
      ],
    },
    { id: '2026-10-06', dayKey: '2026-10-06', title: '06.10.2026', plannedRecipes: [] },
  ],
};

function client(respond: (c: Call) => { status: number; body?: unknown }) {
  const f = fakeFetch((c) => (isDiscovery(c) ? { status: 404 } : respond(c)));
  const c = new Cookidoo({
    localization: URUGUAY,
    fetch: f.fetch,
    tokenStore: memoryTokenStore({ accessToken: 't', refreshToken: 'r', expiresAt: later() }),
  });
  return { c, api: () => f.calls.filter((x) => !isDiscovery(x)) };
}

test('getWeek reads the enhanced week: Cookidoo recipes and the user\'s own, with their names', async () => {
  const { c, api } = client(() => ({ status: 200, body: WEEK }));

  const week = await c.getWeek(OCT_5);

  assert.equal(path(api()[0].url), 'planning/es/api/my-week-enhanced/2026-10-05');
  assert.deepEqual(week, [
    {
      day: '2026-10-05',
      title: '05.10.2026',
      recipes: [
        { id: '01M055HRMPF137HA6VW5WSRWH6', name: 'Batido de banana y maní', custom: true },
        { id: 'r426333', name: 'Tacos de lechuga con pollo', custom: false },
      ],
    },
    { day: '2026-10-06', title: '06.10.2026', recipes: [] },
  ]);
});

test('addCustomRecipesToDay plans recipes from "My recipes" for a day (Cookidoo\'s "Cook today")', async () => {
  const { c, api } = client(() => ({ status: 200, body: { message: 'Receta planeada', content: {} } }));

  await c.addCustomRecipesToDay(['01A', '01B'], OCT_5);

  const [put] = api();
  assert.equal(put.method, 'PUT');
  assert.equal(path(put.url), 'planning/es/api/my-day');
  assert.deepEqual(JSON.parse(put.body!), { recipeIds: ['01A', '01B'], dayKey: '2026-10-05', recipeSource: 'CUSTOMER' });
});

test('removeCustomRecipeFromDay takes one recipe off a day, even the last one (content null)', async () => {
  const { c, api } = client(() => ({ status: 200, body: { message: 'La receta se ha eliminado', content: null } }));

  await c.removeCustomRecipeFromDay('01A', OCT_5);

  const [del] = api();
  assert.equal(del.method, 'DELETE');
  assert.equal(new URL(del.url).pathname, '/planning/es/api/my-day/2026-10-05/recipes/01A');
  assert.equal(new URL(del.url).searchParams.get('recipeSource'), 'CUSTOMER');
});

test('both default to today, and refuse an empty id before any request', async () => {
  const { c, api } = client(() => ({ status: 200, body: { content: null } }));
  const now = new Date();
  const today = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  await c.addCustomRecipesToDay(['01A']);
  assert.equal(JSON.parse(api()[0].body!).dayKey, today);

  for (const bad of [() => c.addCustomRecipesToDay([]), () => c.addCustomRecipesToDay([' ']), () => c.removeCustomRecipeFromDay('')]) {
    await assert.rejects(bad(), RecipeValidationError);
  }
  assert.equal(api().length, 1);
});
