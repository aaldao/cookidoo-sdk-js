import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CookidooHttpError, memoryTokenStore } from '../src/auth.ts';
import { Cookidoo } from '../src/client.ts';
import { URUGUAY } from '../src/config.ts';
import {
  buildCustomRecipePayload,
  durationToSeconds,
  imageForPayload,
  instructionsToJson,
  IncompleteCustomRecipeError,
  parseCustomRecipe,
  RecipeValidationError,
  YIELD_UNITS,
  type Instruction,
  type NewCustomRecipe,
} from '../src/recipes.ts';
import { fakeFetch, path, type Call } from './fake-fetch.ts';
import { COPY_RESPONSE, LIST_RESPONSE } from './fixtures/custom-recipes.ts';

const SITE = 'https://cookidoo.international';
const ACCEPT_FULL = 'application/vnd.vorwerk.customer-recipe.full+json';
const RECIPE = LIST_RESPONSE.items[0];
const ID = RECIPE.recipeId;

function client(respond: (c: Call) => { status: number; body?: unknown }) {
  const f = fakeFetch((c) => (c.url.endsWith('.well-known/home') ? { status: 404 } : respond(c)));
  const c = new Cookidoo({
    localization: URUGUAY,
    fetch: f.fetch,
    tokenStore: memoryTokenStore({ accessToken: 't', refreshToken: 'r', expiresAt: Date.now() / 1000 + 9999 }),
  });
  const api = () => f.calls.filter((x) => !x.url.endsWith('.well-known/home'));
  return { c, api };
}

const minimal: NewCustomRecipe = {
  name: 'Pan casero',
  ingredients: ['500 g harina', '10 g sal'],
  instructions: ['Mezclar todo.'],
  servingSize: 1,
  totalTime: 3600,
  activeTime: 600,
};

// ---------------------------------------------------------------------------
// Parsing

test('parses the structured shape (list/get)', () => {
  const r = parseCustomRecipe(RECIPE, SITE, 'es');
  assert.equal(r.id, ID);
  assert.equal(r.name, 'Vongole alla marinara');
  assert.equal(r.ingredients.length, 10);
  assert.equal(r.ingredients[0], '130 g di cipolla');
  assert.equal(r.servingSize, 6);
  assert.equal(r.unitText, 'portion');
  assert.equal(r.activeTime, 600);
  assert.equal(r.totalTime, 1800);
  assert.deepEqual(r.tools, ['TM7', 'TM6', 'TM5']);
  assert.equal(r.workStatus, 'PRIVATE');
  assert.equal(r.url, `${SITE}/created-recipes/es/${ID}`);
  assert.match(r.image ?? '', /t_web_rdp_recipe_584x480_1_5x\/img\/recipe/);
  assert.match(r.thumbnail ?? '', /t_web_shared_recipe_221x240\/img\/recipe/);

  const step = r.instructions[0];
  assert.ok(typeof step === 'object');
  const tts = step.annotations?.filter((a) => a.type === 'TTS') ?? [];
  assert.deepEqual(tts, [
    { type: 'TTS', slot: '4 sec./vel. 5', time: 4, speed: '5' },
    { type: 'TTS', slot: '10 min./120°C/vel. 1', time: 600, speed: '1', temperature: { value: '120', unit: 'C' } },
  ]);
  // Ingredient annotations with a structured description are kept as-is.
  const other = step.annotations?.find((a) => a.type === 'OTHER');
  assert.equal(other?.type === 'OTHER' && other.rawType, 'INGREDIENT');
  assert.equal(other?.slot, 'cipolle');

  const varoma = (r.instructions[1] as Exclude<Instruction, string>).annotations?.find((a) => a.type === 'TTS');
  assert.deepEqual(varoma, { type: 'TTS', slot: '14 min./Varoma/vel. 2', time: 840, speed: '2', temperature: { value: 'varoma', unit: null } });
});

