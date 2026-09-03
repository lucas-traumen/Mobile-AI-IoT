/**
 * SwitchWidget — ON/OFF toggle for a `switch` capability with inline error.
 *
 * Card anatomy (gel follow-up, screenshot 1): ONE friendly row — a
 * line-style Ionicons glyph inside a soft icon chip, the friendly device
 * title, and the operational RN switch. NO bound device id (`relay-1` /
 * `relay-2`) and NO visible `Đang bật`/`Đang tắt` caption: the ON/OFF
 * state rides the switch semantics (accessibility state `checked` +
 * accessible value text from the kept `STRINGS.widgets.on/off`) so
 * accessibility services keep the full state. Green (tokens.success) is
 * reserved for the ACTIVE state (ON track + icon glyph); OFF renders the
 * neutral `off` token. An explicitly defined capability color keeps its
 * precedence over the state-aware fallback (same rule as
 * `resolveCapabilityAccent`). Inline command errors (tokens.danger) remain
 * visible below the row.
 *
 * The committed value comes from `getState` (last known `relay:feedback`/
 * `relay:command`). Toggling is OPTIMISTIC: the rendered switch flips
 * immediately via a local `override` (even offline / before any feedback),
 * then `sendCommand` is called. When the command fails, the override is
 * rolled back and an inline error shows the failure reason (closes KNOWN
 * ISSUE-001). When the committed feedback catches up with the override,
 * the override is cleared so external state changes stay visible.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { STRINGS } from '@core/i18n';
import { INTER_SEMIBOLD, useTheme } from '@core/theme';

import type { WidgetConfig } from '../../domain/widgetTypes';
import { useWidgetServices, useCapabilityState } from '../widgetContext';

/**
 * Switch widget: icon chip + friendly title + RN switch (one row) and an
 * optional inline error.
 *
 * Title fallback chain (M2 title fix): `config.title ?? bound device name ??
 * capability definition label ?? generic switch label`.
 *
 * @param props.config - widget config (binding must point at a switch cap).
 */
export function SwitchWidget({ config }: { config: WidgetConfig }) {
  const { tokens } = useTheme();
  const services = useWidgetServices();
  const [error, setError] = useState<string | null>(null);
  /**
   * Optimistic toggle override: `null` = show the committed value; `true`/
   * `false` = show this value until the committed feedback matches (then
   * clear) or the command fails (then roll back).
   */
  const [override, setOverride] = useState<boolean | null>(null);

  const deviceId = config.binding?.deviceId ?? '';
  const capability = config.binding?.capability ?? 'switch';
  const enabled = !!config.binding && !!deviceId;

  // CP-R1: reactive subscription via useSyncExternalStore hook.
  const state = useCapabilityState(deviceId, capability, enabled);
  const committed =
    state && typeof state.value === 'boolean' ? state.value : false;
  const value = override ?? committed;

  const def = services
    .getCapabilities()
    .find(candidate => candidate.type === capability);

  // M2 title fix: seeded widgets carry no `title`, so the bound DEVICE name
  // ("Đèn"/"Quạt") must win over the capability label ("Công tắc") — works
  // for existing persisted data without a reset.
  const deviceName = services
    .getDevices()
    .find(device => device.id === deviceId)?.name;
  const title =
    config.title ?? deviceName ?? def?.label ?? STRINGS.widgets.switch;

  const handleValueChange = (next: boolean) => {
    // Optimistic render FIRST: the switch flips immediately (even offline /
    // before relay feedback arrives) instead of waiting on the store.
    setOverride(next);
    const result = services.sendCommand(deviceId, capability, next);
    if (!result.ok) {
      // Command rejected: roll the optimistic flip back + surface why.
      setOverride(null);
      setError(result.error.message);
    } else {
      setError(null);
    }
  };

  // Committed feedback caught up with the override → the override has done
  // its job; clear it so later external state changes are not masked.
  // (Post-commit state reset — the approved optimistic-toggle pattern.)
  useEffect(() => {
    if (override !== null && committed === override) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- approved post-commit override reset
      setOverride(null);
    }
  }, [committed, override]);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View
          style={[
            styles.iconChip,
            {
              backgroundColor: tokens.surfaceElevated,
              borderColor: tokens.border,
            },
          ]}
        >
          <Ionicons
            name={
              (def?.icon ?? 'power-outline') as keyof typeof Ionicons.glyphMap
            }
            size={18}
            // State-aware glyph (approved semantics: green only for the
            // active state, neutral off otherwise). An explicitly defined
            // capability color is an intentional per-capability contract
            // (CP5 editor) and keeps the same precedence as
            // `resolveCapabilityAccent` — it wins over the fallback.
            color={def?.color ?? (value ? tokens.success : tokens.off)}
          />
        </View>
        <Text style={[styles.title, { color: tokens.textPrimary }]}>
          {title}
        </Text>
        <Switch
          value={value}
          onValueChange={handleValueChange}
          accessibilityLabel={title}
          // The visible on/off caption was removed; the state stays fully
          // available to accessibility services through the switch
          // semantics (checked) + the accessible value text.
          accessibilityState={{ checked: value }}
          accessibilityValue={{
            text: value ? STRINGS.widgets.on : STRINGS.widgets.off,
          }}
          // Green is reserved for the ACTIVE state; OFF is neutral.
          trackColor={{ false: tokens.off, true: tokens.success }}
          thumbColor={value ? tokens.onPrimary : tokens.surface}
        />
      </View>
      {error ? (
        <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12 },
  // ONE friendly row: icon chip, title, operational switch.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Soft icon chip (approved anatomy): elevated surface + border.
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 16, fontFamily: INTER_SEMIBOLD },
  error: { fontSize: 12, marginTop: 6 },
});
