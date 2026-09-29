import {
  AuthRequiredError,
  memoryTokenStore,
  Session,
  type PendingLogin,
  type TokenStore,
  type Tokens,
} from './auth.ts';
import { DEFAULT_USER_AGENT, type Localization } from './config.ts';
import { webCrypto, type CryptoAdapter } from './pkce.ts';
import { cleanIngredientName } from './shopping.ts';
import type { Amount, OwnershipChange, ShoppingItem, ShoppingList, WeekDay } from './types.ts';

// ---------------------------------------------------------------------------
// Raw API types (subset of raw_types.py in cookidoo-api)

type Quantity = { value?: number | null; from?: number | null; to?: number | null } | null;

type ItemJSON = {
  id: string;
  ingredientNotation: string;
  isOwned: boolean;
  quantity: Quantity;
  unitNotation: string | null;
  preparation?: string;
};

type RecipeJSON = { id: string; title: string; recipeIngredientGroups: ItemJSON[] };
type AdditionalItemJSON = { id: string; name: string; isOwned: boolean };
type PantryJSON = {
  recipes: RecipeJSON[];
  customerRecipes: RecipeJSON[];
  additionalItems: AdditionalItemJSON[];
};

type DayRecipeJSON = { id: string; title: string; totalTime?: number | null };
type CalendarDayJSON = {
  id: string;
  title: string;
  dayKey: string;
  recipes: DayRecipeJSON[];
  customerRecipes?: DayRecipeJSON[];
};

// ---------------------------------------------------------------------------
// Endpoint discovery (.well-known/home, like well_known.py in cookidoo-api)

const RELS = {
  pantryHome: { service: 'shopping', rel: 'pantry:home', fallback: 'shopping/{language}' },
  myWeek: {
    service: 'planning',
    rel: 'planning:api-my-week-from-date',
    fallback: 'planning/{language}/api/my-week/{day}',
  },
  ingredientsOwnership: {
    service: 'shopping',
    rel: 'pantry:edit-ingredients-ownership',
    fallback: 'shopping/{language}/owned-ingredients/ownership/edit',
  },
  additionalAdd: {
    service: 'shopping',
    rel: 'pantry:add-additional-items-v2',
    fallback: 'shopping/{language}/additional-items/add',
  },
  additionalEdit: {
    service: 'shopping',
    rel: 'pantry:edit-additional-items',
    fallback: 'shopping/{language}/additional-items/edit',
  },
  additionalOwnership: {
    service: 'shopping',
    rel: 'pantry:edit-additional-items-ownership',
    fallback: 'shopping/{language}/additional-items/ownership/edit',
  },
  additionalRemove: {
    service: 'shopping',
    rel: 'pantry:remove-additional-items',
    fallback: 'shopping/{language}/additional-items/remove',
  },
} as const;
type RelKey = keyof typeof RELS;
type HalLink = { href?: unknown };

const TOKEN_NAMES: Record<string, string> = { lang: 'language', dayKey: 'day' };

/** Turns a HAL href into our path template: drops the host and {?query}, renames tokens. */
export function normalizeHref(href: string): string | null {
  let path = href.replace(/^https?:\/\/[^/]+/, '').replace(/\{[?&].*$/, '');
  let ok = true;
  path = path.replace(/\{(\/?)([A-Za-z0-9_]+)\}/g, (_m, slash: string, name: string) => {
    const ours = TOKEN_NAMES[name];
    if (!ours) ok = false;
    return `${slash}{${ours ?? name}}`;
  });
  return ok ? path.replace(/^\/+/, '') : null;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_m, name: string) => {
    if (!(name in vars)) throw new Error(`Missing variable ${name} in ${template}`);
    return encodeURIComponent(vars[name]);
  });
}

// ---------------------------------------------------------------------------
// Conversion to the public types

function toAmount(q: Quantity): Amount {
  if (!q) return null;
  if (q.value) return { min: q.value, max: q.value };
  if (q.from && q.to) return { min: q.from, max: q.to };
  return null;
}

function quantityText(a: Amount): string {
  if (!a) return '';
  return a.min === a.max ? String(a.min) : `${a.min} - ${a.max}`;
}

