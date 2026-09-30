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

export type CountrySite = {
  /** The country's Cookidoo site. */
  apiEndpoint: string;
  /** Languages the site serves. */
  languages: readonly string[];
  /** Used by `localizationFor` when no language is given. */
  defaultLanguage: string;
};

/** Languages of https://cookidoo.international, shared by every country without its own site. */
const INTERNATIONAL_LANGUAGES = ['en', 'fr', 'el', 'hu', 'id', 'pt-BR', 'ro', 'zh-Hans', 'es', 'vi'] as const;

const intl = (defaultLanguage: (typeof INTERNATIONAL_LANGUAGES)[number]): CountrySite => ({
  apiEndpoint: 'https://cookidoo.international',
  languages: INTERNATIONAL_LANGUAGES,
  defaultLanguage,
});

/**
 * Every country in cookidoo-api's localization.json, keyed by country code.
 * Checked on 2026-09-30: every site and site/language pair answers, and
 * endpoint discovery works on every site. A Uruguayan account reads its data
 * in every international language and on every European site; au, ca, mx and
 * us keep their data separately. Other countries' logins are untested.
 *
 * Default language: the country's main language when its site serves it,
 * otherwise English. On be/ch/ca it matches the language the site opens in.
 */
const SITES = {
  ae: intl('en'),
  ar: intl('es'),
  at: { apiEndpoint: 'https://cookidoo.at', languages: ['de-AT'], defaultLanguage: 'de-AT' },
  au: { apiEndpoint: 'https://cookidoo.com.au', languages: ['en-AU'], defaultLanguage: 'en-AU' },
  be: { apiEndpoint: 'https://cookidoo.be', languages: ['nl-BE', 'en', 'fr-BE', 'de-BE'], defaultLanguage: 'nl-BE' },
  bn: intl('en'),
  br: intl('pt-BR'),
  ca: { apiEndpoint: 'https://cookidoo.ca', languages: ['en-CA', 'fr-CA'], defaultLanguage: 'en-CA' },
  ch: { apiEndpoint: 'https://cookidoo.ch', languages: ['en', 'fr-CH', 'de-CH', 'it-CH'], defaultLanguage: 'de-CH' },
  cl: intl('es'),
  co: intl('es'),
  cy: intl('el'),
  cz: { apiEndpoint: 'https://cookidoo.cz', languages: ['cs'], defaultLanguage: 'cs' },
  de: { apiEndpoint: 'https://cookidoo.de', languages: ['de-DE'], defaultLanguage: 'de-DE' },
  dk: intl('en'),
  ee: intl('en'),
  es: { apiEndpoint: 'https://cookidoo.es', languages: ['es-ES'], defaultLanguage: 'es-ES' },
  fr: { apiEndpoint: 'https://cookidoo.fr', languages: ['fr-FR'], defaultLanguage: 'fr-FR' },
  gb: { apiEndpoint: 'https://cookidoo.co.uk', languages: ['en-GB'], defaultLanguage: 'en-GB' },
  gr: intl('el'),
  gt: intl('es'),
  hu: intl('hu'),
  id: intl('id'),
  ie: { apiEndpoint: 'https://cookidoo.co.uk', languages: ['en-GB'], defaultLanguage: 'en-GB' },
  il: intl('en'),
  is: intl('en'),
  it: { apiEndpoint: 'https://cookidoo.it', languages: ['it-IT'], defaultLanguage: 'it-IT' },
  kw: intl('en'),
  lt: intl('en'),
  lu: { apiEndpoint: 'https://cookidoo.be', languages: ['nl-BE', 'en', 'fr-BE', 'de-BE'], defaultLanguage: 'fr-BE' },
  ma: intl('fr'),
  mt: intl('en'),
  mx: { apiEndpoint: 'https://cookidoo.mx', languages: ['es-MX'], defaultLanguage: 'es-MX' },
  my: intl('en'),
  nl: { apiEndpoint: 'https://cookidoo.be', languages: ['nl-BE', 'en', 'fr-BE', 'de-BE'], defaultLanguage: 'nl-BE' },
  no: intl('en'),
  nz: { apiEndpoint: 'https://cookidoo.com.au', languages: ['en-AU'], defaultLanguage: 'en-AU' },
  pa: intl('es'),
  pe: intl('es'),
  ph: intl('en'),
  pl: { apiEndpoint: 'https://cookidoo.pl', languages: ['pl'], defaultLanguage: 'pl' },
  pt: { apiEndpoint: 'https://cookidoo.pt', languages: ['pt-PT'], defaultLanguage: 'pt-PT' },
  py: intl('es'),
  ro: intl('ro'),
  sa: intl('en'),
  se: intl('en'),
  sg: intl('en'),
  th: intl('en'),
  tr: { apiEndpoint: 'https://cookidoo.com.tr', languages: ['tr-TR'], defaultLanguage: 'tr-TR' },
  ua: intl('en'),
  us: { apiEndpoint: 'https://cookidoo.thermomix.com', languages: ['en-US'], defaultLanguage: 'en-US' },
  uy: intl('es'),
  vn: intl('vi'),
  za: intl('en'),
} satisfies Record<string, CountrySite>;

export type CountryCode = keyof typeof SITES;

export const COUNTRIES: Readonly<Record<CountryCode, CountrySite>> = SITES;

/**
 * The localization for a country, in its default language or in `language`,
 * which must be one the country's site serves.
 */
export function localizationFor(countryCode: CountryCode, language?: string): Localization {
  const site: CountrySite | undefined = COUNTRIES[countryCode];
  if (!site) throw new Error(`Unknown country code: ${countryCode}`);
  const lang = language ?? site.defaultLanguage;
  if (!site.languages.includes(lang)) {
    throw new Error(`${countryCode} does not serve "${lang}"; use one of: ${site.languages.join(', ')}`);
  }
  return { countryCode, language: lang, apiEndpoint: site.apiEndpoint };
}

/** Uruguay uses the "international" site in Spanish. */
export const URUGUAY: Localization = localizationFor('uy');

/**
 * Cloudflare sits in front of the login and discovery endpoints; a browser
 * User-Agent reduces 403s (see cookidoo-api issue #230).
 */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
