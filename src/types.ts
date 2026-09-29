/** Numeric quantity (min = max except for ranges like "1 - 2"); null if the recipe has none. */
export type Amount = { min: number; max: number } | null;

export type ShoppingItem = {
  id: string;
  name: string;
  /** Quantity and unit ready to display, e.g. "200 g". */
  detail: string;
  isOwned: boolean;
  amount: Amount;
  unit: string;
  /** Ingredients only: the recipe it belongs to. */
  recipeId?: string;
};

export type ShoppingList = {
  recipes: { id: string; name: string }[];
  ingredients: ShoppingItem[];
  additional: ShoppingItem[];
};

export type WeekDay = {
  /** Day as "2026-09-29" (or the id Cookidoo sends if there is no dayKey). */
  day: string;
  title: string;
  recipes: { id: string; name: string }[];
};

export type OwnershipChange = { id: string; isOwned: boolean };
