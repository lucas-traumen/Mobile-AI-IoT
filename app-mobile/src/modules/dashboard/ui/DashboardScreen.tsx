/**
 * DashboardScreen — view-only dashboard (CP-R2).
 *
 * Dumb screen: receives everything as props from the app root (App wires the
 * dashboard/device stores + services). Renders:
 * - header row: app title + MQTT connection badge
 * - dashboard switcher: chips (view-only selection)
 * - room selector: room chips only — CP-R3 removed the room-level "Tất cả";
 *   exactly one shared active room is shown at a time
 * - `DashboardGrid` in view mode with the active dashboard's widgets
 *   filtered to the active room (room widgets + global widgets)
 *
 * There are no create/edit/add/remove/resize/rebind controls here: every
 * mutation lives in the Settings tab (dashboard layout editor). Relay
 * switches stay operational through the widget components.
 *
 * The grid is wrapped in a `WidgetServicesProvider` with the services the app
 * root provides so widgets can read live values, send commands and get the
 * connection state.
 */

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { APP_NAME } from '@core/constants';
import { STRINGS } from '@core/i18n';
import { useTheme } from '@core/theme';

import {
  computeGridMetrics,
  filterWidgetsForRoom,
  gridContentHeight,
  resolveCanvasWidth,
  type Dashboard,
} from '@modules/dashboard/api';
import type { Room } from '@modules/devices/api';
import type {
  WidgetConnectionState,
  WidgetRegistry,
  WidgetServices,
} from '@modules/widgets/api';
import { WidgetServicesProvider } from '@modules/widgets/api';

import { DashboardGrid } from './DashboardGrid';

/** MQTT badge dot color by connection state (tokens). */
function badgeColor(
  state: WidgetConnectionState['state'],
  tokens: { success: string; danger: string; warning: string },
): string {
  switch (state) {
    case 'connected':
      return tokens.success;
    case 'failed':
      return tokens.danger;
    default:
      return tokens.warning;
  }
}

/** User-facing MQTT badge label from the connection state. */
function connectionLabel(connection: WidgetConnectionState): string {
  switch (connection.state) {
    case 'connected':
      return STRINGS.dashboard.mqttOnline;
    case 'failed':
      return STRINGS.dashboard.mqttOffline;
    case 'connecting':
      return STRINGS.dashboard.mqttConnecting;
    case 'reconnecting':
      return STRINGS.dashboard.mqttReconnecting;
    default:
      return STRINGS.dashboard.mqttOffline;
  }
}

interface DashboardScreenProps {
  /** All dashboards (chips). */
  readonly dashboards: readonly Dashboard[];
  /** Id of the active dashboard. */
  readonly activeId: string;
  /** Id of the shared active room (a concrete room, or null when none). */
  readonly activeRoomId: string | null;
  /** Connection snapshot (state + label) for the MQTT badge. */
  readonly connection: WidgetConnectionState;
  /** Switch the active dashboard (view-only selection). */
  readonly onSelectDashboard: (id: string) => void;
  /** Switch the shared active room. */
  readonly onSelectRoom: (id: string) => void;
  /** Rooms (room chips). */
  readonly rooms: readonly Room[];
  /** The widget registry (resolves components). */
  readonly registry: WidgetRegistry;
  /** Runtime widget services (live state, commands, connection). */
  readonly services: WidgetServices;
}

/**
 * The dashboard screen (view-only).
 *
 * @param props - see {@link DashboardScreenProps}.
 */
