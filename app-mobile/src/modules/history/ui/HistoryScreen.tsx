/**
 * History screen — Vietnamese room-aware sensor charts for 1h/24h/7d
 * (CP4 + CP-R5) in the Dashboard's gel visual language.
 *
 * Room navigation reuses the Dashboard's controlled `RoomSelector` (☰
 * expand + non-wrapping text-only quick strip + centered full-list modal),
 * imported through the dashboard module's public facade (boundaries rule:
 * cross-module UI only via `api/`). The room-level "Tất cả" view was removed
 * (CP-R3); the screen shows the one shared active room.
 *
 * Layout: gradient background (tokens.gradient, scoped to this screen),
 * centered gel range chips (active = translucent pill), and one gel card
 * per REGISTERED sensor — identity is the room-scoped `field` (approved
 * room-sensor rework: History is derived from the room's sensor
 * registrations, never configured). A registration without points renders
 * a `Chưa có dữ liệu` card instead of disappearing.
 *
 * Charting: `victory-native` (v36) on top of `react-native-svg`. All colors
 * come from the active theme tokens; per-series accents resolve through the
 * centralized capability resolver (built-ins themed, custom catalog colors).
 */

import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { G } from 'react-native-svg';
import {
  Background,
  Curve,
  LineSegment,
  VictoryAxis,
  VictoryChart,
  VictoryClipContainer,
  VictoryContainer,
  VictoryLabel,
  VictoryLine,
} from 'victory-native';

import { HISTORY_RANGES } from '@core/constants';
import { STRINGS } from '@core/i18n';
import { useTheme, type ThemeTokens } from '@core/theme';
import { RoomSelector } from '@modules/dashboard/api';
import type { CapabilityDef, Room } from '@modules/devices/api';
import { resolveCapabilityAccent } from '@modules/widgets/api';
import {
  computeSeriesStats,
  type HistoryRange,
  type HistorySeries,
} from '@modules/history/api';

/**
 * Explicit native SVG primitives for every victory component.
 *
 * React 19 removed `defaultProps` for function components, so
 * victory-native@36 can no longer attach its native primitive overrides
 * through `WrappedComponent.defaultProps` — without explicit props the
 * inner web class components fall back to their own WEB SVG defaults
 * (`React.createElement("line", …)`) and crash on device ("View config
 * getter callback for component 'line' must be a function"). Passing the
 * same primitives as explicit props restores native rendering. See
 * `src/modules/history/README.md`.
 */
const NATIVE_CHART_GROUP = <G />;
const NATIVE_CHART_CONTAINER = <VictoryContainer />;
const NATIVE_CHART_BACKGROUND = <Background />;
const NATIVE_AXIS_SEGMENT = <LineSegment />;
const NATIVE_LABEL = <VictoryLabel />;
const NATIVE_LINE_CURVE = <Curve />;
const NATIVE_LINE_GROUP = <VictoryClipContainer />;

interface HistoryScreenProps {
  /** Selected range. */
  range: HistoryRange;
  /** Fetched series (one per roomId + field for the queried room). */
  series: HistorySeries[];
  loading: boolean;
  error: string | null;
  /** All rooms (chips). */
  rooms: readonly Room[];
  /**
   * The active room's REGISTERED sensor fields (derived from the sensor
   * projection in the app wiring) — every entry renders one card, with or
   * without points.
   */
  registeredFields: readonly string[];
  /** Capability catalog (card label/unit + accent fallback). */
  capabilities: readonly CapabilityDef[];
  /** The shared active room (`null` = no valid room — directed to Settings). */
  roomId: string | null;
  /** True when the active room has no registered sensor (no query). */
  noSensors: boolean;
  /** Called when the user picks a new range. */
  onRangeChange: (range: HistoryRange) => void;
  /** Called when the user picks a room (updates the shared active room). */
  onRoomChange: (roomId: string) => void;
  /** Called once when the screen mounts (initial fetch). */
  onMount?: () => void;
}

interface ChartDatum {
  x: number;
  y: number;
}

/** One prepared per-registration card model. */
interface SeriesCardModel {
  /** Stable card identity: the room-scoped field. */
  key: string;
  /** Raw capability field (gel tint key + accent + series pairing). */
  field: string;
  /** Card header label (capability label, `def?.label ?? field`). */
  fieldLabel: string;
  /** Line/card accent (theme tokens for built-ins, catalog color else). */
  color: string;
  points: { t: number; value: number }[];
}

function toChartData(points: { t: number; value: number }[]): ChartDatum[] {
  return points.map(p => ({ x: p.t, y: p.value }));
}

/**
 * Gel card tint for a history series: the SAME pastel tokens the Dashboard
 * cards use, keyed by the capability field. History cards are not widgets
 * (they have no WidgetConfig/binding), so this is a small pure field →
 * token mapping instead of a `resolveCardTint` call with a fake config —
 * temperature/humidity get their pastel tints, everything else falls back
 * to the neutral glass surface.
 */
