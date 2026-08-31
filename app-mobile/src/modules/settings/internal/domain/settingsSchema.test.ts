/**
 * Settings domain schema tests — backward-compatible migration.
 *
 * Verifies that settings persisted in the old shape (no `ui` key) still parse
 * and default `theme` to `'system'`, and that `parseSettings` keeps them.
 */

import { parseSettings } from './settingsSchema';

describe('SettingsSchema migration (ui.theme)', () => {
  it('defaults theme to system when ui is missing (old persisted format)', () => {
    const oldFormat = {
      mqtt: { host: '192.168.1.10', port: 9001, prefix: 'home' },
      influx: {
        url: 'http://192.168.1.10:8086',
        org: 'iot',
        bucket: 'sensors',
        token: 'tok',
      },
    };
    const result = parseSettings(oldFormat);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ui).toEqual({ theme: 'system' });
    }
  });

  it('keeps an explicit ui.theme when present', () => {
    const current = {
      mqtt: { host: '192.168.1.10', port: 9001, prefix: 'home' },
      influx: {
        url: 'http://192.168.1.10:8086',
        org: 'iot',
        bucket: 'sensors',
        token: 'tok',
      },
      ui: { theme: 'dark' },
    };
    const result = parseSettings(current);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ui).toEqual({ theme: 'dark' });
    }
  });

  it('rejects an invalid ui.theme value', () => {
    const invalid = {
      mqtt: { host: '192.168.1.10', port: 9001, prefix: 'home' },
      influx: {
        url: 'http://192.168.1.10:8086',
        org: 'iot',
        bucket: 'sensors',
        token: 'tok',
      },
      ui: { theme: 'matrix' },
    };
    const result = parseSettings(invalid);
    expect(result.ok).toBe(false);
  });
});
