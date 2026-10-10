import { describe, expect, it } from 'vitest';
import { createTranslate, loadMessages, pickLocale } from '../../src/i18n/index';

describe('translation', () => {
  it('uses the first of the device languages that ships', () => {
    expect(pickLocale(['fr-FR', 'es-MX', 'en-GB'])).toBe('es');
  });

  it('matches on the language, ignoring the region', () => {
    expect(pickLocale(['es-419'])).toBe('es');
  });

  it('falls back to English when no device language ships', () => {
    expect(pickLocale(['fr-FR', 'de'])).toBe('en');
  });

  it('falls back to English when the device states no language at all', () => {
    expect(pickLocale([])).toBe('en');
  });

  it('gives the Spanish text for a key', async () => {
    const t = createTranslate(await loadMessages('es'));

    expect(t('connect.submit')).toBe('Conectar');
  });

  it('fills a message that takes parameters', async () => {
    const t = createTranslate(await loadMessages('en'));

    expect(t('connect.error.serverTooOld', { version: '10.10.7', minimumVersion: '12.0' })).toBe(
      'That server runs Jellyfin 10.10.7. Jellyflick needs 12.0 or later, so it cannot connect to it.',
    );
  });
});
