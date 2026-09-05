/**
 * DashboardScreen — the Dashboard tab's VIEW-ONLY surface (checkpoint
 * `1cd49cb` recipe, adapted to the Template model).
 *
 * Dumb screen: receives everything as props from the app root (App wires
 * the dashboard/device stores + services). Renders:
 * - page: the ACTIVE-THEME gel gradient (`tokens.gradient` — the same
 *   source the History screen uses). There is deliberately NO inset
 *   dashboard panel: header, MQTT badge, room strip, section labels, cards
 *   and empty states render directly on the gradient content,
 * - header row: app title (left) + MQTT connection badge (top-right; a
 *   translucent glass chip whose dot/text color is the live connection
 *   state — green only when online),
 * - room navigation: the controlled `RoomSelector` fed with the ACTIVE
 *   Template's ordered room references RESOLVED to physical room names
 *   (devices module owns the names — the Template only references ids).
 *   No "Tất cả" entry; exactly one room is viewed at a time. Selecting a
 *   room changes the VIEWED room only — it never navigates and never
 *   mutates persisted layout. The selection is presentation state (never
 *   written to persistence; the History tab keeps its own selection seam),
 * - SECTIONS: the selected room's Template widgets are split by the pure
 *   `groupWidgets` helper into "Môi trường" (sensor-value) and "Thiết bị"
 *   (switch + others); each non-empty section renders its gel section
 *   label DIRECTLY above its OWN `DashboardGrid`. Both section grids share
 *   the same measured canvas width (one `onLayout` wrapper → one
 *   `metrics` instance) and the same presentation mode, and both OPT INTO
 *   the gel card appearance (resolveCardTint tints + card shadow),
 * - RESPONSIVE: the measured canvas selects the presentation — wide canvas
 *   (>= `STACKED_BREAKPOINT`) uses the persisted absolute two-column grid;
 *   a narrow canvas stacks the cards one per row in section order WITHOUT
 *   rewriting the persisted coordinates (presentation-only reflow).
 *
 * There are NO create/edit/add/remove/resize/rebind controls and NO
 * Template navigation on this screen — every mutation and the Template →
 * Room → Widget hierarchy live behind the Settings tab's management stack.
 * The active Template is chosen/switched in Settings only; when it
 * disappears or loses a room reference the view normalizes WITHOUT
 * writing (dangling references are simply not displayed). Relay switches
 * stay operational through the widget components; committed state
 * reconciles from MQTT feedback.
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
  groupWidgets,
  resolveCanvasWidth,
  resolvePresentationMode,
  sectionBaseY,
  sectionContentHeight,
  type DashboardTemplate,
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
  /**
   * The ACTIVE Template (deterministically resolved by the app root). The
   * room strip lists ITS ordered room references; the widget content is
   * ITS layout for the selected room.
   */
  readonly template: DashboardTemplate | undefined;
  /** Connection snapshot (state + label) for the MQTT badge. */
  readonly connection: WidgetConnectionState;
  /**
   * All physical rooms (devices module): the strip resolves the active
   * Template's room-reference ids to these display names.
   */
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
  template,
  connection,
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

  // The ACTIVE Template's ordered room references resolved to physical
  // rooms (Template `order` is authoritative for the strip; display names
  // come from the devices module). Dangling references (physical room
  // deleted) are not displayed — the view normalizes without writing.
  const referencedRooms = useMemo(() => {
    if (!template) {
      return [];
    }
    const byId = new Map(rooms.map(room => [room.id, room]));
    return template.rooms
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(reference => byId.get(reference.roomId))
      .filter((room): room is Room => room !== undefined);
  }, [template, rooms]);

  // Viewed-room selection: presentation-only state. When the selection is
  // not part of the active Template's references (Template switched,
  // reference removed, first mount) it normalizes to the first referenced
  // room — deterministically, and WITHOUT any persistence write.
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const activeRoomId = useMemo(() => {
    if (referencedRooms.length === 0) {
      return null;
    }
    return referencedRooms.some(room => room.id === selectedRoomId)
      ? selectedRoomId!
      : referencedRooms[0]!.id;
  }, [referencedRooms, selectedRoomId]);

  // The selected room's Template layout (exactly ONE Template-room
  // reference — nothing from other Templates/rooms is co-rendered).
  const visibleWidgets = useMemo(() => {
    const reference = template?.rooms.find(
      candidate => candidate.roomId === activeRoomId,
    );
    return reference ? reference.widgets : [];
  }, [template, activeRoomId]);

  // Section split: "Môi trường" (sensor-value) and "Thiết bị"
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
          rooms={referencedRooms}
          activeRoomId={activeRoomId}
          onSelectRoom={setSelectedRoomId}
        />

        {referencedRooms.length === 0 ? (
          // The active Template references no (existing) rooms → point the
          // user at the Settings management hierarchy (the only place rooms
          // are added to a Template).
          <Text style={styles.emptyHint}>
            {STRINGS.dashboard.noTemplateRooms}
          </Text>
        ) : (
          <WidgetServicesProvider services={services}>
            {visibleWidgets.length === 0 ? (
              <Text style={styles.emptyHint}>
                {STRINGS.dashboard.noWidgets}
              </Text>
            ) : (
              // Shared canvas wrapper: ONE `onLayout` measures the width
              // BOTH section grids use — one `metrics` instance and one
              // presentation mode.
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
