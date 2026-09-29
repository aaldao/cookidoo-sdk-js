/**
 * Command-line example (Node 22.18+):
 *
 *   node examples/cli.ts login      # log in with your browser, stores tokens in .cookidoo-tokens.json
 *   node examples/cli.ts list       # shopping list
 *   node examples/cli.ts week       # this week's meal plan
 *   node examples/cli.ts add bread  # add an additional item
 *   node examples/cli.ts logout
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';

import {
  AuthRequiredError,
  Cookidoo,
  URUGUAY,
  unifyIngredients,
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
  console.error(
    e instanceof AuthRequiredError ? 'Not logged in: run `node examples/cli.ts login` first.' : e.message,
  );
  process.exit(1);
});

// Change URUGUAY to your own country's localization (see README).
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
  case 'logout':
    await cookidoo.logout();
    console.log('Tokens deleted.');
    break;
  default:
    console.log('Usage: node examples/cli.ts login | list | week | add <name> | logout');
}
