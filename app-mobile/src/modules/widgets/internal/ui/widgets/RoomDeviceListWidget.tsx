/**
 * RoomDeviceListWidget — lists the devices of a room with live state.
 *
 * Header: "Thiết bị theo phòng: <room name>". The room resolves as:
 * `widget.roomId ?? activeRoom ?? first room`. For each device of that room:
 *
 * - icon (Ionicons) from the device's first sensor capability's catalog icon,
 *   falling back to a relay glyph for relays;
 * - name + sublabel (device id);
 * - right side: a Switch for `switch` capabilities (sendCommand + getState)
 *   or a live value text (e.g. "28.6 °C") for sensor capabilities.
 *
 * No binding (`supportedCapabilities: []`); empty room shows the empty state.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { STRINGS } from '@core/i18n';
import { useTheme, type ThemeTokens } from '@core/theme';

import type { CapabilityDef, Device, Room } from '@modules/devices/api';

import { parseWidgetSize, type WidgetConfig } from '../../domain/widgetTypes';
import { resolveCapabilityAccent } from '../../domain/capabilityColor';
import {
  useWidgetServices,
  useCapabilityState,
  type WidgetServices,
} from '../widgetContext';

/** Resolve the room this widget displays. */
function resolveRoom(
  widgetRoomId: string | undefined,
  rooms: readonly Room[],
  activeRoomId: string | null,
): Room | undefined {
  if (widgetRoomId) {
    return rooms.find(room => room.id === widgetRoomId);
  }
  if (activeRoomId) {
    return rooms.find(room => room.id === activeRoomId);
  }
  return rooms[0];
}

/** Ionicons name for a device (first sensor cap icon, or a relay glyph). */
function deviceIcon(
  device: Device,
  capabilities: readonly CapabilityDef[],
): string {
  for (const capability of device.capabilities) {
    const def = capabilities.find(c => c.type === capability);
    if (def?.icon) {
      return def.icon;
    }
  }
  return device.binding.kind === 'relay'
    ? 'power-outline'
    : 'hardware-chip-outline';
}

/**
 * Icon accent for a device: the first cataloged capability resolved through
 * the shared `resolveCapabilityAccent` contract (Qwen blocker 2) — themed
 * built-ins, catalog color for customs, theme primary as the fallback.
 */
function deviceIconColor(
  device: Device,
  capabilities: readonly CapabilityDef[],
  tokens: ThemeTokens,
): string {
  for (const capability of device.capabilities) {
    const def = capabilities.find(c => c.type === capability);
    if (!def) {
      continue;
    }
    return resolveCapabilityAccent(capability, def, tokens);
  }
  return tokens.primary;
}

/** Format a numeric sensor value: one decimal + the catalog unit. */
function formatValue(value: number, def: CapabilityDef | undefined): string {
  const decimal = value.toFixed(1);
  return def?.unit ? `${decimal} ${def.unit}` : decimal;
}