function cardTintForField(field: string, tokens: ThemeTokens): string {
  switch (field) {
    case 'temperature':
      return tokens.cardTintTemperature;
    case 'humidity':
      return tokens.cardTintHumidity;
    default:
      return tokens.surfaceGlass;
  }
}

/**
 * History screen: shared RoomSelector row + centered gel range chips
 * (1H/24H/7D) + one gel card per device+capability series, each with a
 * themed victory chart and a Min/Max/Trung bình stats row; content scrolls
 * vertically.
 */
export function HistoryScreen({
  range,
  series,
  loading,
  error,
  rooms,
  registeredFields,
  capabilities,
  roomId,
  noSensors,
  onRangeChange,
  onRoomChange,
  onMount,
}: HistoryScreenProps) {
  const { tokens } = useTheme();
  const { width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    if (onMount) {
      onMount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One card per REGISTERED sensor field (approved derived History): the
  // card exists whether or not the query returned points — a registered
  // sensor without data shows `Chưa có dữ liệu` instead of disappearing.
  // Defensive room identity (approved `roomId + field`, "never guess"
  // contract): a series is paired ONLY when its non-null `roomId` equals
  // the active room — untagged (`null`) and wrong-room series can never
  // populate a card (the pairing runs even though the Flux query already
  // filters the room, so a legacy/broken source cannot leak points in).
  const cards: SeriesCardModel[] = registeredFields.map(field => {
    const entry =
      roomId === null
        ? undefined
        : series.find(
            candidate =>
              candidate.field === field &&
              candidate.roomId !== null &&
              candidate.roomId === roomId,
          );
    const def = capabilities.find(candidate => candidate.type === field);
    return {
      key: field,
      field,
      fieldLabel: def?.label ?? field,
      color: resolveCapabilityAccent(field, def, tokens),
      points: entry?.points ?? [],
    };
  });

  return (
    // Gel gradient scoped to this screen (same direction as Dashboard).
    <LinearGradient colors={tokens.gradient} style={styles.flex}>
      <Text style={[styles.headerTitle, { color: tokens.textPrimary }]}>
        {STRINGS.history.title}
      </Text>

      {/* Room navigation = the Dashboard's controlled RoomSelector (its
          styles own the strip discipline; imported via the dashboard api
          facade per the module boundaries rules). */}
      <RoomSelector
        rooms={rooms}
        activeRoomId={roomId}
        onSelectRoom={onRoomChange}
      />

      <View style={styles.rangeRow} testID="history-range-row">
        {HISTORY_RANGES.map(r => {
          const active = range === r;
          return (
            <TouchableOpacity
              key={r}
              testID={`history-range-${r}`}
              style={[
                styles.rangeChip,
                { borderColor: active ? tokens.chipActiveBg : tokens.border },
                active && { backgroundColor: tokens.chipActiveBg },
              ]}
              onPress={() => onRangeChange(r)}
            >
              <Text
                style={[
                  styles.rangeText,
                  { color: active ? tokens.textPrimary : tokens.textSecondary },
                  active && styles.rangeTextActive,
                ]}
              >
                {r.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Vertical scrolling content (any number of series). */}
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={[styles.hint, { color: tokens.textSecondary }]}>
            {STRINGS.history.loading}
          </Text>
        ) : null}
        {!loading && error ? (
          <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text>
        ) : null}
        {!loading && !error && rooms.length === 0 ? (
          <Text style={[styles.hint, { color: tokens.textSecondary }]}>
            {STRINGS.dashboard.noRooms}
          </Text>
        ) : null}
        {!loading && !error && rooms.length > 0 && noSensors ? (
          <Text style={[styles.hint, { color: tokens.textSecondary }]}>
            {STRINGS.history.noSensorForRoom}
          </Text>
        ) : null}
        {/* One card per registered sensor — with or without points. Hidden
            while the active room has no registration: stale series from the
            previously selected room must never stay on screen. */}
        {!loading && !error && !noSensors
          ? cards.map(card => (
              <ChartCard
                key={card.key}
                field={card.field}
                fieldLabel={card.fieldLabel}
                data={toChartData(card.points)}
                color={card.color}
                availableWidth={windowWidth}
                tokens={tokens}
              />
            ))
          : null}
      </ScrollView>
    </LinearGradient>
  );
}

/**
 * One series card: gel surface (pastel tint + inner light edge), capability
 * label header, victory chart and the Min/Max/Trung bình stats row. A
 * registered sensor WITHOUT points renders the `Chưa có dữ liệu` state
 * instead of an empty chart (approved derived-History contract).
 */
function ChartCard({
  field,
  fieldLabel,
  data,
  color,
  availableWidth,
  tokens,
}: {
  field: string;
  fieldLabel: string;
  data: ChartDatum[];
  color: string;
  availableWidth: number;
  tokens: ThemeTokens;
}) {
  const stats = computeSeriesStats(data.map(d => ({ t: d.x, value: d.y })));
  // Responsive: the chart fills the card content width exactly (window
  // minus screen margin 2×12 and card padding 2×12). The axis gutter is
  // INTERNAL to VictoryChart (padding.left 45) and must NOT be subtracted
  // again — double-subtracting it rendered every chart 45pt narrower than
  // its card, and the left-aligned chart left a dead strip on the right.
  const chartWidth = Math.max(200, availableWidth - 12 * 4);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardTintForField(field, tokens),
          ...tokens.cardShadow,
        },
      ]}
    >
      {/* Inner gel edge: translucent white hairline just inside the rim
          separates the card from the gradient background (token-driven;
          pointerEvents none so it never intercepts touches). */}
      <View
        style={[styles.cardInnerEdge, { borderColor: tokens.cardInnerEdge }]}
        pointerEvents="none"
      />
      <Text style={[styles.cardLabel, { color }]}>{fieldLabel}</Text>

      {data.length === 0 ? (
        // Registered but no Influx points yet (or demo disabled) — the
        // card stays visible with the explicit no-data state.
        <View style={styles.noDataWrap}>
          <Text style={[styles.noDataText, { color: tokens.textSecondary }]}>
            {STRINGS.history.noData}
          </Text>
        </View>
      ) : (
        <>
          <VictoryChart
            width={chartWidth}
            height={240}
            padding={{ top: 10, bottom: 30, left: 45, right: 10 }}
            groupComponent={NATIVE_CHART_GROUP}
            containerComponent={NATIVE_CHART_CONTAINER}
            backgroundComponent={NATIVE_CHART_BACKGROUND}
          >
            <VictoryAxis
              tickFormat={(tick: number) =>
                new Date(tick * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }
              style={{
                axis: { stroke: tokens.border },
                grid: { stroke: 'transparent' },
                tickLabels: { fill: tokens.textSecondary, fontSize: 11 },
              }}
              axisComponent={NATIVE_AXIS_SEGMENT}
              tickComponent={NATIVE_AXIS_SEGMENT}
              gridComponent={NATIVE_AXIS_SEGMENT}
              tickLabelComponent={NATIVE_LABEL}
              axisLabelComponent={NATIVE_LABEL}
              groupComponent={NATIVE_CHART_GROUP}
            />
            <VictoryAxis
              dependentAxis
              style={{
                axis: { stroke: tokens.border },
                grid: { stroke: tokens.border },
                tickLabels: { fill: tokens.textSecondary, fontSize: 11 },
              }}
              axisComponent={NATIVE_AXIS_SEGMENT}
              tickComponent={NATIVE_AXIS_SEGMENT}
              gridComponent={NATIVE_AXIS_SEGMENT}
              tickLabelComponent={NATIVE_LABEL}
              axisLabelComponent={NATIVE_LABEL}
              groupComponent={NATIVE_CHART_GROUP}
            />
            <VictoryLine
              data={data}
              x="x"
              y="y"
              style={{ data: { stroke: color, strokeWidth: 2 } }}
              interpolation="monotoneX"
              dataComponent={NATIVE_LINE_CURVE}
              groupComponent={NATIVE_LINE_GROUP}
              containerComponent={NATIVE_CHART_CONTAINER}
              labelComponent={NATIVE_LABEL}
            />
          </VictoryChart>

          <View style={[styles.statsRow, { borderTopColor: tokens.border }]}>
            <View style={styles.statColumn}>
              <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>
                {STRINGS.history.min}
              </Text>
              <Text style={[styles.statValue, { color: tokens.textPrimary }]}>
                {stats ? stats.min.toFixed(1) : '—'}
              </Text>
            </View>
            <View style={styles.statColumn}>
              <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>
                {STRINGS.history.max}
              </Text>
              <Text style={[styles.statValue, { color: tokens.textPrimary }]}>
                {stats ? stats.max.toFixed(1) : '—'}
              </Text>
            </View>
            <View style={styles.statColumn}>
              <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>
                {STRINGS.history.avg}
              </Text>
              <Text style={[styles.statValue, { color }]}>
                {stats ? stats.avg.toFixed(1) : '—'}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 8,
  },
  // Gel pill: the ACTIVE chip's translucent tint + border come from
  // `tokens.chipActiveBg` (see the render site); inactive chips keep the
  // hairline border with no fill.
  rangeChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  rangeText: { fontSize: 13 },
  rangeTextActive: { fontWeight: '700' },
  content: { paddingBottom: 32 },
  // Gel card: borderless rounded surface (Dashboard card recipe) — the
  // pastel tint is applied inline; the translucent inner edge view renders
  // the light rim.
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    borderRadius: 20,
  },
  cardInnerEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 1,
  },
  // Capability label only (NO device name, NO header average).
  cardLabel: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  // Registered-sensor no-data state (approved derived History).
  noDataWrap: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: { fontSize: 14 },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 10,
  },
  statColumn: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 13, marginBottom: 2 },
  statValue: { fontSize: 17, fontWeight: '600' },
  error: { textAlign: 'center', marginVertical: 12 },
  hint: { textAlign: 'center', marginVertical: 24 },
});
