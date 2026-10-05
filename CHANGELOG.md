# Changelog

## 0.5.1

- **Expo SDK 57 photo uploads:** `uploadCustomRecipeImage` accepts any Blob-like `data` (an object with `size` and `arrayBuffer()` that doesn't extend the global `Blob`), such as an `expo-file-system` `File`, and sends it as it is. Expo's `fetch` can't upload React Native's `{ uri }` form parts ("Unsupported FormDataPart implementation"), found from Expo Go on a real account; the README now recommends `new File(asset.uri)` for Expo, and `uri` only for React Native's own `fetch`.

## 0.5.0

- **Recipe photos:** `uploadCustomRecipeImage(recipeId, image, { ownedByUser? })` uploads a JPEG or PNG (up to 10 MB) and sets it on a recipe in "My recipes", returning the updated recipe. Same flow as the Cookidoo website, reverse-engineered by other projects: Cookidoo signs the upload, the file goes to Vorwerk's Cloudinary account, and a PATCH sets the stored path. In Node pass the bytes (`data`); in React Native/Expo pass the file `uri` (e.g. from expo-image-picker). Validated locally first (`RecipeValidationError`); a failed signature or upload leaves the recipe untouched.
- `imageOwnedByUser` is now read from `isImageCopyrightOwned`, the name Cookidoo uses in its responses, so `updateCustomRecipe` keeps it instead of resetting it to false.
- `updateCustomRecipe` refuses (`RecipeValidationError`) to drop a photo you uploaded if its path can't be recovered; a Vorwerk photo on a copied recipe is still dropped, as before.
- The CLI example has `upload-image <recipeId> <photo>`.
- Verified on a real account (Uruguay, 2026-10-04): create a recipe, upload a 1200×900 JPEG, read it back (photo and thumbnail served from `ugc.assets.tmecosys.com` with HTTP 200, `imageOwnedByUser` false), rename it with `updateCustomRecipe` (photo and flag kept) and delete it. The real flow matched the implementation, so no code changes were needed.

## 0.4.0

- `getAccount()` returns the Vorwerk account from the OIDC userinfo endpoint: email, name, username, picture, locale, country of residence and creation date (`Account`).
- `getUserInfo()` returns the Cookidoo community profile: `id`, `username`, `description`, `picture` and `isPublic` (`UserInfo`). Ported from cookidoo-api.
- `getSubscription()` returns the active subscription (level, status, start and expiry dates), or `null` (`Subscription`). Ported from cookidoo-api.
- Endpoint discovery now also reads `community/profile` and `ownership`.

## 0.3.1

- **Published on npm** as `cookidoo-sdk-js` (`npm install cookidoo-sdk-js`). Installing from GitHub is no longer needed. No code changes since 0.3.0.

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
