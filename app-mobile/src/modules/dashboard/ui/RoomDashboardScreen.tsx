/**
 * RoomDashboardScreen — the third level of the official hierarchy: ONE
 * Template-room layout's widget dashboard. The header shows back, the
 * physical room name, the Template name and `Chỉnh sửa`; the body renders
 * ONLY that room reference's widgets (sections + gel card palette). No
 * Template chooser, no room chips and no Settings editor link appear here —
 * templates/other rooms are never co-rendered with this room's widgets.
 *
 * The persisted two-column grid is canonical on wide canvases (>= 560pt);
 * narrow phones stack one card per row as presentation-only reflow that
 * never reads or rewrites persisted coordinates. Widgets stay live and
 * commandable (relay truth reconciles from MQTT feedback); a lost binding
 * renders the repair picker only in the EDIT screen, not here (the view
 * screen is one level, not an editor).
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { STRINGS } from '@core/i18n';
import { INTER_SEMIBOLD, useTheme, type ThemeTokens } from '@core/theme';

import {
  computeGridMetrics,
  resolveCanvasWidth,
  resolvePresentationMode,
} from '../internal/domain/gridMetrics';
import {
  groupWidgets,
  sectionBaseY,
  sectionContentHeight,
} from '../internal/domain/sectionGroups';
import type { DashboardTemplate } from '../internal/domain/dashboardSchema';
import type { Room } from '@modules/devices/api';
import type {
  WidgetConfig,
  WidgetRegistry,
  WidgetServices,
} from '@modules/widgets/api';
import { WidgetServicesProvider } from '@modules/widgets/api';

import { DashboardGrid } from './DashboardGrid';

/** Grid metrics shape passed down to the section grids. */
type GridMetrics = ReturnType<typeof computeGridMetrics>;
type ScreenStyles = ReturnType<typeof makeStyles>;

/**
 * One section: label pill directly above its own grid (gel palette).
 */
function RoomSection({
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

interface RoomDashboardScreenProps {
  /** The Template owning the room reference (undefined → truthful empty). */
  readonly template: DashboardTemplate | undefined;
  /** The referenced physical room id. */
  readonly roomId: string;
  /** All physical rooms (header name lookup). */
  readonly rooms: readonly Room[];
  /** The widget registry (resolves components). */
  readonly registry: WidgetRegistry;
  /** Runtime widget services (live state, commands). */
  readonly services: WidgetServices;
  /** Navigate back to the room list. */
  readonly onBack: () => void;
  /** Open the room-scoped edit screen. */
  readonly onEdit: () => void;
}

/**
 * The room widget dashboard screen (view-only, one level).
 *
 * @param props - see {@link RoomDashboardScreenProps}.
 */
export function RoomDashboardScreen({
  template,
  roomId,
  rooms,
  registry,
  services,
  onBack,
  onEdit,
}: RoomDashboardScreenProps) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  // Measured canvas: one width source for BOTH section grids.
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null);

  const roomName = rooms.find(room => room.id === roomId)?.name ?? roomId;
  const roomReference = template?.rooms.find(room => room.roomId === roomId);
  const widgets = roomReference?.widgets ?? [];

  // The widgets live inside their room reference; filter defensively by
  // roomId too (mirror-field invariant) so a stray placement never renders.
  const visibleWidgets = useMemo(
    () => widgets.filter(widget => widget.roomId === roomId),
    [widgets, roomId],
  );

  const presentation = useMemo(
    () => resolvePresentationMode(resolveCanvasWidth(canvasWidth, 1024)),
    [canvasWidth],
  );
  // `metrics` needs a real canvas; before the first onLayout event the
  // stacked/absolute split waits on the fallback width above.
  const metrics = useMemo(
    () => computeGridMetrics(resolveCanvasWidth(canvasWidth, 1024)),
    [canvasWidth],
  );

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
  const envHeight =
    presentation === 'absolute'
      ? sectionContentHeight(sections.environment, metrics)
      : undefined;
  const deviceHeight =
    presentation === 'absolute'
      ? sectionContentHeight(sections.devices, metrics)
      : undefined;

  return (
    <LinearGradient colors={tokens.gradient} style={styles.flex}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={onBack}
          hitSlop={8}
          testID="room-dashboard-back"
          accessibilityRole="button"
          accessibilityLabel={STRINGS.settings.back}
        >
          <Ionicons name="arrow-back" size={20} color={tokens.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {roomName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {template?.name ?? ''}
          </Text>
        </View>
        <Pressable
          style={[styles.editButton, { backgroundColor: tokens.primary }]}
          onPress={onEdit}
          testID="room-dashboard-edit"
          accessibilityRole="button"
          accessibilityLabel={STRINGS.templates.editRoom}
        >
          <Ionicons name="create-outline" size={15} color={tokens.onPrimary} />
          <Text style={[styles.editButtonText, { color: tokens.onPrimary }]}>
            {STRINGS.templates.editRoom}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <WidgetServicesProvider services={services}>
          {visibleWidgets.length === 0 ? (
            <Text style={styles.emptyHint}>{STRINGS.dashboard.noWidgets}</Text>
          ) : (
            <View
              onLayout={event => {
                setCanvasWidth(event.nativeEvent.layout.width);
              }}
            >
              {sections.environment.length > 0 ? (
                <RoomSection
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
                <RoomSection
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
      </ScrollView>
    </LinearGradient>
  );
}

const makeStyles = (tokens: ThemeTokens) =>
  StyleSheet.create({
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    backButton: { padding: 4 },
    headerText: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 20,
      fontFamily: INTER_SEMIBOLD,
      color: tokens.textPrimary,
    },
    subtitle: { fontSize: 12, color: tokens.textSecondary, marginTop: 1 },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    editButtonText: { fontSize: 13, fontWeight: '700' },
    content: { paddingHorizontal: 12, paddingBottom: 40 },
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
