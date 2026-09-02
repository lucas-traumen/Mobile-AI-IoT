/**
 * SwitchWidget — ON/OFF toggle for a `switch` capability with inline error.
 *
 * The committed value comes from `getState` (last known `relay:feedback`/
 * `relay:command`). Toggling is OPTIMISTIC: the rendered switch flips
 * immediately via a local `override` (even offline / before any feedback),
 * then `sendCommand` is called. When the command fails, the override is
 * rolled back and an inline error (tokens.danger) shows the failure reason
 * (closes KNOWN ISSUE-001). When the committed feedback catches up with the
 * override, the override is cleared so external state changes stay visible.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { STRINGS } from '@core/i18n';
import { INTER_SEMIBOLD, useTheme } from '@core/theme';

import type { WidgetConfig } from '../../domain/widgetTypes';
import { useWidgetServices, useCapabilityState } from '../widgetContext';

/**
 * Switch widget: icon header + RN switch for a bound `switch` capability.
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
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons
          name={
            (def?.icon ?? 'power-outline') as keyof typeof Ionicons.glyphMap
          }
          size={18}
          color={def?.color ?? tokens.primary}
        />
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: tokens.textPrimary }]}>
            {title}
          </Text>
          {error ? (
            <Text style={[styles.error, { color: tokens.danger }]}>
              {error}
            </Text>
          ) : null}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={handleValueChange}
        trackColor={{
          false: tokens.border,
          true: tokens.primary,
        }}
        thumbColor={value ? tokens.onPrimary : tokens.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  textCol: { flex: 1 },
  title: { fontSize: 15, fontFamily: INTER_SEMIBOLD },
  error: { fontSize: 12, marginTop: 4 },
});
