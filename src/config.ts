/**
 * Cookidoo constants.
 *
 * Everything Vorwerk may change without notice lives here. Values taken from
 * miaucl/cookidoo-api (cookidoo_api/const.py and localization.json).
 */

export const CIAM_BASE_URL = 'https://ciam.prod.cookidoo.vorwerk-digital.com';
export const OIDC_DISCOVERY_URL = `${CIAM_BASE_URL}/.well-known/openid-configuration`;

/** Public client of the official Android app (auth code + PKCE, no secret). */
export const OAUTH_CLIENT_ID = 'mobile-android';
export const OAUTH_REDIRECT_URI = 'com.vorwerk.cookidoo://code-grant';
export const OAUTH_SCOPE = 'openid profile email offline offline_access';

/** Refresh a bit before the access token expires (it lasts ~12 h). */
export const TOKEN_EXPIRY_MARGIN_S = 300;

export type Localization = {
  /** Market, e.g. "uy". */
  countryCode: string;
  /** API language, e.g. "es". */
  language: string;
  /** The country's Cookidoo site, e.g. "https://cookidoo.international". */
  apiEndpoint: string;
};

/**
 * Uruguay uses the "international" site in Spanish. For other countries, look up
 * the matching row in localization.json from miaucl/cookidoo-api.
 */
export const URUGUAY: Localization = {
  countryCode: 'uy',
  language: 'es',
  apiEndpoint: 'https://cookidoo.international',
};

/**
 * Cloudflare sits in front of the login and discovery endpoints; a browser
 * User-Agent reduces 403s (see cookidoo-api issue #230).
 */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
