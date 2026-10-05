import {
  AuthRequiredError,
  CookidooHttpError,
  memoryTokenStore,
  Session,
  type PendingLogin,
  type TokenStore,
  type Tokens,
} from './auth.ts';
import { DEFAULT_USER_AGENT, type Localization } from './config.ts';
import { webCrypto, type CryptoAdapter } from './pkce.ts';
import {
  appendImageFile,
  buildCustomRecipePayload,
  imageForPayload,
  IncompleteCustomRecipeError,
  isCustomerImageUrl,
  parseCustomRecipe,
  RecipeValidationError,
  validateImage,
  validateRecipeImage,
  type CustomRecipe,
  type CustomRecipeUpdate,
  type NewCustomRecipe,
  type RecipeImage,
} from './recipes.ts';
import { cleanIngredientName } from './shopping.ts';
import type {
  Account,
  Amount,
  OwnershipChange,
  ShoppingItem,
  ShoppingList,
  Subscription,
  UserInfo,
  WeekDay,
} from './types.ts';

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

type CommunityProfileJSON = {
  id?: unknown;
  isPublic?: unknown;
  userInfo?: { username?: unknown; description?: unknown; picture?: unknown };
};

/** OIDC userinfo, plus Vorwerk's own fields. */
type AccountJSON = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  preferred_username?: unknown;
  picture?: unknown;
  locale?: unknown;
  createdTime?: unknown;
  customFields?: { country_of_residence?: unknown };
};

type SubscriptionJSON = {
  active?: unknown;
  status?: unknown;
  type?: unknown;
  extendedType?: unknown;
  subscriptionLevel?: unknown;
  subscriptionSource?: unknown;
  startDate?: unknown;
  expires?: unknown;
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
  userProfile: {
    service: 'community/profile',
    rel: 'community-profile:user-private-profile',
    fallback: 'community/profile/{language}',
  },
  subscriptions: {
    service: 'ownership',
    rel: 'ownership:subscriptions',
    fallback: 'ownership/subscriptions',
  },
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
  recipeDetails: {
    service: 'recipes/recipe',
    rel: 'recipe:details',
    fallback: 'recipes/recipe/{language}/{id}',
  },
  customRecipes: {
    service: 'created-recipes',
    rel: 'customer-recipes:recipe-create',
    fallback: 'created-recipes/{language}',
  },
  customRecipe: {
    service: 'created-recipes',
    rel: 'customer-recipes:recipe-details',
    fallback: 'created-recipes/{language}/{id}',
  },
} as const;
type RelKey = keyof typeof RELS;
type HalLink = { href?: unknown };

/**
 * Cookidoo's token names, mapped to the names of ours they may stand for. A
 * known token must line up with one of them; an unknown one is substituted by
 * position (same rules as well_known.py in cookidoo-api).
 */
const TOKEN_ALIASES: Record<string, string[]> = {
  lang: ['language', 'locale'],
  id: ['id'],
  dayKey: ['day'],
  recipeId: ['recipe'],
};
const TOKEN_RE = /\{(\/?)([A-Za-z0-9_]+)\}/g;

/**
 * Turns a discovered HAL href into our template `shape`: keeps the live path
 * segments, drops the host and {?query}, and uses our variable names. Returns
 * null if the variables don't line up with the shape.
 */
