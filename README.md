# cookidoo-sdk-js

An **unofficial** JavaScript/TypeScript client for Cookidoo. The same code runs on **Node** and **React Native/Expo** (Expo Go included), with no runtime dependencies and no Node built-ins. Everything platform-specific (where tokens are stored, crypto, `fetch`) is passed in as an adapter.

> **What about the browser?** Not from a web page. The login ends in a redirect to `com.vorwerk.cookidoo://`, which a web page can't capture, and the API isn't meant to be called cross-origin (CORS). For a web app, run this client on your server.

> **What about [`cookidoo-api-js`](https://www.npmjs.com/package/cookidoo-api-js)?** It's a different port of cookidoo-api by another author. It covers more endpoints, but it imports Node's `crypto` and `fs`, so it doesn't run on React Native. If you only target Node, check it out too.

- OAuth 2 login with PKCE against Vorwerk's real login page. Your code never sees the password.
- Automatic token refresh, one at a time, because the server rotates the refresh token.
- Reads the user's account (email, name, country), community profile and subscription, the shopping list and the weekly meal plan.
- Writes to the shopping list: check/uncheck ingredients and additional items, and add, rename or remove additional items.
- **My recipes:** list, read, create, copy from a Cookidoo recipe, update and delete your own recipes, including Thermomix settings (time/temperature/speed, guided modes) linked to the step text.
- Shopping list helpers: a unified view that merges ingredients across recipes (ES/PT/EN synonyms, quantities added up per unit), a by-recipe view, and unchecked-first ordering.

> [!WARNING]
> **Unofficial.** This project is not affiliated with, endorsed by, or maintained by Vorwerk. Cookidoo® and Thermomix® are trademarks of Vorwerk. It uses a private API that may change or stop working without notice, and it identifies itself with the official Android app's `client_id`. Use it only with your own account, at your own risk, and respect Cookidoo's terms of service.

## Installation

```bash
npm install cookidoo-sdk-js
```

The package ships compiled JavaScript and type definitions, and has no runtime dependencies.

## Quick start (Node 22.18+)

```ts
import { Cookidoo, URUGUAY } from 'cookidoo-sdk-js';

const cookidoo = new Cookidoo({ localization: URUGUAY, tokenStore: myStore });

const list = await cookidoo.getShoppingList();
await cookidoo.setIngredientsOwned([{ id: list.ingredients[0].id, isOwned: true }]);
const [bread] = await cookidoo.addAdditionalItems(['bread']);
await cookidoo.removeAdditionalItems([bread.id]);
```

There's a complete command-line example in [`examples/cli.ts`](examples/cli.ts):

```bash
npm install
node examples/cli.ts login   # walks you through logging in with your browser
node examples/cli.ts list
node examples/cli.ts week
node examples/cli.ts recipes
node examples/cli.ts create-recipe examples/recipe.json
```

Tokens are stored in `.cookidoo-tokens.json`, readable only by your user and ignored by git. The refresh token grants access to your account, so don't share it.

## Login

Vorwerk only accepts the official app's redirect URI (`com.vorwerk.cookidoo://code-grant`), so the flow is:

1. `const pending = await cookidoo.startLogin()` returns the Vorwerk login URL.
2. Open that URL in a WebView or browser, and the user logs in there.
3. Vorwerk redirects to `com.vorwerk.cookidoo://code-grant?code=…&state=…`. Intercept that URL instead of opening it.
4. `await cookidoo.finishLogin(pending, redirectUrl)` exchanges the code for tokens and saves them to the `tokenStore`.

If a request throws `AuthRequiredError`, the session has expired and the user has to log in again. Other error statuses throw `CookidooHttpError`, with `status` and the response `body`.

## Expo / React Native

React Native doesn't ship WebCrypto, so you pass an adapter backed by `expo-crypto`. Tokens go to the Keychain/Keystore via `expo-secure-store`:

```bash
npx expo install expo-crypto expo-secure-store react-native-webview
```

```ts
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Cookidoo, URUGUAY, type TokenStore } from 'cookidoo-sdk-js';

const KEY = 'cookidoo.tokens.v1';
const OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

const tokenStore: TokenStore = {
  load: async () => {
    const raw = await SecureStore.getItemAsync(KEY, OPTS);
    return raw ? JSON.parse(raw) : null;
  },
  save: (t) => SecureStore.setItemAsync(KEY, JSON.stringify(t), OPTS),
  clear: () => SecureStore.deleteItemAsync(KEY, OPTS),
};

export const cookidoo = new Cookidoo({
  localization: URUGUAY,
  tokenStore,
  crypto: {
    randomBytes: (n) => Crypto.getRandomBytes(n),
    sha256: async (d) => new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, d)),
  },
});
```

For the login, use a WebView that intercepts the redirect:

```tsx
import { OAUTH_REDIRECT_URI } from 'cookidoo-sdk-js';

<WebView
  source={{ uri: pending.url }}
  incognito
  // The scheme must be whitelisted; otherwise react-native-webview hands it to
  // Linking.openURL and the official Cookidoo app opens instead.
  originWhitelist={['https://*', 'http://*', 'com.vorwerk.cookidoo://*']}
  onShouldStartLoadWithRequest={(req) => {
    if (req.url.startsWith(OAUTH_REDIRECT_URI)) {
      cookidoo.finishLogin(pending, req.url).then(onDone, onError);
      return false;
    }
    return true;
  }}
/>
```

This works in Expo Go (SDK 57).

## API

| Method | What it does |
|---|---|
| `startLogin()` / `finishLogin(pending, url)` | Login (see above) |
| `isLoggedIn()` / `logout()` | Session status and token removal |
| `getAccount()` | The Vorwerk account (OIDC userinfo): `{ id, email, emailVerified, name, givenName, familyName, username, picture, locale, country, createdAt }` |
| `getUserInfo()` | The Cookidoo community profile: `{ id, username, description, picture, isPublic }` |
| `getSubscription()` | The active subscription (`{ active, status, type, level, source, startDate, expires, … }`), or `null` |
| `getShoppingList()` | `{ recipes, ingredients, additional }` |
| `getWeek(day?)` | Meal plan for the week containing `day` |
| `setIngredientsOwned(changes)` | Checks/unchecks ingredients in a single POST |
| `setAdditionalOwned(changes)` | Checks/unchecks additional items in a single POST |
| `addAdditionalItems(names)` | Creates additional items and returns them with their ids |
| `renameAdditionalItem(id, name)` | Renames an additional item |
| `removeAdditionalItems(ids)` | Removes additional items |

| `listCustomRecipes()` / `getCustomRecipe(id)` | Your recipes in "My recipes" |
| `createCustomRecipe(recipe)` | Creates a recipe (see below) |
| `copyRecipeToCustom(recipeId, servingSize)` | Copies a Cookidoo recipe (e.g. `"r166987"`) into "My recipes" |
| `updateCustomRecipe(id, changes)` | Updates the given fields; the rest keep their value |
| `removeCustomRecipe(id)` | Deletes one of your recipes |

Shopping list helpers: `unifyIngredients`, `ingredientsByRecipe`, `pendingFirst`, `normalizeName`, `cleanIngredientName`, `sumAmounts`.

## My recipes

```ts
const recipe = await cookidoo.createCustomRecipe({
  name: 'Bread',
  ingredients: ['500 g flour', '300 g water', '10 g salt'],
  instructions: [
    {
      text: 'Add the flour and water, then knead 3 min.',
      annotations: [
        { type: 'INGREDIENT', slot: 'flour', description: '500 g flour' },
        { type: 'MODE', slot: 'knead 3 min', mode: 'dough', time: 180 },
      ],
    },
    'Let it rise for 1 hour and bake at 220 °C for 30 minutes.',
  ],
  servingSize: 12,
  unitText: 'slice', // Cookidoo only accepts its own units: 'portion', 'gram', 'slice'…
  activeTime: 600, // seconds
  totalTime: 6000,
  tools: ['TM6', 'TM7'],
});
```

- **Steps** are plain strings, or objects with `settings` (`time`, `temperature`, `speed`) and `annotations`.
- **Annotations** link a piece of the step's text (`slot`, which must appear in the text verbatim) to an ingredient (`INGREDIENT`, whose `description` must be one of `ingredients`), Thermomix settings (`TTS`: time in seconds, temperature, speed, direction) or a guided mode (`MODE`: dough, browning, steaming…). Annotations this library doesn't model come back as `OTHER` and are preserved when you update the recipe.
- **Yield units are a fixed list** on Cookidoo's side (`portion`, `gram`, `slice` have been seen in real recipes). Free text such as `"loaf"` is rejected with HTTP 400.
- **Everything is validated locally** before sending anything; errors are `RecipeValidationError`.
- **Creating takes 3 requests** (create an empty recipe, fill it in, reload it). If filling it in fails, you get an `IncompleteCustomRecipeError` with the `recipeId` of the empty recipe left in your account, so you can retry with `updateCustomRecipe` or delete it.
- **Updating also takes 3 requests** (load, save, reload). Leaving `image` out keeps your photo; `image` must be a customer-recipe path or filename, not a display URL. Uploading photos isn't supported.
- **Rate limit:** Cookidoo allows about 10 requests per minute on this service.

[`examples/recipe.json`](examples/recipe.json) is a complete example you can create with the CLI and then delete.

### Localization

`localizationFor(countryCode, language?)` returns the localization for any of the 54 countries in cookidoo-api's [`localization.json`](https://github.com/miaucl/cookidoo-api/blob/master/cookidoo_api/localization.json). Without `language` it uses the country's default; a language the country's site doesn't serve throws. `COUNTRIES` lists each country's site, languages and default language.

```ts
import { localizationFor } from 'cookidoo-sdk-js';

localizationFor('es');       // https://cookidoo.es, es-ES
localizationFor('ar');       // https://cookidoo.international, es
localizationFor('ch', 'fr-CH');
```

Countries without their own site (most of Latin America, Asia, the Middle East, the Nordics…) share `https://cookidoo.international`, which serves `en`, `fr`, `el`, `hu`, `id`, `pt-BR`, `ro`, `zh-Hans`, `es` and `vi`. `URUGUAY` is `localizationFor('uy')`.

Checked on 2026-09-30:

- Every site and site/language pair answers and endpoint discovery works on all of them.
- With a Uruguayan account, the shopping list, the week plan and "My recipes" work in all 10 languages of `cookidoo.international`.
- The same token also works on every other site, but the data is split in two: the European sites (`.at`, `.be`, `.ch`, `.cz`, `.de`, `.es`, `.fr`, `.co.uk`, `.it`, `.pl`, `.pt`, `.com.tr`) return the same shopping list as `cookidoo.international`, while `cookidoo.com.au`, `cookidoo.ca`, `cookidoo.mx` and `cookidoo.thermomix.com` return an empty one. Use the site of the user's own country, or they won't see their data.

Logging in and using the other countries with an account from that country hasn't been tested.

## Being a good API citizen

This is an unofficial API, so the client is deliberately conservative:

- **One request at a time:** each `Cookidoo` instance queues all its requests, so they never run in parallel.
- **Local validation first:** invalid recipes are rejected before any request is sent.
- **No retry loops:** on a 401 it refreshes once and retries once. If that fails too, it throws `AuthRequiredError`.
- **Discovered endpoints:** paths come from `.well-known/home`, once per instance. If an endpoint isn't found, the known path is used and `usedFallbackPaths` is set.

If you build a UI, batch taps (e.g. with a 1 s debounce) instead of sending one POST per tap, and don't reload more often than every 30 s.

## Development

```bash
npm install
npm test          # node:test, runs the TypeScript sources directly
npm run lint      # ESLint + typescript-eslint (strict, type-checked)
npm run typecheck
npm run build
```

## Credits

The authentication flow, endpoint discovery and API types are ported from [miaucl/cookidoo-api](https://github.com/miaucl/cookidoo-api) (Python, MIT). When something breaks, check that repo's recent commits to `const.py` and `well_known.py` first.

## License

MIT. See [LICENSE](LICENSE).
