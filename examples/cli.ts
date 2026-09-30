/**
 * Command-line example (Node 22.18+):
 *
 *   node examples/cli.ts login      # log in with your browser, stores tokens in .cookidoo-tokens.json
 *   node examples/cli.ts list       # shopping list
 *   node examples/cli.ts week       # this week's meal plan
 *   node examples/cli.ts add bread  # add an additional item
 *   node examples/cli.ts recipes    # "My recipes"
 *   node examples/cli.ts recipe <id>
 *   node examples/cli.ts create-recipe examples/recipe.json
 *   node examples/cli.ts delete-recipe <id>
 *   node examples/cli.ts logout
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';

import {
  AuthRequiredError,
  Cookidoo,
  IncompleteCustomRecipeError,
  URUGUAY,
  unifyIngredients,
  type NewCustomRecipe,
  type TokenStore,
  type Tokens,
} from '../src/index.ts';

const TOKENS_FILE = '.cookidoo-tokens.json';

/** A file only your user can read. Careful: the refresh token grants access to your account. */
const fileStore: TokenStore = {
  async load() {
    try {
      return JSON.parse(await readFile(TOKENS_FILE, 'utf8')) as Tokens;
    } catch {
      return null;
    }
  },
  save: (t) => writeFile(TOKENS_FILE, JSON.stringify(t), { mode: 0o600 }),
  clear: () => rm(TOKENS_FILE, { force: true }),
};

process.on('uncaughtException', (e) => {
  if (e instanceof AuthRequiredError) console.error('Not logged in: run `node examples/cli.ts login` first.');
  else if (e instanceof IncompleteCustomRecipeError)
    console.error(`${e.message} (${String(e.cause)}). Delete it with: node examples/cli.ts delete-recipe ${e.recipeId}`);
  else console.error(e.message);
  process.exit(1);
});

const minutes = (s: number) => `${String(Math.round(s / 60))} min`;

// Change URUGUAY to your own country, e.g. localizationFor('es') (see README).
const cookidoo = new Cookidoo({ localization: URUGUAY, tokenStore: fileStore });
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'login': {
    const pending = await cookidoo.startLogin();
    console.log('1. Open your browser, open DevTools on the Network tab and enable "Preserve log".');
    console.log('2. Go to this URL and log in:\n');
    console.log(pending.url);
    console.log('\n3. At the end the browser tries to open com.vorwerk.cookidoo://code-grant?code=…');
    console.log('   and nothing happens. In Network, find the 302 response whose Location header');
    console.log('   starts with com.vorwerk.cookidoo:// and paste it here (the code expires in a few minutes).\n');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const redirect = (await rl.question('Redirect URL: ')).trim();
    rl.close();
    await cookidoo.finishLogin(pending, redirect);
    console.log(`Done, tokens saved to ${TOKENS_FILE}.`);
    break;
  }
  case 'me': {
    const account = await cookidoo.getAccount();
    const profile = await cookidoo.getUserInfo();
    const sub = await cookidoo.getSubscription();
    console.log(`${account.name ?? account.username ?? '—'} <${account.email}> (${account.country ?? '?'})`);
    console.log(`Community profile: ${profile.username}${profile.isPublic ? ' (public)' : ''}`);
    console.log(sub ? `Subscription: ${sub.level}, expires ${sub.expires?.slice(0, 10) ?? '?'}` : 'No active subscription');
    break;
  }
  case 'list': {
    const list = await cookidoo.getShoppingList();
    for (const r of unifyIngredients(list.ingredients)) {
      console.log(`${r.isOwned ? '☑' : '☐'} ${r.name}${r.detail ? ` · ${r.detail}` : ''}`);
    }
    for (const a of list.additional) console.log(`${a.isOwned ? '☑' : '☐'} ${a.name} (additional)`);
    break;
  }
  case 'week': {
    for (const d of await cookidoo.getWeek()) {
      console.log(`${d.day}: ${d.recipes.map((r) => r.name).join(', ') || '—'}`);
    }
    break;
  }
  case 'add': {
    const created = await cookidoo.addAdditionalItems([args.join(' ')]);
    console.log(`Added: ${created.map((c) => c.name).join(', ')}`);
    break;
  }
  case 'recipes': {
    for (const r of await cookidoo.listCustomRecipes()) {
      console.log(`${r.id}  ${r.name} (${String(r.servingSize)} ${r.unitText}, ${minutes(r.totalTime)})`);
    }
    break;
  }
  case 'recipe': {
    const r = await cookidoo.getCustomRecipe(args[0]);
    console.log(`${r.name}\n${r.url}\n`);
    console.log(`${String(r.servingSize)} ${r.unitText} · ${minutes(r.activeTime)} active · ${minutes(r.totalTime)} total · ${r.tools.join(', ')}\n`);
    for (const i of r.ingredients) console.log(`- ${i}`);
    console.log();
    r.instructions.forEach((step, n) => {
      console.log(`${String(n + 1)}. ${typeof step === 'string' ? step : step.text}`);
    });
    if (r.hints.length) console.log(`\nHints:\n${r.hints.join('\n')}`);
    break;
  }
  case 'create-recipe': {
    const recipe = JSON.parse(await readFile(args[0], 'utf8')) as NewCustomRecipe;
    const created = await cookidoo.createCustomRecipe(recipe);
    console.log(`Created ${created.id}: ${created.url}`);
    break;
  }
  case 'delete-recipe':
    await cookidoo.removeCustomRecipe(args[0]);
    console.log('Recipe deleted.');
    break;
  case 'logout':
    await cookidoo.logout();
    console.log('Tokens deleted.');
    break;
  default:
    console.log(
      'Usage: node examples/cli.ts login | me | list | week | add <name> | recipes | recipe <id> |\n' +
        '       create-recipe <file.json> | delete-recipe <id> | logout',
    );
}