export function normalizeHref(href: string, shape: string): string | null {
  const path = href.replace(/^https?:\/\/[^/]+/, '').replace(/\{[?&].*$/, '');
  const ours = [...shape.matchAll(TOKEN_RE)].map((m) => m[2]);
  const theirs = [...path.matchAll(TOKEN_RE)].map((m) => m[2]);
  if (ours.length !== theirs.length) return null;
  if (theirs.some((name, i) => TOKEN_ALIASES[name] && !TOKEN_ALIASES[name].includes(ours[i]))) {
    return null;
  }
  let i = 0;
  return path.replace(TOKEN_RE, (_m, slash: string) => `${slash}{${ours[i++]}}`).replace(/^\/+/, '');
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

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

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

  /** The user's Cookidoo community profile: username, description and picture. */
  async getUserInfo(): Promise<UserInfo> {
    const p = await this.resolvePaths();
    const data = await this.getJson<CommunityProfileJSON | null>(fill(p.userProfile, this.lang()));
    const info = data?.userInfo;
    if (typeof data?.id !== 'string' || typeof info?.username !== 'string') {
      throw new Error('Unexpected user info response');
    }
    return {
      id: data.id,
      username: info.username,
      description: str(info.description),
      picture: str(info.picture),
      isPublic: data.isPublic === true,
    };
  }

  /** The Vorwerk account behind the login (OIDC userinfo): email, name, country… */
  async getAccount(): Promise<Account> {
    const url = await this.serial(() => this.session.userInfoEndpoint());
    const data = await this.getJson<AccountJSON | null>(url);
    if (typeof data?.sub !== 'string' || typeof data.email !== 'string') {
      throw new Error('Unexpected account response');
    }
    return {
      id: data.sub,
      email: data.email,
      emailVerified: data.email_verified === true,
      name: str(data.name),
      givenName: str(data.given_name),
      familyName: str(data.family_name),
      username: str(data.preferred_username),
      picture: str(data.picture),
      locale: str(data.locale),
      country: str(data.customFields?.country_of_residence),
      createdAt: str(data.createdTime),
    };
  }

  /** The active Cookidoo subscription, or null if there is none. */
  async getSubscription(): Promise<Subscription | null> {
    const p = await this.resolvePaths();
    const data = await this.getJson<unknown>(fill(p.subscriptions, this.lang()));
    if (!Array.isArray(data)) throw new Error('Unexpected subscription response');
    const s = (data as (SubscriptionJSON | null)[]).find((x) => x?.active === true);
    if (!s) return null;
    return {
      active: true,
      status: str(s.status) ?? '',
      type: str(s.type) ?? '',
      extendedType: str(s.extendedType),
      level: str(s.subscriptionLevel) ?? '',
      source: str(s.subscriptionSource) ?? '',
      startDate: str(s.startDate),
      expires: str(s.expires),
    };
  }

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

  // --- My recipes (custom recipes) -------------------------------------------
  // Note: Cookidoo rate-limits this service (10 requests per minute observed).

  async listCustomRecipes(): Promise<CustomRecipe[]> {
    const p = await this.resolvePaths();
    const res = await this.getJson<{ items?: unknown }>(fill(p.customRecipes, this.lang()), CUSTOM_RECIPE_ACCEPT);
    if (!Array.isArray(res.items)) throw new Error('Unexpected custom recipe list response');
    return res.items.map((r) => this.toCustomRecipe(r));
  }

  async getCustomRecipe(id: string): Promise<CustomRecipe> {
    const p = await this.resolvePaths();
    return this.toCustomRecipe(
      await this.getJson(fill(p.customRecipe, { ...this.lang(), id }), CUSTOM_RECIPE_ACCEPT),
    );
  }

  /**
   * Creates a recipe in "My recipes" (3 requests: create an empty recipe, fill
   * it in, reload it). Validates everything locally first. If filling in fails
   * after the empty recipe exists, throws IncompleteCustomRecipeError with its id.
   */
  async createCustomRecipe(recipe: NewCustomRecipe): Promise<CustomRecipe> {
    validateImage(recipe.image);
    const payload = buildCustomRecipePayload({
      name: recipe.name,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      servingSize: recipe.servingSize,
      activeTime: recipe.activeTime,
      totalTime: recipe.totalTime,
      tools: recipe.tools?.length ? recipe.tools : ['TM7'],
      unitText: recipe.unitText ?? 'portion',
      image: recipe.image ?? null,
      imageOwnedByUser: recipe.image !== undefined,
      hints: recipe.hints ?? [],
      workStatus: recipe.workStatus ?? 'PRIVATE',
      requiresAnnotationsCheck: recipe.requiresAnnotationsCheck ?? false,
    });
    const p = await this.resolvePaths();
    const created = await this.postJson<{ recipeId?: unknown } | null>(fill(p.customRecipes, this.lang()), {
      recipeName: recipe.name,
    });
    const id = created?.recipeId;
    if (typeof id !== 'string' || !id) throw new Error('No recipe id returned when creating the recipe');
    try {
      await this.sendJson('PATCH', fill(p.customRecipe, { ...this.lang(), id }), payload);
      return await this.getCustomRecipe(id);
    } catch (e) {
      throw new IncompleteCustomRecipeError(id, e);
    }
  }

  /** Copies a Cookidoo recipe (e.g. "r166987") into "My recipes" so you can edit it. */
  async copyRecipeToCustom(recipeId: string, servingSize: number): Promise<CustomRecipe> {
    const p = await this.resolvePaths();
    const recipeUrl = `${this.localization.apiEndpoint}/${fill(p.recipeDetails, { ...this.lang(), id: recipeId })}`;
    return this.toCustomRecipe(
      await this.postJson(fill(p.customRecipes, this.lang()), { recipeUrl, servingSize }),
    );
  }

  /**
   * Updates the given fields; the rest keep their current value (3 requests:
   * load, save, reload). Leaving `image` out keeps the current photo.
   */
  async updateCustomRecipe(id: string, changes: CustomRecipeUpdate): Promise<CustomRecipe> {
    validateImage(changes.image);
    const current = await this.getCustomRecipe(id);
    const image = changes.image ?? current.image;
    // A photo the user uploaded only survives if its path can be recovered from the
    // display URL. (A Vorwerk photo on a copied recipe can't be sent back, and is dropped.)
    if (changes.image === undefined && image !== null && isCustomerImageUrl(image) && imageForPayload(image) === null) {
      throw new RecipeValidationError('Cannot preserve the existing custom recipe image.');
    }
    const payload = buildCustomRecipePayload({
      name: changes.name ?? current.name,
      ingredients: changes.ingredients ?? current.ingredients,
      instructions: changes.instructions ?? current.instructions,
      servingSize: changes.servingSize ?? current.servingSize,
      activeTime: changes.activeTime ?? current.activeTime,
      totalTime: changes.totalTime ?? current.totalTime,
      tools: changes.tools ?? current.tools,
      unitText: changes.unitText ?? current.unitText,
      image,
      imageOwnedByUser:
        changes.imageOwnedByUser ?? (changes.image !== undefined ? true : current.imageOwnedByUser),
      hints: changes.hints ?? current.hints,
      workStatus: changes.workStatus ?? current.workStatus,
      requiresAnnotationsCheck: changes.requiresAnnotationsCheck ?? current.requiresAnnotationsCheck,
    });
    const p = await this.resolvePaths();
    await this.sendJson('PATCH', fill(p.customRecipe, { ...this.lang(), id }), payload);
    return this.getCustomRecipe(id);
  }

  /**
   * Uploads a photo and sets it as the recipe's image, like the Cookidoo
   * website does: Cookidoo signs the upload, the file goes to Vorwerk's
   * Cloudinary account, and a PATCH sets the stored path on the recipe
   * (2 requests to Cookidoo, plus a reload if the PATCH doesn't answer with the
   * recipe). The photo is validated locally first; if the signature or the
   * upload fails, the recipe isn't touched.
   *
   * `ownedByUser` declares that the user owns the photo's rights. The website
   * sends false for private recipes and asks for it before sharing publicly.
   * Default: false.
   */
  async uploadCustomRecipeImage(
    recipeId: string,
    image: RecipeImage,
    options: { ownedByUser?: boolean } = {},
  ): Promise<CustomRecipe> {
    if (typeof recipeId !== 'string' || !recipeId.trim()) {
      throw new RecipeValidationError('The recipe id must not be empty.');
    }
    validateRecipeImage(image);
    const p = await this.resolvePaths();
    // Cookidoo signs exactly these parameters; Cloudinary must receive the same ones.
    const signed = { timestamp: nowSeconds(), source: 'uw' };
    const res = await this.postJson<{ signature?: unknown } | null>(
      `${fill(p.customRecipes, this.lang())}/image/signature`,
      signed,
    );
    const signature = res?.signature;
    if (typeof signature !== 'string' || !signature) throw new Error('Unexpected image signature response');
    const path = await this.uploadToCloudinary(image, { ...signed, signature });
    const recipePath = fill(p.customRecipe, { ...this.lang(), id: recipeId });
    const patched = await this.sendJson<unknown>('PATCH', recipePath, {
      image: path,
      isImageOwnedByUser: options.ownedByUser ?? false,
    });
    // The PATCH answers with the full recipe; reload it only if it didn't.
    try {
      return this.toCustomRecipe(patched);
    } catch {
      return this.getCustomRecipe(recipeId);
    }
  }

  /** Sends the photo to Vorwerk's Cloudinary account (queued, without the Cookidoo token). */
  private uploadToCloudinary(image: RecipeImage, signed: Record<string, string | number>): Promise<string> {
    return this.serial(async () => {
      const form = new FormData();
      form.append('api_key', CLOUDINARY_API_KEY);
      for (const [key, value] of Object.entries(signed)) form.append(key, String(value));
      form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      appendImageFile(form, image);
      // No Content-Type: fetch sets multipart/form-data with its boundary.
      const r = await this.fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: form });
      const text = await r.text().catch(() => '');
      // A 401 here is about the signature, not the Cookidoo session: no refresh.
      if (!r.ok) throw new CookidooHttpError('POST Cloudinary image upload', r.status, text);
      const body = parseJsonOrNull(text) as { public_id?: unknown; format?: unknown } | null;
      const path =
        typeof body?.public_id === 'string' && typeof body.format === 'string'
          ? `${body.public_id}.${body.format}`
          : null;
      if (path === null || imageForPayload(path) !== path) throw new Error('Unexpected image upload response');
      return path;
    });
  }

  async removeCustomRecipe(id: string): Promise<void> {
    const p = await this.resolvePaths();
    await this.sendJson('DELETE', fill(p.customRecipe, { ...this.lang(), id }));
  }

  private toCustomRecipe(json: unknown): CustomRecipe {
    return parseCustomRecipe(json, this.localization.apiEndpoint, this.localization.language);
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
      const normalized = typeof href === 'string' ? normalizeHref(href, fallback) : null;
      if (normalized) {
        out[key] = normalized;
      } else {
        out[key] = fallback;
        this.usedFallbackPaths = true;
      }
    }
    return out;
  }

  private sendJson<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    accept = 'application/json',
  ): Promise<T> {
    return this.serial(async () => {
      const url = /^https?:\/\//.test(path) ? path : `${this.localization.apiEndpoint}/${path}`;
      let tokens = await this.session.validTokens();
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await this.fetch(url, {
          method,
          headers: {
            Accept: accept,
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
        if (!r.ok) throw new CookidooHttpError(`${method} ${path}`, r.status, await r.text().catch(() => ''));
        // Some endpoints (remove, PATCH) reply with an empty body.
        const text = await r.text();
        return (text ? JSON.parse(text) : null) as T;
      }
      throw new AuthRequiredError();
    });
  }

  private getJson<T>(path: string, accept?: string): Promise<T> {
    return this.sendJson<T>('GET', path, undefined, accept);
  }

  private postJson<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.sendJson<T>('POST', path, body);
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Vorwerk's Cloudinary account for photos in "My recipes". These are public
// values: the Cookidoo website's upload widget sends them from the browser.
const CLOUDINARY_UPLOAD_URL = 'https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload';
const CLOUDINARY_API_KEY = '993585863591145';
const CLOUDINARY_UPLOAD_PRESET = 'prod-customer-recipe-signed';

/** The created-recipes service only returns full recipes with this media type. */
const CUSTOM_RECIPE_ACCEPT = 'application/vnd.vorwerk.customer-recipe.full+json';