function toIngredient(i: ItemJSON, recipeId?: string): ShoppingItem {
  const amount = toAmount(i.quantity);
  const unit = i.unitNotation ?? '';
  return {
    id: i.id,
    name: cleanIngredientName(i.ingredientNotation),
    detail: [quantityText(amount), unit].join(' ').trim(),
    isOwned: i.isOwned,
    amount,
    unit,
    recipeId,
  };
}

function toAdditional(a: AdditionalItemJSON): ShoppingItem {
  return { id: a.id, name: a.name, detail: '', isOwned: a.isOwned, amount: null, unit: '' };
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Client

export type CookidooOptions = {
  localization: Localization;
  /** Default: in memory (lost when the process exits). */
  tokenStore?: TokenStore;
  /** Default: WebCrypto. Required on React Native (see README). */
  crypto?: CryptoAdapter;
  /** Default: the global fetch. */
  fetch?: typeof fetch;
  userAgent?: string;
};

export class Cookidoo {
  readonly localization: Localization;
  private readonly session: Session;
  private readonly fetch: typeof fetch;
  private readonly userAgent: string;
  private queue: Promise<unknown> = Promise.resolve();
  private paths: Promise<Record<RelKey, string>> | null = null;
  /** True if some endpoint couldn't be discovered and the known fallback path was used. */
  usedFallbackPaths = false;

  constructor(options: CookidooOptions) {
    this.localization = options.localization;
    this.fetch = (input, init) => (options.fetch ?? globalThis.fetch)(input, init);
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    let crypto = options.crypto;
    this.session = new Session({
      localization: options.localization,
      store: options.tokenStore ?? memoryTokenStore(),
      // WebCrypto is only looked up at login time: reading data with stored tokens doesn't need it.
      crypto: {
        randomBytes: (n) => (crypto ??= webCrypto()).randomBytes(n),
        sha256: (d) => (crypto ??= webCrypto()).sha256(d),
      },
      fetch: this.fetch,
      userAgent: this.userAgent,
    });
  }

  // --- Session --------------------------------------------------------------

  /** Vorwerk login URL. Open it in a WebView/browser and wait for the redirect. */
  startLogin(): Promise<PendingLogin> {
    return this.session.startLogin();
  }

  /** `redirectUrl` is the com.vorwerk.cookidoo://code-grant?code=… URL Vorwerk redirects to. */
  finishLogin(pending: PendingLogin, redirectUrl: string): Promise<Tokens> {
    return this.session.finishLogin(pending, redirectUrl);
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.session.validTokens();
      return true;
    } catch (e) {
      if (e instanceof AuthRequiredError) return false;
      throw e;
    }
  }

  logout(): Promise<void> {
    return this.session.logout();
  }

  // --- Reading --------------------------------------------------------------

  async getShoppingList(): Promise<ShoppingList> {
    const p = await this.resolvePaths();
    const data = await this.getJson<PantryJSON>(fill(p.pantryHome, this.lang()));
    const allRecipes = [...(data.recipes ?? []), ...(data.customerRecipes ?? [])];
    return {
      recipes: allRecipes.map((r) => ({ id: r.id, name: r.title })),
      ingredients: allRecipes.flatMap((r) =>
        r.recipeIngredientGroups.map((i) => toIngredient(i, r.id)),
      ),
      additional: (data.additionalItems ?? []).map(toAdditional),
    };
  }

  /** Meal plan for the week containing `day`. */
  async getWeek(day = new Date()): Promise<WeekDay[]> {
    const p = await this.resolvePaths();
    const data = await this.getJson<{ myDays: CalendarDayJSON[] }>(
      fill(p.myWeek, { ...this.lang(), day: isoDate(day) }),
    );
    return (data.myDays ?? []).map((d) => ({
      day: d.dayKey ?? d.id,
      title: d.title,
      recipes: [...d.recipes, ...(d.customerRecipes ?? [])].map((r) => ({ id: r.id, name: r.title })),
    }));
  }

  // --- Writing (shopping list) ----------------------------------------------

  async setIngredientsOwned(changes: OwnershipChange[]): Promise<void> {
    if (changes.length === 0) return;
    const p = await this.resolvePaths();
    const ts = nowSeconds();
    await this.postJson(fill(p.ingredientsOwnership, this.lang()), {
      ingredients: changes.map((c) => ({ id: c.id, isOwned: c.isOwned, ownedTimestamp: ts })),
    });
  }

  async setAdditionalOwned(changes: OwnershipChange[]): Promise<void> {
    if (changes.length === 0) return;
    const p = await this.resolvePaths();
    const ts = nowSeconds();
    await this.postJson(fill(p.additionalOwnership, this.lang()), {
      additionalItems: changes.map((c) => ({ id: c.id, isOwned: c.isOwned, ownedTimestamp: ts })),
    });
  }

  /** Items are created unchecked (isOwned=false). Returns them with their new ids. */
  async addAdditionalItems(names: string[]): Promise<ShoppingItem[]> {
    if (names.length === 0) return [];
    const p = await this.resolvePaths();
    const res = await this.postJson<{ data?: AdditionalItemJSON[] } | null>(
      fill(p.additionalAdd, this.lang()),
      { itemsValue: names },
    );
    return (res?.data ?? []).map(toAdditional);
  }

  async renameAdditionalItem(id: string, name: string): Promise<void> {
    const p = await this.resolvePaths();
    await this.postJson(fill(p.additionalEdit, this.lang()), { additionalItems: [{ id, name }] });
  }

  async removeAdditionalItems(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const p = await this.resolvePaths();
    await this.postJson(fill(p.additionalRemove, this.lang()), { additionalItemIDs: ids });
  }

  // --- Internals ------------------------------------------------------------

  private lang() {
    return { language: this.localization.language };
  }

  /** Per-client queue: never more than one request to the Cookidoo API at a time. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Discovery runs once per client, through the queue like any other request. */
  private resolvePaths(): Promise<Record<RelKey, string>> {
    this.paths ??= this.serial(() => this.discoverPaths());
    return this.paths;
  }

  private async discoverPaths(): Promise<Record<RelKey, string>> {
    const out = {} as Record<RelKey, string>;
    const docs = new Map<string, Record<string, unknown> | null>();
    for (const key of Object.keys(RELS) as RelKey[]) {
      const { service, rel, fallback } = RELS[key];
      if (!docs.has(service)) {
        try {
          const r = await this.fetch(`${this.localization.apiEndpoint}/${service}/.well-known/home`, {
            headers: { Accept: 'application/json', 'User-Agent': this.userAgent },
          });
          docs.set(service, r.ok ? ((await r.json()) as Record<string, unknown>) : null);
        } catch {
          docs.set(service, null);
        }
      }
      const links = (docs.get(service)?._links ?? {}) as Record<string, unknown>;
      // HAL allows either a single link or a list of links per rel.
      const raw = links[rel] as HalLink | HalLink[] | undefined;
      const href = (Array.isArray(raw) ? raw[0] : raw)?.href;
      const normalized = typeof href === 'string' ? normalizeHref(href) : null;
      if (normalized) {
        out[key] = normalized;
      } else {
        out[key] = fallback;
        this.usedFallbackPaths = true;
      }
    }
    return out;
  }

  private sendJson<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    return this.serial(async () => {
      const url = `${this.localization.apiEndpoint}/${path}`;
      let tokens = await this.session.validTokens();
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await this.fetch(url, {
          method,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${tokens.accessToken}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (r.status === 401 && attempt === 0) {
          // A single refresh + retry. If it fails again, the user has to log in.
          tokens = await this.session.refresh(tokens);
          continue;
        }
        if (r.status === 401) throw new AuthRequiredError();
        if (!r.ok) throw new Error(`${method} ${path} → HTTP ${r.status}`);
        // Some endpoints (remove) reply with an empty body.
        const text = await r.text();
        return (text ? JSON.parse(text) : null) as T;
      }
      throw new AuthRequiredError();
    });
  }

  private getJson<T>(path: string): Promise<T> {
    return this.sendJson<T>('GET', path);
  }

  private postJson<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.sendJson<T>('POST', path, body);
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
