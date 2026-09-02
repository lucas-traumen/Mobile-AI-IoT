/**
 * cardTint tests — the pure widget → pastel tint mapping.
 *
 * Verifies each approved mapping (capability as primary key, device id as
 * the switch disambiguator) against BOTH theme token sets, plus the neutral
 * glass fallback for unbound widgets, unknown devices and unknown
 * capabilities.
 */

import { DARK_TOKENS, LIGHT_TOKENS } from '@core/theme';

import type { WidgetConfig } from './widgetTypes';
import { resolveCardTint } from './cardTint';

/** Build a minimal widget config with an optional binding. */
function makeWidget(options?: {
  type?: string;
  deviceId?: string;
  capability?: string;
}): WidgetConfig {
  return {
    id: 'w-test',
    type: options?.type ?? 'sensor-value',
    ...(options?.deviceId !== undefined && options?.capability !== undefined
      ? {
          binding: {
            deviceId: options.deviceId,
            capability: options.capability,
          },
        }
      : {}),
    layout: { x: 0, y: 0, width: 1, height: 1 },
  };
}

describe('resolveCardTint', () => {
  it('maps a temperature sensor to the temperature tint (light)', () => {
    const widget = makeWidget({
      deviceId: 'sensor-01',
      capability: 'temperature',
    });
    expect(resolveCardTint(widget, LIGHT_TOKENS)).toBe(
      LIGHT_TOKENS.cardTintTemperature,
    );
    expect(LIGHT_TOKENS.cardTintTemperature).toBe('#FFE8D6');
  });

  it('maps a humidity sensor to the humidity tint (light)', () => {
    const widget = makeWidget({
      deviceId: 'sensor-01',
      capability: 'humidity',
    });
    expect(resolveCardTint(widget, LIGHT_TOKENS)).toBe(
      LIGHT_TOKENS.cardTintHumidity,
    );
    expect(LIGHT_TOKENS.cardTintHumidity).toBe('#D6F0F2');
  });

  it('maps the Đèn relay (relay-1) switch to the light tint', () => {
    const widget = makeWidget({
      type: 'switch',
      deviceId: 'relay-1',
      capability: 'switch',
    });
    expect(resolveCardTint(widget, LIGHT_TOKENS)).toBe(
      LIGHT_TOKENS.cardTintSwitchLight,
    );
    expect(LIGHT_TOKENS.cardTintSwitchLight).toBe('#FFF3CC');
  });

  it('maps the Quạt relay (relay-2) switch to the fan tint', () => {
    const widget = makeWidget({
      type: 'switch',
      deviceId: 'relay-2',
      capability: 'switch',
    });
    expect(resolveCardTint(widget, LIGHT_TOKENS)).toBe(
      LIGHT_TOKENS.cardTintSwitchFan,
    );
    expect(LIGHT_TOKENS.cardTintSwitchFan).toBe('#DDF0E9');
  });

  it('falls back to the neutral glass for an unbound widget', () => {
    const widget = makeWidget({ type: 'room-device-list' });
    expect(resolveCardTint(widget, LIGHT_TOKENS)).toBe(
      LIGHT_TOKENS.surfaceGlass,
    );
  });

  it('falls back to the neutral glass for an unknown switch device', () => {
    const widget = makeWidget({
      type: 'switch',
      deviceId: 'relay-9',
      capability: 'switch',
    });
    expect(resolveCardTint(widget, LIGHT_TOKENS)).toBe(
      LIGHT_TOKENS.surfaceGlass,
    );
  });

  it('falls back to the neutral glass for an unknown capability', () => {
    const widget = makeWidget({
      deviceId: 'sensor-01',
      capability: 'pressure',
    });
    expect(resolveCardTint(widget, LIGHT_TOKENS)).toBe(
      LIGHT_TOKENS.surfaceGlass,
    );
  });

  it('resolves every mapping from the dark tokens too', () => {
    const temperature = makeWidget({
      deviceId: 'sensor-01',
      capability: 'temperature',
    });
    const humidity = makeWidget({
      deviceId: 'sensor-01',
      capability: 'humidity',
    });
    const light = makeWidget({
      type: 'switch',
      deviceId: 'relay-1',
      capability: 'switch',
    });
    const fan = makeWidget({
      type: 'switch',
      deviceId: 'relay-2',
      capability: 'switch',
    });
    const unbound = makeWidget({ type: 'room-device-list' });

    expect(resolveCardTint(temperature, DARK_TOKENS)).toBe('#3D2E22');
    expect(resolveCardTint(humidity, DARK_TOKENS)).toBe('#1E3438');
    expect(resolveCardTint(light, DARK_TOKENS)).toBe('#3A3420');
    expect(resolveCardTint(fan, DARK_TOKENS)).toBe('#21352C');
    expect(resolveCardTint(unbound, DARK_TOKENS)).toBe('rgba(30,40,60,0.6)');
  });
});
