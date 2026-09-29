import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cleanIngredientName,
  ingredientsByRecipe,
  normalizeName,
  sumAmounts,
  unifyIngredients,
} from '../src/shopping.ts';
import type { Amount, ShoppingItem } from '../src/types.ts';

const it = (id: string, name: string, amount: Amount, unit: string, isOwned = false, recipeId = 'r1'): ShoppingItem =>
  ({ id, name, detail: '', isOwned, amount, unit, recipeId });

test('strips a leading "de "', () => {
  assert.equal(cleanIngredientName('de leche'), 'leche');
  assert.equal(cleanIngredientName('De Azúcar'), 'Azúcar');
  assert.equal(cleanIngredientName('aceite de oliva'), 'aceite de oliva');
  assert.equal(cleanIngredientName('dedos de queso'), 'dedos de queso');
});

test('normalizes and applies ES/PT/EN synonyms', () => {
  assert.equal(normalizeName('Azúcar'), 'sugar');
  assert.equal(normalizeName('açúcar'), 'sugar');
  assert.equal(normalizeName('Sugar'), 'sugar');
  assert.equal(normalizeName('de  Leche'), 'milk');
  assert.equal(normalizeName('leite'), 'milk');
  assert.equal(normalizeName('Eggs'), 'egg');
  assert.equal(normalizeName('ovos'), 'egg');
  assert.equal(normalizeName('azeite'), 'olive oil');
  assert.equal(normalizeName('Remolacha'), 'remolacha');
});

test('adds up quantities per unit', () => {
  assert.equal(sumAmounts([it('a', 'x', { min: 200, max: 200 }, 'g'), it('b', 'x', { min: 50, max: 50 }, 'g ')]), '250 g');
  assert.equal(sumAmounts([it('a', 'x', { min: 1, max: 2 }, 'cdas'), it('b', 'x', { min: 1, max: 1 }, 'cdas')]), '2 - 3 cdas');
  assert.equal(sumAmounts([it('a', 'x', { min: 200, max: 200 }, 'g'), it('b', 'x', { min: 1, max: 1 }, 'taza')]), '200 g + 1 taza');
  assert.equal(sumAmounts([it('a', 'x', { min: 0.1, max: 0.1 }, 'kg'), it('b', 'x', { min: 0.2, max: 0.2 }, 'kg')]), '0.3 kg');
  assert.equal(sumAmounts([it('a', 'x', null, 'pizca'), it('b', 'x', null, 'pizca')]), 'pizca');
  assert.equal(sumAmounts([it('a', 'x', { min: 2, max: 2 }, ''), it('b', 'x', null, '')]), '2');
});

test('unified view: merges, adds up and puts checked items last', () => {
  const u = unifyIngredients([
    it('1', 'leche', { min: 200, max: 200 }, 'g', false, 'r1'),
    it('2', 'Leite', { min: 100, max: 100 }, 'g', false, 'r2'),
    it('3', 'azúcar', { min: 50, max: 50 }, 'g', true, 'r1'),
    it('4', 'Sugar', { min: 20, max: 20 }, 'g', true, 'r2'),
    it('5', 'huevos', { min: 2, max: 2 }, '', true, 'r1'),
    it('6', 'eggs', { min: 1, max: 1 }, '', false, 'r2'),
  ]);
  assert.deepEqual(
    u.map((r) => [r.key, r.name, r.detail, r.isOwned, r.ids]),
    [
      ['milk', 'leche', '300 g', false, ['1', '2']],
      ['egg', 'huevos', '3', false, ['5', '6']],
      ['sugar', 'azúcar', '70 g', true, ['3', '4']],
    ],
  );
});

test('by-recipe view: keeps recipe order, unchecked first, skips empty recipes', () => {
  const g = ingredientsByRecipe({
    recipes: [{ id: 'r1', name: 'Cake' }, { id: 'r2', name: 'Flan' }, { id: 'r3', name: 'Empty' }],
    additional: [],
    ingredients: [it('1', 'harina', null, '', true, 'r1'), it('2', 'sal', null, '', false, 'r1'), it('3', 'leche', null, '', false, 'r2')],
  });
  assert.deepEqual(g.map((x) => [x.title, x.rows.map((r) => r.name)]), [['Cake', ['sal', 'harina']], ['Flan', ['leche']]]);
});