/** One device row: icon, name, sublabel + switch or live value. */
function DeviceRow({
  device,
  services,
  capabilities,
  compact,
}: {
  device: Device;
  services: WidgetServices;
  capabilities: readonly CapabilityDef[];
  compact: boolean;
}) {
  const { tokens } = useTheme();
  const [error, setError] = useState<string | null>(null);

  const switchCap = device.capabilities.find(cap => {
    const def = capabilities.find(c => c.type === cap);
    return def?.kind === 'switch';
  });
  const sensorCap = device.capabilities.find(cap => {
    const def = capabilities.find(c => c.type === cap);
    return def?.kind === 'sensor';
  });

  // CP-R1: reactive subscriptions via useSyncExternalStore hooks.
  // Hooks are called unconditionally; enabled flag prevents subscription when no cap.
  const switchState = useCapabilityState(
    device.id,
    switchCap ?? '',
    !!switchCap,
  );
  const switchValue =
    switchState && typeof switchState.value === 'boolean'
      ? switchState.value
      : false;
  const sensorState = useCapabilityState(
    device.id,
    sensorCap ?? '',
    !!sensorCap,
  );
  const sensorDef = sensorCap
    ? capabilities.find(c => c.type === sensorCap)
    : undefined;

  const icon = deviceIcon(device, capabilities);
  const iconColor = deviceIconColor(device, capabilities, tokens);

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={compact ? 16 : 18}
          color={iconColor}
        />
        <View style={styles.rowText}>
          <Text
            style={[styles.rowTitle, { color: tokens.textPrimary }]}
            numberOfLines={1}
          >
            {device.name}
          </Text>
          {error ? (
            <Text
              style={[styles.rowError, { color: tokens.danger }]}
              numberOfLines={1}
            >
              {error}
            </Text>
          ) : (
            <Text
              style={[styles.rowMeta, { color: tokens.textSecondary }]}
              numberOfLines={1}
            >
              {device.id}
            </Text>
          )}
        </View>
      </View>
      {switchCap ? (
        <Switch
          value={switchValue}
          onValueChange={next => {
            const result = services.sendCommand(device.id, switchCap, next);
            setError(result.ok ? null : result.error.message);
          }}
          trackColor={{ false: tokens.border, true: tokens.primary }}
          thumbColor={
            switchValue ? tokens.surfaceElevated : tokens.textSecondary
          }
        />
      ) : sensorState && typeof sensorState.value === 'number' ? (
        <Text
          style={[
            styles.rowValue,
            {
              color: resolveCapabilityAccent(
                sensorCap ?? '',
                sensorDef,
                tokens,
              ),
            },
          ]}
        >
          {formatValue(sensorState.value, sensorDef)}
        </Text>
      ) : (
        <Text style={[styles.rowValue, { color: tokens.textSecondary }]}>
          —
        </Text>
      )}
    </View>
  );
}

/**
 * Room device list widget: header + one row per device of the resolved room.
 *
 * Responsive policy: the rows live in a bounded scroll container so any
 * device count fits inside the allocated card — nothing is silently dropped
 * (the old 2x1 slice showed at most 3 static rows) and nothing overlaps a
 * neighboring card (the grid card still clips as the final guard).
 *
 * @param props.config - widget config (roomId decides the room; no binding).
 */
export function RoomDeviceListWidget({ config }: { config: WidgetConfig }) {
  const { tokens } = useTheme();
  const services = useWidgetServices();

  const rooms = services.getRooms();
  const devices = services.getDevices();
  const capabilities = services.getCapabilities();
  const room = resolveRoom(config.roomId, rooms, services.getActiveRoomId());

  const size = parseWidgetSize(
    `${config.layout.width}x${config.layout.height}`,
  );
  // 2x1: compact rows; 2x2: roomy rows (scrolling handles any device count).
  const compact = (size?.height ?? 1) < 2;

  const roomDevices = room
    ? devices.filter(device => device.roomId === room.id)
    : [];

  return (
    <View style={styles.card}>
      <Text style={[styles.header, { color: tokens.textSecondary }]}>
        {STRINGS.widgets.devicesByRoom}
        <Text style={{ color: tokens.primary }}>
          {room?.name ?? STRINGS.devices.noRoom}
        </Text>
      </Text>
      {roomDevices.length === 0 ? (
        <Text style={[styles.empty, { color: tokens.textSecondary }]}>
          {STRINGS.devices.noDevices}
        </Text>
      ) : (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {roomDevices.map(device => (
            <DeviceRow
              key={device.id}
              device={device}
              services={services}
              capabilities={capabilities}
              compact={compact}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12 },
  header: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  empty: { fontSize: 13, marginTop: 4 },
  // Bounded by the card's fixed height: variable-length device lists scroll
  // inside the card instead of being clipped or overflowing it.
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '500' },
  rowMeta: { fontSize: 11 },
  rowError: { fontSize: 11 },
  rowValue: { fontSize: 14, fontWeight: '600' },
});
