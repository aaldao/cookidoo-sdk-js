import {
  OAUTH_CLIENT_ID,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPE,
  OIDC_DISCOVERY_URL,
  TOKEN_EXPIRY_MARGIN_S,
  type Localization,
} from './config.ts';
import { pkcePair, randomState, type CryptoAdapter } from './pkce.ts';

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds. */
  expiresAt: number;
};

/** The session is no longer valid: show the Vorwerk login again. */
export class AuthRequiredError extends Error {
  constructor(message = 'You need to log in to Cookidoo again.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

/** Cookidoo answered with an error status. `body` is the response text, which often says what was rejected. */
export class CookidooHttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(request: string, status: number, body: string) {
    const detail = body.trim().replace(/\s+/g, ' ').slice(0, 500);
    super(`${request} → HTTP ${String(status)}${detail ? `: ${detail}` : ''}`);
    this.name = 'CookidooHttpError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Where tokens are persisted. On a phone, use the Keychain/Keystore
 * (expo-secure-store); on Node, a file with 600 permissions or whatever you prefer.
 */
export type TokenStore = {
  load(): Promise<Tokens | null>;
  save(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
};

/** In memory only: lost when the process exits. */
export function memoryTokenStore(initial: Tokens | null = null): TokenStore {
  let tokens = initial;
  return {
    load: () => Promise.resolve(tokens),
    save: (t) => {
      tokens = t;
      return Promise.resolve();
    },
    clear: () => {
      tokens = null;
      return Promise.resolve();
    },
  };
}

export function isExpiring(t: Tokens, nowMs = Date.now()): boolean {
  return nowMs / 1000 >= t.expiresAt - TOKEN_EXPIRY_MARGIN_S;
}

export type PendingLogin = { url: string; verifier: string; state: string };

/** Reads code/state from com.vorwerk.cookidoo://code-grant?code=...&state=... */
export function parseRedirect(url: string): { code?: string; state?: string; error?: string } {
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const p = new URLSearchParams(q);
  return {
    code: p.get('code') ?? undefined,
    state: p.get('state') ?? undefined,
    error: p.get('error_description') ?? p.get('error') ?? undefined,
  };
}

function toTokens(payload: Record<string, unknown>, previousRefresh?: string): Tokens {
  const accessToken = payload.access_token;
  const refreshToken = (payload.refresh_token as string | undefined) ?? previousRefresh;
  if (typeof accessToken !== 'string' || !refreshToken) {
    throw new Error('Unexpected token response');
  }
  const expiresIn = Number(payload.expires_in ?? 43200);
  return { accessToken, refreshToken, expiresAt: Date.now() / 1000 + expiresIn };
}

type Oidc = { authorization_endpoint: string; token_endpoint: string };

export type SessionOptions = {
  localization: Localization;
  store: TokenStore;
  crypto: CryptoAdapter;
  fetch: typeof fetch;
  userAgent: string;
};

/** OAuth login (auth code + PKCE) against Vorwerk's CIAM, and token refresh. */
export class Session {
  private readonly opts: SessionOptions;
  private oidc: Promise<Oidc> | null = null;
  private refreshInFlight: Promise<Tokens> | null = null;

  constructor(opts: SessionOptions) {
    this.opts = opts;
  }

  private discovery(): Promise<Oidc> {
    this.oidc ??= (async () => {
      const r = await this.opts.fetch(OIDC_DISCOVERY_URL, {
        headers: { Accept: 'application/json', 'User-Agent': this.opts.userAgent },
      });
      if (!r.ok) throw new Error(`OIDC discovery failed (HTTP ${r.status})`);
      return (await r.json()) as Oidc;
    })().catch((e: unknown) => {
      this.oidc = null;
      throw e;
    });
    return this.oidc;
  }

  /** Builds the Vorwerk login URL. The user types their password there, never in your app. */
  async startLogin(): Promise<PendingLogin> {
    const oidc = await this.discovery();
    const { verifier, challenge } = await pkcePair(this.opts.crypto);
    const state = randomState(this.opts.crypto);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      market: this.opts.localization.countryCode,
      scope: OAUTH_SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ui_locales: this.opts.localization.language,
    });
    return { url: `${oidc.authorization_endpoint}?${params.toString()}`, verifier, state };
  }

  /** Exchanges the redirect's code for tokens and saves them to the store. */
  async finishLogin(pending: PendingLogin, redirectUrl: string): Promise<Tokens> {
    const { code, state, error } = parseRedirect(redirectUrl);
    if (error) throw new Error(`Vorwerk rejected the login: ${error}`);
    if (state !== pending.state) throw new Error('OAuth state mismatch');
    if (!code) throw new Error('The redirect has no authorization code');
    const tokens = toTokens(
      await this.tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: OAUTH_REDIRECT_URI,
        code_verifier: pending.verifier,
        client_id: OAUTH_CLIENT_ID,
      }),
    );
    await this.opts.store.save(tokens);
    return tokens;
  }

  async logout(): Promise<void> {
    await this.opts.store.clear();
  }

  /** Valid tokens (refreshed if about to expire). No session: AuthRequiredError. */
  async validTokens(): Promise<Tokens> {
    const t = await this.opts.store.load();
    if (!t) throw new AuthRequiredError();
    return isExpiring(t) ? this.refresh(t) : t;
  }

  /**
   * Refreshes only once even if several calls ask at the same time: the server
   * rotates the refresh token, so a second refresh with the old one would be rejected.
   * On an auth failure it clears the tokens and requires login (no retry loops).
   */
  refresh(current: Tokens): Promise<Tokens> {
    this.refreshInFlight ??= (async () => {
      try {
        const next = toTokens(
          await this.tokenRequest({
            grant_type: 'refresh_token',
            refresh_token: current.refreshToken,
            client_id: OAUTH_CLIENT_ID,
          }),
          current.refreshToken,
        );
        await this.opts.store.save(next);
        return next;
      } catch (e) {
        if (e instanceof AuthRequiredError) await this.opts.store.clear();
        throw e;
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  private async tokenRequest(body: Record<string, string>): Promise<Record<string, unknown>> {
    const oidc = await this.discovery();
    const r = await this.opts.fetch(oidc.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': this.opts.userAgent,
      },
      body: new URLSearchParams(body).toString(),
    });
    if (!r.ok) {
      // 400/401 from the token endpoint = invalid code or refresh token.
      if (r.status === 400 || r.status === 401) throw new AuthRequiredError();
      throw new Error(`Token endpoint returned HTTP ${r.status}`);
    }
    return (await r.json()) as Record<string, unknown>;
  }
}