test('parses the schema.org-like shape (copy) the same way', () => {
  const r = parseCustomRecipe(COPY_RESPONSE, SITE, 'es');
  assert.equal(r.name, 'Vongole alla marinara');
  assert.equal(r.activeTime, 600);
  assert.equal(r.totalTime, 1800);
  assert.equal(r.servingSize, 6);
  assert.deepEqual(r.tools, ['TM7', 'TM6', 'TM5']);
  assert.equal(r.ingredients[9], '⅔ cucchiaino di sale');
  assert.equal(r.instructions.length, 3);
  assert.equal(typeof r.instructions[0], 'string');
});

test('durations: seconds or ISO 8601', () => {
  assert.equal(durationToSeconds(1800), 1800);
  assert.equal(durationToSeconds('PT30M'), 1800);
  assert.equal(durationToSeconds('PT1H5M30S'), 3930);
  assert.equal(durationToSeconds('P1DT1H'), 90000);
  assert.equal(durationToSeconds(''), 0);
  assert.equal(durationToSeconds('garbage'), 0);
  assert.equal(durationToSeconds(null), 0);
});

// ---------------------------------------------------------------------------
// Building the payload

test('a parsed recipe serializes back to the same steps and annotations', () => {
  const r = parseCustomRecipe(RECIPE, SITE, 'es');
  const original = RECIPE.recipeContent.instructions.map(({ missedUsages, ...step }) => step);
  const roundTrip = instructionsToJson(r.instructions, r.ingredients);
  // The API omits the unit for varoma and our parser reads it as null, so the JSON matches exactly.
  assert.deepEqual(
    roundTrip.map((s) => ({ ...s, annotations: (s.annotations as object[]).map((a) => JSON.stringify(a, Object.keys(a).sort())) })),
    original.map((s) => ({ ...s, annotations: s.annotations.map((a) => JSON.stringify(a, Object.keys(a).sort())) })),
  );
});

test('payload: settings, annotations, defaults and derived times', () => {
  const payload = buildCustomRecipePayload({
    ...minimal,
    ingredients: ['500 g harina', '10 g sal'],
    instructions: [
      {
        text: 'Agregar la harina y amasar 2 min.',
        settings: { time: 120, speed: 'soft' },
        annotations: [
          { type: 'INGREDIENT', slot: 'harina', description: '500 g harina' },
          { type: 'MODE', slot: 'amasar 2 min', mode: 'dough', time: 120 },
          { type: 'TTS', slot: '2 min', time: 120, temperature: { value: 37 }, speed: '2' },
        ],
      },
    ],
    tools: ['TM6'],
    unitText: 'slice',
    image: null,
    imageOwnedByUser: false,
    hints: ['Tapar mientras leva.', 'Se puede congelar.'],
    workStatus: 'PRIVATE',
    requiresAnnotationsCheck: false,
  });
  assert.deepEqual(payload, {
    name: 'Pan casero',
    image: null,
    isImageOwnedByUser: false,
    tools: ['TM6'],
    yield: { value: 1, unitText: 'slice' },
    prepTime: 600,
    cookTime: 3000,
    totalTime: 3600,
    ingredients: [
      { type: 'INGREDIENT', text: '500 g harina' },
      { type: 'INGREDIENT', text: '10 g sal' },
    ],
    instructions: [
      {
        type: 'STEP',
        text: 'Agregar la harina y amasar 2 min.',
        time: 120,
        speed: 'soft',
        annotations: [
          { type: 'INGREDIENT', data: { description: '500 g harina' }, position: { offset: 11, length: 6 } },
          { type: 'MODE', data: { time: 120 }, position: { offset: 20, length: 12 }, name: 'dough' },
          { type: 'TTS', data: { time: 120, temperature: { value: 37, unit: 'C' }, speed: '2' }, position: { offset: 27, length: 5 } },
        ],
      },
    ],
    hints: 'Tapar mientras leva.\nSe puede congelar.',
    workStatus: 'PRIVATE',
    recipeMetadata: { requiresAnnotationsCheck: false },
  });
});

test('images: only customer-recipe paths, recoverable from display URLs', () => {
  assert.equal(imageForPayload('abc_1.jpg'), 'abc_1.jpg');
  assert.equal(imageForPayload('prod/img/customer-recipe/abc.png'), 'prod/img/customer-recipe/abc.png');
  assert.equal(
    imageForPayload('https://assets.tmecosys.com/image/upload/t_x/prod/img/customer-recipe/abc.png'),
    'prod/img/customer-recipe/abc.png',
  );
  assert.equal(imageForPayload('https://assets.tmecosys.com/image/upload/t_x/img/recipe/ras/Assets/X/Derivates/Y'), null);
});

