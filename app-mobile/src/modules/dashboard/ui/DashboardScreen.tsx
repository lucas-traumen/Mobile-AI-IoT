/**
 * DashboardScreen — view-only dashboard (CP-R2, Phase 1 layout).
 *
 * Dumb screen: receives everything as props from the app root (App wires the
 * dashboard/device stores + services). Renders the approved mẫu A hierarchy:
 * - header row: app title (left) + MQTT connection badge (top-right)
 * - room navigation: the controlled `RoomSelector` (non-wrapping horizontal
 *   quick strip + expandable full list) — CP-R3 removed the room-level
 *   "Tất cả"; exactly one shared active room is shown at a time
 * - `DashboardGrid` in view mode with the active dashboard's widgets
 *   filtered to the active room (room widgets + global widgets)
 * - section labels: "Môi trường" above the grid when sensor cards are
 *   visible, "Thiết bị" when switch cards are visible (M2 pastel upgrade;
 *   the header clock was removed — the status bar already shows the time)
 *
 * The screen container is a `LinearGradient` (pastel theme gradient) scoped
 * to the Dashboard tab only — History/Settings keep their plain background.
 *
 * The persisted dashboard name is never shown here (dashboard selection and
 * management live in Settings). There are no create/edit/add/remove/resize/
 * rebind controls on this screen: every mutation lives in the Settings tab.
 * Relay switches stay operational through the widget components.
 *
 * The grid is wrapped in a `WidgetServicesProvider` with the services the app
 * root provides so widgets can read live values and send commands.
 */

import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { APP_NAME } from '@core/constants';
import { STRINGS } from '@core/i18n';
import { INTER_SEMIBOLD, useTheme } from '@core/theme';

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
import { RoomSelector } from './RoomSelector';

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
  /** All dashboards (the active one is resolved by id). */
  readonly dashboards: readonly Dashboard[];
  /** Id of the active dashboard. */
  readonly activeId: string;
  /** Id of the shared active room (a concrete room, or null when none). */
  readonly activeRoomId: string | null;
  /** Connection snapshot (state + label) for the MQTT badge. */
  readonly connection: WidgetConnectionState;
  /** Switch the shared active room. */
  readonly onSelectRoom: (id: string) => void;
  /** Rooms (room selector). */
  readonly rooms: readonly Room[];
  /** The widget registry (resolves components). */
  readonly registry: WidgetRegistry;
  /** Runtime widget services (live state, commands). */
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

  // M2: "Môi trường" section label when sensor cards are visible, "Thiết bị"
  // when switch cards are visible (both share the sectionTitle style).
  const hasSensorCards = visibleWidgets.some(
    widget => widget.type === 'sensor-value',
  );
  const hasSwitchCards = visibleWidgets.some(
    widget => widget.type === 'switch',
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
    // The pastel gradient is scoped to the Dashboard container only — the
    // other tabs keep the plain themed background (TabShell padding applies
    // outside this view).
    <LinearGradient colors={tokens.gradient} style={styles.flex}>
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

        <RoomSelector
          rooms={rooms}
          activeRoomId={activeRoomId}
          onSelectRoom={onSelectRoom}
        />

        {rooms.length === 0 ? (
          <Text style={styles.emptyHint}>{STRINGS.dashboard.noRooms}</Text>
        ) : (
          <>
            {hasSensorCards ? (
              <Text style={styles.sectionTitle}>
                {STRINGS.dashboard.environment}
              </Text>
            ) : null}
            {hasSwitchCards ? (
              <Text style={styles.sectionTitle}>
                {STRINGS.dashboard.devices}
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
    </LinearGradient>
  );
}

function makeStyles(tokens: {
  surface: string;
  textPrimary: string;
  textSecondary: string;
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
    appTitle: {
      fontSize: 22,
      fontFamily: INTER_SEMIBOLD,
      color: tokens.textPrimary,
    },
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
      fontFamily: INTER_SEMIBOLD,
      color: tokens.textPrimary,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
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
