# Changelog

## 0.3.0

- **All countries:** `localizationFor(countryCode, language?)` and `COUNTRIES` cover the 54 countries in cookidoo-api's localization.json, each with its site, languages and a default language. Every site and site/language pair was checked (they answer and endpoint discovery works). With a Uruguayan account, reads work in all 10 languages of the international site; on other sites the token works too, but Australia, Canada, Mexico and the US keep their data separately (an empty list there), so use the user's own country. Logging in from other countries hasn't been tested. `URUGUAY` is still exported.

## 0.2.2

- `unitText` is typed as `YieldUnit`: Cookidoo only accepts a fixed list of yield units and rejects free text with HTTP 400 (found in the first real test, which used "pan"). Known values: `portion`, `gram`, `slice`. The README and `examples/recipe.json` used "loaf" and are fixed.
- Verified against a real account (Uruguay, 2026-09-29) from React Native/Expo Go: list, get, copy, delete, and create/update both a plain recipe and one with ingredient, TTS (time/temperature/speed) and MODE (dough) annotations.

## 0.2.1

- HTTP errors are now `CookidooHttpError`, with `status` and the response `body`; the message includes what Cookidoo answered, which usually says which field was rejected.

## 0.2.0

- **My recipes:** `listCustomRecipes`, `getCustomRecipe`, `createCustomRecipe`, `copyRecipeToCustom`, `updateCustomRecipe` and `removeCustomRecipe`, with typed steps, Thermomix settings and annotations. Ported from cookidoo-api.
- Endpoint discovery now matches cookidoo-api: path variables are mapped by position, so endpoints with ids (`{id}`, `{recipeId}`) are discovered instead of falling back to the known path. `normalizeHref(href, shape)` takes the expected template as a second argument.
- The CLI example can list, show, create and delete recipes.

## 0.1.0

- OAuth + PKCE login, token refresh, shopping list and weekly plan (read), shopping list writes, shopping list helpers.
