# Changelog

## 0.2.1

- HTTP errors are now `CookidooHttpError`, with `status` and the response `body`; the message includes what Cookidoo answered, which usually says which field was rejected.
- Known issue: in the first real test, `createCustomRecipe` got HTTP 400 on the PATCH that fills in the recipe (listing, reading, copying and deleting worked). Under investigation.

## 0.2.0

- **My recipes:** `listCustomRecipes`, `getCustomRecipe`, `createCustomRecipe`, `copyRecipeToCustom`, `updateCustomRecipe` and `removeCustomRecipe`, with typed steps, Thermomix settings and annotations. Ported from cookidoo-api.
- Endpoint discovery now matches cookidoo-api: path variables are mapped by position, so endpoints with ids (`{id}`, `{recipeId}`) are discovered instead of falling back to the known path. `normalizeHref(href, shape)` takes the expected template as a second argument.
- The CLI example can list, show, create and delete recipes.

## 0.1.0

- OAuth + PKCE login, token refresh, shopping list and weekly plan (read), shopping list writes, shopping list helpers.
