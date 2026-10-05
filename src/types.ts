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
  /** `custom`: one of the user's "My recipes" (its id is a created recipe's), not a Cookidoo recipe. */
  recipes: { id: string; name: string; custom: boolean }[];
};

export type UserInfo = {
  id: string;
  username: string;
  description: string | null;
  /** Profile picture URL, if the user has one. */
  picture: string | null;
  isPublic: boolean;
};

/** The Vorwerk account (OIDC userinfo). Missing fields are null. */
export type Account = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  username: string | null;
  picture: string | null;
  /** e.g. "es". */
  locale: string | null;
  /** Country of residence, e.g. "UY". */
  country: string | null;
  /** ISO 8601, e.g. "2020-01-02T03:04:05Z". */
  createdAt: string | null;
};

export type Subscription = {
  active: boolean;
  /** e.g. "ACTIVE". */
  status: string;
  /** e.g. "REGULAR". */
  type: string;
  extendedType: string | null;
  /** e.g. "FULL". */
  level: string;
  /** e.g. "COMMERCE". */
  source: string;
  /** ISO 8601. */
  startDate: string | null;
  /** ISO 8601. */
  expires: string | null;
};

export type OwnershipChange = { id: string; isOwned: boolean };
