/**
 * Card tint resolver — maps a widget to its pastel card tint token.
 *
 * PURE function: `(widget, tokens) → color`. No theme context access, no
 * side effects; the caller (DashboardGrid) passes the active theme tokens.
 *
 * Keying choice (documented per the approved tint table):
 * - The widget's BINDING CAPABILITY is the primary key: `temperature` and
 *   `humidity` uniquely identify the environment sensor cards.
 * - A `switch` capability alone is ambiguous (every relay channel is a
 *   switch), so the DEVICE ID disambiguates: `relay-1` is the seed's Đèn
 *   channel and `relay-2` is Quạt (see the devices module seed ids). Any
 *   other switch device gets the neutral glass fallback.
 * - Widgets with no binding and any unknown or future capability/device
 *   combination fall back to `tokens.surfaceGlass` so every card always
 *   renders on a readable surface.
 */

import type { ThemeTokens } from '@core/theme';

import type { WidgetConfig } from './widgetTypes';

/** Seed device id of the Đèn relay channel (devices module seed). */
const SEED_LIGHT_RELAY_ID = 'relay-1';

/** Seed device id of the Quạt relay channel (devices module seed). */
const SEED_FAN_RELAY_ID = 'relay-2';

/**
 * Resolve the pastel card tint for a widget.
 *
 * @param widget - the persisted widget config (binding decides the tint).
 * @param tokens - the ACTIVE theme tokens (light or dark pastel variants).
 * @returns the card background color for the widget's card.
 */
export function resolveCardTint(
  widget: WidgetConfig,
  tokens: ThemeTokens,
): string {
  const capability = widget.binding?.capability;
  const deviceId = widget.binding?.deviceId;
  switch (capability) {
    case 'temperature':
      return tokens.cardTintTemperature;
    case 'humidity':
      return tokens.cardTintHumidity;
    case 'switch':
      if (deviceId === SEED_LIGHT_RELAY_ID) {
        return tokens.cardTintSwitchLight;
      }
      if (deviceId === SEED_FAN_RELAY_ID) {
        return tokens.cardTintSwitchFan;
      }
      return tokens.surfaceGlass;
    default:
      return tokens.surfaceGlass;
  }
}
