/**
 * SwitchWidget — ON/OFF toggle for a `switch` capability with inline error.
 *
 * The committed value comes from `getState` (last known `relay:feedback`/
 * `relay:command`). On toggle, `sendCommand` is called; when it fails, an
 * inline error (tokens.danger) shows the failure reason instead of silently
 * swallowing it (closes KNOWN ISSUE-001). The error clears on the next
 * successful command.
 */

import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { STRINGS } from '@core/i18n';
import { INTER_SEMIBOLD, useTheme } from '@core/theme';

import type { WidgetConfig } from '../../domain/widgetTypes';
import { useWidgetServices, useCapabilityState } from '../widgetContext';

/**
 * Switch widget: icon header + RN switch for a bound `switch` capability.
 *
 * @param props.config - widget config (binding must point at a switch cap).
 */
export function SwitchWidget({ config }: { config: WidgetConfig }) {
  const { tokens } = useTheme();
  const services = useWidgetServices();
  const [error, setError] = useState<string | null>(null);

  const deviceId = config.binding?.deviceId ?? '';
  const capability = config.binding?.capability ?? 'switch';
  const enabled = !!config.binding && !!deviceId;

  // CP-R1: reactive subscription via useSyncExternalStore hook.
  const state = useCapabilityState(deviceId, capability, enabled);
  const value = state && typeof state.value === 'boolean' ? state.value : false;

  const def = services
    .getCapabilities()
    .find(candidate => candidate.type === capability);

  const handleValueChange = (next: boolean) => {
    // Optimistic render: the state store is updated by relay feedback shortly.
    const result = services.sendCommand(deviceId, capability, next);
    if (!result.ok) {
      setError(result.error.message);
    } else {
      setError(null);
    }
  };

  const title = config.title ?? def?.label ?? STRINGS.widgets.switch;

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