// ---------------------------------------------------------------------------
// Validation: nothing is sent when the recipe is invalid

test('invalid recipes are rejected before any request', async () => {
  const { c, api } = client(() => ({ status: 500 }));
  const bad: [Partial<NewCustomRecipe>, RegExp][] = [
    [{ name: '  ' }, /name/],
    [{ servingSize: 0 }, /servings/],
    [{ servingSize: 10000 }, /9999/],
    [{ servingSize: 1.3 }, /0\.25/],
    [{ activeTime: 4000 }, /Active time/],
    [{ totalTime: -1 }, /negative/],
    [{ image: 'https://example.com/photo.jpg' }, /image/],
    [{ instructions: [{ text: 'Mezclar.', annotations: [{ type: 'TTS', slot: 'batir', time: 5 }] }] }, /not found in step text/],
    [
      { instructions: [{ text: 'Agregar azúcar.', annotations: [{ type: 'INGREDIENT', slot: 'azúcar', description: 'azúcar' }] }] },
      /not in the recipe's ingredient list/,
    ],
    [{ instructions: [{ text: 'Mezclar.', settings: { time: -5 } }] }, /negative/],
  ];
  for (const [change, message] of bad) {
    await assert.rejects(c.createCustomRecipe({ ...minimal, ...change }), (e: Error) => {
      assert.ok(e instanceof RecipeValidationError, e.message);
      assert.match(e.message, message);
      return true;
    });
  }
  assert.equal(api().length, 0);
});

// ---------------------------------------------------------------------------
// Client flows

test('create: empty recipe, fill it in with PATCH, reload it', async () => {
  const { c, api } = client((x) => {
    if (x.method === 'POST') return { status: 200, body: { recipeId: ID } };
    if (x.method === 'PATCH') return { status: 204 };
    return { status: 200, body: RECIPE };
  });
  const r = await c.createCustomRecipe(minimal);
  assert.equal(r.id, ID);
  const calls = api();
  assert.deepEqual(calls.map((x) => [x.method, path(x.url)]), [
    ['POST', 'created-recipes/es'],
    ['PATCH', `created-recipes/es/${ID}`],
    ['GET', `created-recipes/es/${ID}`],
  ]);
  assert.deepEqual(JSON.parse(calls[0].body ?? ''), { recipeName: 'Pan casero' });
  const patch = JSON.parse(calls[1].body ?? '') as Record<string, unknown>;
  assert.deepEqual(patch.tools, ['TM7']);
  assert.deepEqual(patch.yield, { value: 1, unitText: 'portion' });
  assert.equal(patch.workStatus, 'PRIVATE');
  assert.equal(calls[2].accept, ACCEPT_FULL);
});

test('create: if filling in fails, the error carries the orphaned recipe id', async () => {
  const { c } = client((x) =>
    x.method === 'POST'
      ? { status: 200, body: { recipeId: 'orphan' } }
      : // The real answer Cookidoo gave to unitText "pan".
        {
          status: 400,
          body: {
            statusCode: 400,
            error: 'Bad Request',
            message: 'body/yield must be null, body/yield/unitText must be equal to one of the allowed values, body/yield must match a schema in anyOf',
            code: 'validationError',
          },
        },
  );
  await assert.rejects(c.createCustomRecipe(minimal), (e: unknown) => {
    assert.ok(e instanceof IncompleteCustomRecipeError);
    assert.equal(e.recipeId, 'orphan');
    // The server's explanation is part of the message, and available as-is on the cause.
    assert.ok(e.cause instanceof CookidooHttpError);
    assert.equal(e.cause.status, 400);
    assert.match(e.cause.message, /PATCH created-recipes\/es\/orphan → HTTP 400: .*unitText must be equal to one of the allowed values/);
    return true;
  });
});

