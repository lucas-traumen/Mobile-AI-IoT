/**
 * DashboardScreen — view-only dashboard (CP-R2, Phase 1 layout).
 *
 * Dumb screen: receives everything as props from the app root (App wires the
 * dashboard/device stores + services). Renders the approved mẫu A hierarchy:
 * - header row: app title (left) + MQTT connection badge (top-right)
 * - room navigation: the controlled `RoomSelector` (non-wrapping horizontal
 *   quick strip + expandable full list) — CP-R3 removed the room-level
 *   "Tất cả"; exactly one shared active room is shown at a time
 * - SECTIONS (M2 label fix): the visible widgets are split by the pure
 *   `groupWidgets` helper into "Môi trường" (sensor-value + history-chart)
 *   and "Thiết bị" (switch + others); each non-empty section renders its gel
 *   pill label DIRECTLY above its OWN `DashboardGrid` — no more stacked
 *   labels detached from their card groups. Both section grids share the
 *   same measured canvas width (one `onLayout` wrapper) → one `metrics`
 *   instance, and each section grid reserves exactly its group's rebased
 *   content height (`sectionContentHeight`). Cards keep their persisted
 *   absolute coords: each grid receives the group's rebase row
 *   (`layoutYOffset`) and re-bases move gestures internally.
 * - glassmorphism pass on the pills (teal "Môi trường" / peach "Thiết bị";
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
 * Each section grid is wrapped in the shared `WidgetServicesProvider` with
 * the services the app root provides so widgets can read live values and
 * send commands.
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
  groupWidgets,
  resolveCanvasWidth,
  sectionBaseY,
  sectionContentHeight,
  type Dashboard,
} from '@modules/dashboard/api';
import type { Room } from '@modules/devices/api';
import type {
  WidgetConfig,
  WidgetConnectionState,
  WidgetRegistry,
  WidgetServices,
} from '@modules/widgets/api';
import { WidgetServicesProvider } from '@modules/widgets/api';

import { DashboardGrid } from './DashboardGrid';
import { RoomSelector } from './RoomSelector';

/** Grid metrics shape passed down to the section grids. */
type GridMetrics = ReturnType<typeof computeGridMetrics>;

/** The screen stylesheet (created once per token set; shared with sections). */
type ScreenStyles = ReturnType<typeof makeStyles>;

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

/**
 * One dashboard section: the gel pill label DIRECTLY above its own grid
 * (M2 label fix). The grid renders the section group with the group's
 * rebase row (`layoutYOffset`) so its top card sits at the top of the
 * section grid while persisted coords stay dashboard-absolute.
 */
function DashboardSection({
  styles,
  label,
  pillStyle,
  widgets,
  layoutYOffset,
  height,
  metrics,
  registry,
}: {
  readonly styles: ScreenStyles;
  readonly label: string;
  readonly pillStyle: ScreenStyles['sectionPillEnvironment'];
  readonly widgets: readonly WidgetConfig[];
  readonly layoutYOffset: number;
  readonly height: number;
  readonly metrics: GridMetrics;
  readonly registry: WidgetRegistry;
}) {
  return (
    <>
      <View style={[styles.sectionPill, pillStyle]}>
        <Text style={styles.sectionPillText}>{label}</Text>
      </View>
      <View style={[styles.gridShell, { height }]}>
        <DashboardGrid
          widgets={widgets}
          registry={registry}
          editMode={false}
          metrics={metrics}
          layoutYOffset={layoutYOffset}
          onMoveWidget={() => false}
          onResizeWidget={() => false}
          onRemoveWidget={() => undefined}
        />
      </View>
    </>
  );
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
  const { width } = useWindowDimensions();
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

  // Section split (M2 label fix): "Môi trường" (sensor-value + history-chart)
  // and "Thiết bị" (switch + others) — each non-empty group becomes its own
  // labeled section (pill directly above its own grid).
  const sections = useMemo(
    () => groupWidgets(visibleWidgets),
    [visibleWidgets],
  );
  const envBaseY = useMemo(
    () => sectionBaseY(sections.environment),
    [sections.environment],
  );
  const deviceBaseY = useMemo(
    () => sectionBaseY(sections.devices),
    [sections.devices],
  );
  // Exact height of each section grid: the group's REBASED content extent
  // (cards are absolutely positioned, so the shell must reserve the rows or
  // lower cards would be clipped).
  const envHeight = useMemo(
    () => sectionContentHeight(sections.environment, metrics),
    [sections.environment, metrics],
  );
  const deviceHeight = useMemo(
    () => sectionContentHeight(sections.devices, metrics),
    [sections.devices, metrics],
  );

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
            {activeDashboard ? (
              <WidgetServicesProvider services={services}>
                {visibleWidgets.length === 0 ? (
                  <Text style={styles.emptyHint}>
                    {STRINGS.dashboard.noWidgets}
                  </Text>
                ) : (
                  // Shared canvas wrapper: ONE `onLayout` measures the width
                  // BOTH section grids use — one `metrics` instance, so
                  // sensor and switch cards stay aligned on the same grid.
                  <View
                    onLayout={event => {
                      setCanvasWidth(event.nativeEvent.layout.width);
                    }}
                  >
                    {sections.environment.length > 0 ? (
                      <DashboardSection
                        styles={styles}
                        label={STRINGS.dashboard.environment}
                        pillStyle={styles.sectionPillEnvironment}
                        widgets={sections.environment}
                        layoutYOffset={envBaseY}
                        height={envHeight}
                        metrics={metrics}
                        registry={registry}
                      />
                    ) : null}
                    {sections.devices.length > 0 ? (
                      <DashboardSection
                        styles={styles}
                        label={STRINGS.dashboard.devices}
                        pillStyle={styles.sectionPillDevices}
                        widgets={sections.devices}
                        layoutYOffset={deviceBaseY}
                        height={deviceHeight}
                        metrics={metrics}
                        registry={registry}
                      />
                    ) : null}
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
  pillEnvironmentBg: string;
  pillEnvironmentBorder: string;
  pillDevicesBg: string;
  pillDevicesBorder: string;
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
    sectionPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 6,
      marginHorizontal: 16,
      marginBottom: 8,
    },
    sectionPillEnvironment: {
      backgroundColor: tokens.pillEnvironmentBg,
      borderColor: tokens.pillEnvironmentBorder,
    },
    sectionPillDevices: {
      backgroundColor: tokens.pillDevicesBg,
      borderColor: tokens.pillDevicesBorder,
    },
    sectionPillText: {
      fontSize: 14,
      fontFamily: INTER_SEMIBOLD,
      color: tokens.textPrimary,
    },
    // The explicit height is applied inline per section (DashboardSection)
    // so each shell matches its own group's rebased row extent exactly. The
    // inline `onLayout` on the shared canvas wrapper reports the real canvas
    // width up to `computeGridMetrics`.
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
