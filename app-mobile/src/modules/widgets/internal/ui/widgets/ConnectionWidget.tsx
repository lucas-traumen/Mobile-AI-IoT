/**
 * ConnectionWidget — MQTT connection status card.
 *
 * Always renders (no binding): a colored dot (green connected / red failed /
 * amber otherwise) + the user-facing connection label from the services.
 * When the connection failed and a cause is known (CP5), the friendly
 * Vietnamese error label is appended so the user sees *why* it is offline.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { errorLabel, STRINGS } from '@core/i18n';
import { useTheme } from '@core/theme';

import type { WidgetConfig } from '../../domain/widgetTypes';
import { useWidgetServices } from '../widgetContext';

/**
 * Connection widget: status dot + connection text (+ friendly error cause).
 *
 * @param props.config - widget config (binding ignored — connection is global).
 */
export function ConnectionWidget({ config }: { config: WidgetConfig }) {
  const { tokens } = useTheme();
  const services = useWidgetServices();
  const connection = services.getConnection();

  const dotColor =
    connection.state === 'connected'
      ? tokens.success
      : connection.state === 'failed'
      ? tokens.danger
      : tokens.warning;

  const title = config.title ?? STRINGS.widgets.connection;
  const cause =
    connection.state === 'failed' && connection.errorCode
      ? `${connection.label} — ${errorLabel(connection.errorCode)}`
      : connection.label;

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: tokens.textPrimary }]}>
          {title}
        </Text>
        <Text style={[styles.label, { color: tokens.textSecondary }]}>
          {cause}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  textCol: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  label: { fontSize: 12 },
});
