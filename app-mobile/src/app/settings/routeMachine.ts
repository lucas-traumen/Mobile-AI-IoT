/**
 * Settings tab navigation state machine (CP-R2) — pure, React-free.
 *
 * Extracted from {@link ./SettingsCoordinator.tsx} so the transition rules
 * are unit-testable without pulling the screen module graph (and its native
 * module imports) into the test.
 *
 * "Inside Settings" is a product/navigation rule, not a transfer of
 * persistence ownership: the settings module keeps owning MQTT/Influx/UI
 * preferences; the devices module keeps owning rooms/devices/capabilities;
 * the dashboard module keeps owning dashboards/widgets/layout.
 */

/** Routes inside the Settings tab. */
export type SettingsRoute =
  | { readonly name: 'root' }
  | { readonly name: 'device-management' }
  | { readonly name: 'dashboard-editor' };

/** Navigation targets of the settings route machine. */
export type SettingsRouteName = SettingsRoute['name'];

/**
 * Pure settings navigation transition.
 *
 * Any route can go back to `root`; `root` opens one of the two nested
 * management screens. Unknown combos keep the current route.
 */
export function navigateSettings(
  current: SettingsRoute,
  target: SettingsRouteName,
): SettingsRoute {
  if (target === 'root') {
    return { name: 'root' };
  }
  if (current.name === 'root') {
    return { name: target };
  }
  return current;
}
