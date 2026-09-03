/**
 * Theme token tests — the approved Light/Dark design-system palette.
 *
 * Verifies the exact target values (dashboard-light-dark-responsive
 * redesign): neutral page/surface layers, semantic accents (blue primary,
 * green success, orange temperature, cyan humidity, neutral off), the
 * contrast-sensitive `onPrimary` pairing per theme, the Dashboard surface
 * elevation recipe (subtle Light shadow; Dark relies on layer + border),
 * and the RETAINED History-only legacy gel tokens.
 */

import { DARK_TOKENS, LIGHT_TOKENS } from './tokens';

describe('LIGHT_TOKENS (approved palette)', () => {
  it('matches the approved Light token table exactly', () => {
    expect(LIGHT_TOKENS.background).toBe('#f4f7fb');
    expect(LIGHT_TOKENS.surface).toBe('#ffffff');
    expect(LIGHT_TOKENS.surfaceDashboard).toBe('#ffffff');
    expect(LIGHT_TOKENS.surfaceElevated).toBe('#f8fafc');
    expect(LIGHT_TOKENS.textPrimary).toBe('#1e293b');
    expect(LIGHT_TOKENS.textSecondary).toBe('#64748b');
    expect(LIGHT_TOKENS.primary).toBe('#3b82f6');
    expect(LIGHT_TOKENS.success).toBe('#22c55e');
    expect(LIGHT_TOKENS.off).toBe('#cbd5e1');
    expect(LIGHT_TOKENS.temperature).toBe('#f97316');
    expect(LIGHT_TOKENS.humidity).toBe('#06b6d4');
    expect(LIGHT_TOKENS.border).toBe('#e2e8f0');
  });

  it('pairs white onPrimary text with the Light primary (contrast)', () => {
    expect(LIGHT_TOKENS.onPrimary).toBe('#ffffff');
  });

  it('elevates the dashboard surface with a subtle soft shadow', () => {
    const { dashboardShadow } = LIGHT_TOKENS;
    expect(dashboardShadow.shadowOpacity).toBeGreaterThan(0);
    expect(dashboardShadow.shadowOpacity).toBeLessThanOrEqual(0.1);
    expect(dashboardShadow.elevation).toBeGreaterThan(0);
  });
});

describe('DARK_TOKENS (approved palette)', () => {
  it('matches the approved Dark token table exactly', () => {
    expect(DARK_TOKENS.background).toBe('#0b1220');
    expect(DARK_TOKENS.surface).toBe('#172235');
    expect(DARK_TOKENS.surfaceDashboard).toBe('#111827');
    expect(DARK_TOKENS.surfaceElevated).toBe('#1e293b');
    expect(DARK_TOKENS.textPrimary).toBe('#f8fafc');
    expect(DARK_TOKENS.textSecondary).toBe('#94a3b8');
    expect(DARK_TOKENS.primary).toBe('#60a5fa');
    expect(DARK_TOKENS.success).toBe('#22c55e');
    expect(DARK_TOKENS.off).toBe('#475569');
    expect(DARK_TOKENS.temperature).toBe('#fb923c');
    expect(DARK_TOKENS.humidity).toBe('#22d3ee');
    expect(DARK_TOKENS.border).toBe('#334155');
  });

  it('pairs a DARK onPrimary with the bright Dark primary (contrast)', () => {
    // #60a5fa is bright — white text would fail contrast; the dark page
    // color keeps the active tab/button text readable.
    expect(DARK_TOKENS.primary).toBe('#60a5fa');
    expect(DARK_TOKENS.onPrimary).toBe('#0b1220');
  });

  it('derives Dark depth from layer + border, not a shadow', () => {
    expect(DARK_TOKENS.dashboardShadow.shadowOpacity).toBe(0);
    expect(DARK_TOKENS.dashboardShadow.elevation).toBe(0);
  });

  it('keeps the semantic accent hues readable across both themes', () => {
    // Success is the shared active/online color; temperature/humidity get
    // the brighter dark variants per the approved table.
    expect(LIGHT_TOKENS.success).toBe(DARK_TOKENS.success);
    expect(LIGHT_TOKENS.temperature).not.toBe(DARK_TOKENS.temperature);
    expect(LIGHT_TOKENS.humidity).not.toBe(DARK_TOKENS.humidity);
  });
});

describe('History legacy gel tokens (retained until the History redesign)', () => {
  it('keeps the gradient / tint / inner-edge / chip tokens in both themes', () => {
    for (const tokens of [LIGHT_TOKENS, DARK_TOKENS]) {
      expect(typeof tokens.gradient[0]).toBe('string');
      expect(typeof tokens.gradient[1]).toBe('string');
      expect(typeof tokens.surfaceGlass).toBe('string');
      expect(typeof tokens.cardTintTemperature).toBe('string');
      expect(typeof tokens.cardTintHumidity).toBe('string');
      expect(typeof tokens.cardTintSwitchLight).toBe('string');
      expect(typeof tokens.cardTintSwitchFan).toBe('string');
      expect(typeof tokens.cardInnerEdge).toBe('string');
      expect(typeof tokens.chipActiveBg).toBe('string');
      expect(typeof tokens.cardShadow.shadowOpacity).toBe('number');
    }
  });
});