export function DashboardScreen({
  dashboards,
  activeId,
  activeRoomId,
  connection,
  onSelectDashboard,
  onSelectRoom,
  rooms,
  registry,
  services,
}: DashboardScreenProps) {
  const { tokens } = useTheme();
  const { width, height } = useWindowDimensions();
  // Measured canvas: the grid shell's actual `onLayout` width is
  // authoritative once available; the window width is only the documented
  // fallback until the first positive layout event.
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null);

  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const metrics = useMemo(
    () => computeGridMetrics(resolveCanvasWidth(canvasWidth, width)),
    [canvasWidth, width],
  );

  const activeDashboard =
    dashboards.find(d => d.id === activeId) ?? dashboards[0];

  // Widgets visible in the active room: the room's own widgets + globals.
  const visibleWidgets = useMemo(
    () =>
      activeDashboard && activeRoomId !== null
        ? filterWidgetsForRoom(activeDashboard.widgets, activeRoomId)
        : [],
    [activeDashboard, activeRoomId],
  );

  // CP6: a "Môi trường" section label above the grid when sensor cards are
  // visible (they occupy the top rows in the seed layout), mirroring the mock.
  const hasSensorCards = visibleWidgets.some(
    widget => widget.type === 'sensor-value',
  );

  // Exact height of the grid content: every card is absolutely positioned
  // inside the grid, so the shell must reserve the row extent (or cards on
  // lower rows would be clipped). Falls back to one row when empty and to
  // the screen height so the scroll content always covers the visible area.
  const gridShellHeight = useMemo(() => {
    const content = gridContentHeight(visibleWidgets, metrics);
    return Math.max(content, height);
  }, [visibleWidgets, metrics, height]);

  const dotColor = badgeColor(connection.state, tokens);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appTitle}>{APP_NAME}</Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            <View style={[styles.badgeDot, { backgroundColor: dotColor }]} />
            <Text style={[styles.badgeText, { color: dotColor }]}>
              {connectionLabel(connection)}
            </Text>
          </View>
        </View>

        {dashboards.length > 1 ? (
          <View style={styles.switcher}>
            {dashboards.map(dashboard => (
              <Pressable
                key={dashboard.id}
                style={[
                  styles.chip,
                  dashboard.id === activeId && styles.chipActive,
                ]}
                onPress={() => onSelectDashboard(dashboard.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    dashboard.id === activeId && styles.chipTextActive,
                  ]}
                >
                  {dashboard.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.roomSelector}>
          <Text style={styles.roomLabel}>
            {STRINGS.dashboard.currentRoom}: ▾
          </Text>
          <View style={styles.roomChips}>
            {rooms.map(room => {
              const active = room.id === activeRoomId;
              return (
                <Pressable
                  key={room.id}
                  style={[
                    styles.chip,
                    styles.roomChip,
                    active && styles.chipActive,
                  ]}
                  onPress={() => onSelectRoom(room.id)}
                >
                  {room.icon ? (
                    <Ionicons
                      name={room.icon as keyof typeof Ionicons.glyphMap}
                      size={14}
                      color={active ? tokens.onPrimary : tokens.textPrimary}
                    />
                  ) : null}
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {room.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {rooms.length === 0 ? (
          <Text style={styles.emptyHint}>{STRINGS.dashboard.noRooms}</Text>
        ) : (
          <>
            {hasSensorCards ? (
              <Text style={styles.sectionTitle}>
                {STRINGS.dashboard.environment}
              </Text>
            ) : null}
            {activeDashboard ? (
              <WidgetServicesProvider services={services}>
                {visibleWidgets.length === 0 ? (
                  <Text style={styles.emptyHint}>
                    {STRINGS.dashboard.noWidgets}
                  </Text>
                ) : (
                  <View
                    style={[styles.gridShell, { height: gridShellHeight }]}
                    onLayout={event => {
                      setCanvasWidth(event.nativeEvent.layout.width);
                    }}
                  >
                    <DashboardGrid
                      widgets={visibleWidgets}
                      registry={registry}
                      editMode={false}
                      metrics={metrics}
                      onMoveWidget={() => false}
                      onResizeWidget={() => false}
                      onRemoveWidget={() => undefined}
                    />
                  </View>
                )}
              </WidgetServicesProvider>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(tokens: {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  success: string;
  warning: string;
  danger: string;
  border: string;
}) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingBottom: 80 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    appTitle: { fontSize: 22, fontWeight: '700', color: tokens.textPrimary },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    badgeText: { fontSize: 12, fontWeight: '600' },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: tokens.textPrimary,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    switcher: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    chip: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: tokens.border,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: tokens.surface,
    },
    chipActive: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    chipText: { fontSize: 13, color: tokens.textPrimary, fontWeight: '500' },
    chipTextActive: { color: tokens.onPrimary, fontWeight: '600' },
    roomSelector: { paddingHorizontal: 16, paddingBottom: 8 },
    roomLabel: {
      fontSize: 13,
      color: tokens.textSecondary,
      fontWeight: '500',
      marginBottom: 8,
    },
    roomChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    roomChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    // The explicit height is applied inline (gridShellHeight) so the shell
    // matches the active dashboard's row extent exactly. The inline
    // `onLayout` reports the real canvas width up to `computeGridMetrics`.
    gridShell: {},
    emptyHint: {
      color: tokens.textSecondary,
      textAlign: 'center',
      marginTop: 40,
      fontSize: 14,
      paddingHorizontal: 32,
    },
  });
}
