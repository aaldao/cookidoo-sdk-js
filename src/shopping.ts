import type { Amount, ShoppingItem, ShoppingList } from './types.ts';

// ---------------------------------------------------------------------------
// Names

/**
 * "de leche" → "leche". Spanish/Portuguese recipes keep the preposition from
 * "200 g de leche" in the ingredient name.
 */
export function cleanIngredientName(name: string): string {
  return name.trim().replace(/^de\s+/i, '');
}

/**
 * Spanish/Portuguese/English synonyms → canonical key (already normalized). A single
 * list can mix recipes in several languages; this covers the common staples, it's
 * not a translator.
 */
const SYNONYMS: Record<string, string[]> = {
  sugar: ['azucar', 'acucar'],
  'powdered sugar': ['icing sugar', 'azucar impalpable', 'acucar de confeiteiro'],
  milk: ['leche', 'leite'],
  egg: ['eggs', 'huevo', 'huevos', 'ovo', 'ovos'],
  flour: ['wheat flour', 'harina', 'harina de trigo', 'farinha', 'farinha de trigo'],
  salt: ['sal'],
  water: ['agua'],
  oil: ['aceite', 'oleo'],
  'olive oil': ['aceite de oliva', 'azeite', 'azeite de oliva'],
  butter: ['manteca', 'mantequilla', 'manteiga'],
  onion: ['onions', 'cebolla', 'cebollas', 'cebola', 'cebolas'],
  garlic: ['garlic cloves', 'ajo', 'diente de ajo', 'dientes de ajo', 'alho', 'dentes de alho'],
  tomato: ['tomatoes', 'tomate', 'tomates'],
  pepper: ['black pepper', 'pimienta', 'pimienta negra', 'pimenta', 'pimenta preta'],
  lemon: ['lemons', 'limon', 'limones', 'limao', 'limoes'],
  rice: ['arroz'],
  cheese: ['queso', 'queijo'],
  parmesan: ['parmesan cheese', 'queso parmesano', 'queijo parmesao'],
  cream: ['crema', 'crema de leche', 'nata', 'creme de leite'],
  carrot: ['carrots', 'zanahoria', 'zanahorias', 'cenoura', 'cenouras'],
  yeast: ['levadura', 'fermento'],
};

const CANONICAL = new Map<string, string>();
for (const [canon, variants] of Object.entries(SYNONYMS)) {
  CANONICAL.set(canon, canon);
  for (const v of variants) CANONICAL.set(v, canon);
}

function basicKey(name: string): string {
  return cleanIngredientName(
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' '),
  ).trim();
}

/** Key used to merge items: lowercase, no accents, no leading "de ", synonyms applied. */
export function normalizeName(name: string): string {
  const key = basicKey(name);
  return CANONICAL.get(key) ?? key;
}

// ---------------------------------------------------------------------------
// Quantities

export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function amountText(a: Amount, unit: string): string {
  if (!a) return unit;
  const n = a.min === a.max ? formatNumber(a.min) : `${formatNumber(a.min)} - ${formatNumber(a.max)}`;
  return `${n} ${unit}`.trim();
}

/** Adds up quantities with the same unit; different units are joined with " + ". */
export function sumAmounts(items: { amount: Amount; unit: string }[]): string {
  const byUnit = new Map<string, { unit: string; amount: Amount }>();
  for (const i of items) {
    const unitKey = basicKey(i.unit);
    const prev = byUnit.get(unitKey);
    if (!prev) {
      byUnit.set(unitKey, { unit: i.unit.trim(), amount: i.amount && { ...i.amount } });
    } else if (prev.amount && i.amount) {
      prev.amount.min += i.amount.min;
      prev.amount.max += i.amount.max;
    } else {
      prev.amount = prev.amount ?? (i.amount && { ...i.amount });
    }
  }
  return [...byUnit.values()]
    .map((u) => amountText(u.amount, u.unit))
    .filter(Boolean)
    .join(' + ');
}

// ---------------------------------------------------------------------------
// UI rows

/** A row may stand for several Cookidoo items (unified view). */
export type Row = { key: string; name: string; detail: string; isOwned: boolean; ids: string[] };
export type RowGroup = { key: string; title: string | null; rows: Row[] };

/** Unchecked items first, checked ones last; otherwise order is preserved. */
export function pendingFirst(rows: Row[]): Row[] {
  return [...rows.filter((r) => !r.isOwned), ...rows.filter((r) => r.isOwned)];
}

export function itemRow(i: ShoppingItem): Row {
  return { key: i.id, name: i.name, detail: i.detail, isOwned: i.isOwned, ids: [i.id] };
}

export function unifyIngredients(items: ShoppingItem[]): Row[] {
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of items) {
    const key = normalizeName(i.name);
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  }
  return pendingFirst(
    [...groups].map(([key, g]) => ({
      key,
      name: g[0].name,
      detail: sumAmounts(g),
      isOwned: g.every((i) => i.isOwned),
      ids: g.map((i) => i.id),
    })),
  );
}

export function ingredientsByRecipe(list: ShoppingList): RowGroup[] {
  return list.recipes
    .map((r) => ({
      key: r.id,
      title: r.name,
      rows: pendingFirst(list.ingredients.filter((i) => i.recipeId === r.id).map(itemRow)),
    }))
    .filter((g) => g.rows.length > 0);
}
