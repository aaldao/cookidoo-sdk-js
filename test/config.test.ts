import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COUNTRIES, localizationFor, URUGUAY, type CountryCode } from '../src/config.ts';

test('URUGUAY is the international site in Spanish', () => {
  assert.deepEqual(URUGUAY, { countryCode: 'uy', language: 'es', apiEndpoint: 'https://cookidoo.international' });
});

test('localizationFor uses the default language or the one given', () => {
  assert.deepEqual(localizationFor('es'), { countryCode: 'es', language: 'es-ES', apiEndpoint: 'https://cookidoo.es' });
  assert.deepEqual(localizationFor('uy', 'en'), {
    countryCode: 'uy',
    language: 'en',
    apiEndpoint: 'https://cookidoo.international',
  });
});

test('localizationFor rejects languages the site does not serve and unknown countries', () => {
  assert.throws(() => localizationFor('es', 'es'), /use one of: es-ES/);
  assert.throws(() => localizationFor('zz' as CountryCode), /Unknown country code/);
});

test('every default language is one the site serves', () => {
  for (const [code, site] of Object.entries(COUNTRIES)) {
    assert.ok(site.languages.includes(site.defaultLanguage), code);
  }
});
