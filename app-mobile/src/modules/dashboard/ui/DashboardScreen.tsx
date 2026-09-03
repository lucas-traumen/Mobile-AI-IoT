/**
 * DashboardScreen — view-only dashboard (History gel palette, screenshot 1).
 *
 * Dumb screen: receives everything as props from the app root (App wires the
 * dashboard/device stores + services). Renders the approved hierarchy:
 * - page: the ACTIVE-THEME gel gradient (`tokens.gradient` — the same
 *   source the History screen uses; warm peach → teal in Light, the dark
 *   gradient tokens in Dark). There is deliberately NO inset dashboard
 *   panel: header, MQTT badge, room strip, section labels, cards and empty
 *   states render directly on the gradient content,
 * - header row: app title (left) + MQTT connection badge (top-right; a
 *   translucent glass chip whose dot/text color is the live connection
 *   state — green only when online),
 * - room navigation: the controlled `RoomSelector` (non-wrapping horizontal
 *   quick strip + expandable full list) — no room-level "Tất cả"; exactly
 *   one shared active room is shown at a time,
 * - SECTIONS: the visible widgets are split by the pure `groupWidgets`
 *   helper into "Môi trường" (sensor-value + history-chart) and "Thiết bị"
 *   (switch + others); each non-empty section renders its gel section label
 *   DIRECTLY above its OWN `DashboardGrid`. Both section grids share the
 *   same measured canvas width (one `onLayout` wrapper → one `metrics`
 *   instance) and the same presentation mode, and both OPT INTO the gel
 *   card appearance (resolveCardTint tints + card shadow, the History card
 *   recipe) — the Settings editor keeps the default neutral cards.
 * - RESPONSIVE: the measured canvas selects the presentation — wide canvas
 *   (>= `STACKED_BREAKPOINT`) uses the persisted absolute two-column grid;
 *   a narrow canvas stacks the cards one per row in section order WITHOUT
 *   rewriting the persisted coordinates (presentation-only reflow). The
 *   Settings editor always keeps its absolute two-column grid.
 *
 * Production renders ONE active theme at a time (`ThemeProvider`); the
 * Light/Dark side-by-side panel is the throwaway HTML prototype only.
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
  resolvePresentationMode,
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
 * One dashboard section: the rectangular section label DIRECTLY above its
 * own grid. In absolute mode the grid renders the section group with the
 * group's rebase row (`layoutYOffset`) and reserves the group's exact
 * content height; in stacked mode the cards flow one per row (no reserved
 * height, persisted coords untouched).
 */
function DashboardSection({
  styles,
  label,
  widgets,
  presentation,
  layoutYOffset,
  height,
  metrics,
  registry,
}: {
  readonly styles: ScreenStyles;
  readonly label: string;
  readonly widgets: readonly WidgetConfig[];
  readonly presentation: 'absolute' | 'stacked';
  readonly layoutYOffset: number;
  /** Reserved shell height (absolute mode only; `undefined` = flow). */
  readonly height?: number;
  readonly metrics: GridMetrics;
  readonly registry: WidgetRegistry;
}) {
  return (
    <>
      <View style={styles.sectionLabel}>
        <Text style={styles.sectionLabelText}>{label}</Text>
      </View>
      <View style={height !== undefined ? { height } : undefined}>
        <DashboardGrid
          widgets={widgets}
          registry={registry}
          editMode={false}
          metrics={metrics}
          presentation={presentation}
          layoutYOffset={layoutYOffset}
          cardAppearance="gel"
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
  // ONE measured width source drives BOTH the metrics and the presentation
  // mode, so the two section grids can never disagree.
  const canvas = useMemo(
    () => resolveCanvasWidth(canvasWidth, width),
    [canvasWidth, width],
  );
  const metrics = useMemo(() => computeGridMetrics(canvas), [canvas]);
  const presentation = useMemo(() => resolvePresentationMode(canvas), [canvas]);

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

  // Section split: "Môi trường" (sensor-value + history-chart) and "Thiết bị"
  // (switch + others) — each non-empty group becomes its own labeled section
  // (label directly above its own grid).
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
  // Absolute mode only: exact shell height per section (the group's REBASED
  // content extent, or lower cards would be clipped). Stacked cards flow —
  // no reserved height needed.
  const envHeight = useMemo(
    () =>
      presentation === 'absolute'
        ? sectionContentHeight(sections.environment, metrics)
        : undefined,
    [presentation, sections.environment, metrics],
  );
  const deviceHeight = useMemo(
    () =>
      presentation === 'absolute'
        ? sectionContentHeight(sections.devices, metrics)
        : undefined,
    [presentation, sections.devices, metrics],
  );

  const dotColor = badgeColor(connection.state, tokens);

  return (
    // The active-theme gel gradient (History palette source) fills the tab;
    // all content renders directly on it (no inset dashboard panel).
    <LinearGradient colors={tokens.gradient} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appTitle}>{APP_NAME}</Text>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: tokens.surfaceGlass,
                borderColor: tokens.border,
              },
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
                  // Shared canvas wrapper: ONE `onLayout` measures the
                  // width BOTH section grids use — one `metrics` instance
                  // and one presentation mode.
                  <View
                    onLayout={event => {
                      setCanvasWidth(event.nativeEvent.layout.width);
                    }}
                  >
                    {sections.environment.length > 0 ? (
                      <DashboardSection
                        styles={styles}
                        label={STRINGS.dashboard.environment}
                        widgets={sections.environment}
                        presentation={presentation}
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
                        widgets={sections.devices}
                        presentation={presentation}
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
  surfaceGlass: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  chipActiveBg: string;
}) {
  return StyleSheet.create({
    flex: { flex: 1 },
    // Content sits directly on the gradient (no inset panel wrapper).
    content: { paddingHorizontal: 12, paddingBottom: 80 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 8,
      marginBottom: 14,
    },
    appTitle: {
      fontSize: 20,
      fontFamily: INTER_SEMIBOLD,
      color: tokens.textPrimary,
    },
    // Translucent glass chip on the gradient (dot/text colors are inline).
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    badgeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    badgeText: { fontSize: 12, fontWeight: '600' },
    // Rectangular gel section label (approved: 8–10px corners, translucent
    // chip tint — the History range-chip family).
    sectionLabel: {
      alignSelf: 'flex-start',
      borderRadius: 9,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.chipActiveBg,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginBottom: 10,
    },
    sectionLabelText: {
      fontSize: 12,
      fontFamily: INTER_SEMIBOLD,
      color: tokens.textSecondary,
    },
    emptyHint: {
      color: tokens.textSecondary,
      textAlign: 'center',
      marginTop: 40,
      fontSize: 14,
      paddingHorizontal: 32,
    },
  });
}