test('update: keeps the fields not given, and the steps round-trip', async () => {
  const { c, api } = client((x) => (x.method === 'PATCH' ? { status: 200 } : { status: 200, body: RECIPE }));
  await c.updateCustomRecipe(ID, { name: 'Vongole de la casa' });
  const calls = api();
  assert.deepEqual(calls.map((x) => x.method), ['GET', 'PATCH', 'GET']);
  const patch = JSON.parse(calls[1].body ?? '') as Record<string, unknown>;
  assert.equal(patch.name, 'Vongole de la casa');
  assert.equal(patch.prepTime, 600);
  assert.equal(patch.totalTime, 1800);
  assert.deepEqual(patch.tools, ['TM7', 'TM6', 'TM5']);
  // Vorwerk's photo can't be recovered as a customer-recipe path, so it's dropped (as in cookidoo-api).
  assert.equal(patch.image, null);
  assert.equal((patch.ingredients as unknown[]).length, 10);
  assert.equal((patch.instructions as unknown[]).length, 2);
});

test('copy, list and remove', async () => {
  const { c, api } = client((x) => {
    if (x.method === 'POST') return { status: 200, body: COPY_RESPONSE };
    if (x.method === 'DELETE') return { status: 204 };
    return { status: 200, body: LIST_RESPONSE };
  });
  const copied = await c.copyRecipeToCustom('r166987', 4);
  assert.equal(copied.name, 'Vongole alla marinara');
  const list = await c.listCustomRecipes();
  assert.deepEqual(list.map((r) => r.id), [ID]);
  await c.removeCustomRecipe(ID);

  const calls = api();
  assert.deepEqual(calls.map((x) => [x.method, path(x.url)]), [
    ['POST', 'created-recipes/es'],
    ['GET', 'created-recipes/es'],
    ['DELETE', `created-recipes/es/${ID}`],
  ]);
  assert.deepEqual(JSON.parse(calls[0].body ?? ''), { recipeUrl: `${SITE}/recipes/recipe/es/r166987`, servingSize: 4 });
  assert.equal(calls[1].accept, ACCEPT_FULL);
});

// ---------------------------------------------------------------------------
// Yield units

test("YIELD_UNITS lists the ten units of Cookidoo's recipe editor", () => {
  assert.deepEqual(
    [...YIELD_UNITS].sort(),
    ['bottle', 'cup', 'glass', 'gram', 'jar', 'litre', 'ounce', 'piece', 'portion', 'slice'],
  );
});

test('a yield in quarters (1.5 litres) is read and sent as it is', () => {
  const json = {
    ...RECIPE,
    recipeContent: { ...RECIPE.recipeContent, yield: { value: 1.5, unitText: 'litre' } },
  };
  const r = parseCustomRecipe(json, SITE, 'es');
  assert.equal(r.servingSize, 1.5);
  assert.equal(r.unitText, 'litre');

  const payload = buildCustomRecipePayload({
    ...r,
    servingSize: 2.75,
    unitText: 'jar',
  }) as { yield: unknown };
  assert.deepEqual(payload.yield, { value: 2.75, unitText: 'jar' });
});

test('an annotation time in half seconds (turbo 0.5 s) is read and sent back as it is', () => {
  const step = {
    type: 'STEP',
    text: 'Picar turbo \uE00B/0.5 seg/2 veces.',
    annotations: [
      { type: 'MODE', name: 'turbo', data: { time: 0.5 }, position: { offset: 6, length: 22 } },
      { type: 'TTS', data: { time: 1.5, speed: '5' }, position: { offset: 0, length: 5 } },
    ],
  };
  const json = { ...RECIPE, recipeContent: { ...RECIPE.recipeContent, instructions: [step] } };

  const r = parseCustomRecipe(json, SITE, 'es');
  const annotations = (r.instructions[0] as Exclude<Instruction, string>).annotations ?? [];
  assert.deepEqual(
    annotations.map((a) => (a.type === 'MODE' || a.type === 'TTS' ? a.time : undefined)),
    [0.5, 1.5],
  );

  const sent = instructionsToJson(r.instructions, r.ingredients) as {
    annotations: { data: { time?: number } }[];
  }[];
  assert.deepEqual(
    sent[0].annotations.map((a) => a.data.time),
    [0.5, 1.5],
  );
});
