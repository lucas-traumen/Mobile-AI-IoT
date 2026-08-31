/**
 * History screen — Vietnamese room-aware sensor charts for 1h/24h/7d
 * (CP4 + CP-R5).
 *
 * Room selector: room chips only — the room-level "Tất cả" view was removed
 * (CP-R3); the screen shows the one shared active room. The content scrolls
 * vertically and renders one card per returned series — identity is
 * `deviceId + field`, labelled "device name · capability label" so two
 * same-field sensors of the room stay separate cards.
 *
 * Charting: `victory-native` (v36) on top of `react-native-svg`. All colors
 * come from the active theme tokens; per-series accents resolve through the
 * centralized capability resolver (built-ins themed, custom catalog colors).
 */

import React, { useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VictoryAxis, VictoryChart, VictoryLine } from 'victory-native';

import { HISTORY_RANGES } from '@core/constants';
import { STRINGS } from '@core/i18n';
import { useTheme, type ThemeTokens } from '@core/theme';
import type { CapabilityDef, Device, Room } from '@modules/devices/api';
import { resolveCapabilityAccent } from '@modules/widgets/api';
import {
  computeSeriesStats,
  type HistoryRange,
  type HistorySeries,
} from '@modules/history/api';

interface HistoryScreenProps {
  /** Selected range. */
  range: HistoryRange;
  /** Fetched series (one per deviceId + field). */
  series: HistorySeries[];
  loading: boolean;
  error: string | null;
  /** All rooms (chips). */
  rooms: readonly Room[];
  /** All devices (series card labels). */
  devices: readonly Device[];
  /** Capability catalog (card label/unit + accent fallback). */
  capabilities: readonly CapabilityDef[];
  /** The shared active room (`null` = no valid room — directed to Settings). */
  roomId: string | null;
  /** True when the active room has no telemetry sensor device (no query). */
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

function toChartData(points: { t: number; value: number }[]): ChartDatum[] {
  return points.map(p => ({ x: p.t, y: p.value }));
}

/** Format a number with one decimal + unit for the header row. */
function formatValue(value: number, unit: string): string {
  return unit ? `${value.toFixed(1)} ${unit}` : value.toFixed(1);
}

/**
 * History screen: room chips + range chips (1H/24H/7D) + one card per
 * device+capability series, each with a themed victory chart and a
 * Min/Max/Trung bình stats row. Content scrolls vertically.
 */
export function HistoryScreen({
  range,
  series,
  loading,
  error,
  rooms,
  devices,
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

  // One card per returned series (deviceId + field identity), in series
  // order — never merged by field alone. Legacy rows written WITHOUT a
  // `deviceId` tag (deviceId === null) are excluded: they cannot be
  // attributed to the room's devices, so room-specific history must not
  // guess an owner for them (the collector must add the deviceId tag —
  // see the app README's InfluxDB section).
  const cards = series
    .filter(entry => entry.deviceId !== null && entry.points.length > 0)
    .map(entry => {
      const def = capabilities.find(
        candidate => candidate.type === entry.field,
      );
      const device = entry.deviceId
        ? devices.find(candidate => candidate.id === entry.deviceId)
        : undefined;
      const deviceLabel = device?.name ?? entry.deviceId ?? '';
      return {
        key: `${entry.deviceId ?? 'legacy'}|${entry.field}`,
        title:
          deviceLabel !== ''
            ? `${deviceLabel} · ${def?.label ?? entry.field}`
            : def?.label ?? entry.field,
        unit: def?.unit ?? '',
        color: resolveCapabilityAccent(entry.field, def, tokens),
        points: entry.points,
      };
    });

  return (
    <View style={[styles.flex, { backgroundColor: tokens.background }]}>
      <Text style={[styles.headerTitle, { color: tokens.textPrimary }]}>
        {STRINGS.history.title}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.roomRow}
      >
        {rooms.map(room => {
          const active = room.id === roomId;
          return (
            <Pressable
              key={room.id}
              style={[
                styles.roomChip,
                { borderColor: active ? tokens.primary : tokens.border },
                active && { backgroundColor: tokens.primary },
              ]}
              testID={`room-chip-${room.id}`}
              onPress={() => onRoomChange(room.id)}
            >
              {room.icon ? (
                <Ionicons
                  name={room.icon as keyof typeof Ionicons.glyphMap}
                  size={14}
                  color={active ? tokens.onPrimary : tokens.textPrimary}
                />
              ) : null}
              <Text
                style={[
                  styles.roomChipText,
                  { color: active ? tokens.onPrimary : tokens.textPrimary },
                ]}
              >
                {room.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.rangeRow}>
        {HISTORY_RANGES.map(r => {
          const active = range === r;
          return (
            <TouchableOpacity
              key={r}
              style={[
                styles.rangeChip,
                { borderColor: active ? tokens.primary : tokens.border },
                active && { backgroundColor: tokens.primary },
              ]}
              onPress={() => onRangeChange(r)}
            >
              <Text
                style={[
                  styles.rangeText,
                  { color: active ? tokens.onPrimary : tokens.textSecondary },
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
        {!loading &&
        !error &&
        !noSensors &&
        rooms.length > 0 &&
        cards.length === 0 ? (
          <Text style={[styles.hint, { color: tokens.textSecondary }]}>
            {STRINGS.history.empty}
          </Text>
        ) : null}
        {/* Cards are hidden while the active room has no sensor device —
            stale series from the previously selected room must never stay
            on screen (fix cycle 1: noSensors also means "no valid series"). */}
        {!loading && !error && !noSensors
          ? cards.map(card => (
              <ChartCard
                key={card.key}
                title={card.title}
                unit={card.unit}
                data={toChartData(card.points)}
                color={card.color}
                availableWidth={windowWidth}
                tokens={tokens}
              />
            ))
          : null}
      </ScrollView>
    </View>
  );
}

/** One series card: header row (title + average, unit right) + chart + stats. */
function ChartCard({
  title,
  unit,
  data,
  color,
  availableWidth,
  tokens,
}: {
  title: string;
  unit: string;
  data: ChartDatum[];
  color: string;
  availableWidth: number;
  tokens: ThemeTokens;
}) {
  const stats = computeSeriesStats(data.map(d => ({ t: d.x, value: d.y })));
  // Responsive: the chart sizes from the available card width, not a fixed
  // 340 px (screen padding 2×12 + card padding 2×12 + axis gutter 45).
  const chartWidth = Math.max(200, availableWidth - 12 * 4 - 45);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.surface,
          borderColor: tokens.border,
          ...tokens.cardShadow,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: tokens.textPrimary }]}>
          {title}
        </Text>
        <Text style={[styles.cardUnit, { color }]}>
          {stats ? formatValue(stats.avg, unit) : '—'}
        </Text>
      </View>

      <VictoryChart
        width={chartWidth}
        height={180}
        padding={{ top: 10, bottom: 30, left: 45, right: 10 }}
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
        />
        <VictoryAxis
          dependentAxis
          style={{
            axis: { stroke: tokens.border },
            grid: { stroke: tokens.border },
            tickLabels: { fill: tokens.textSecondary, fontSize: 11 },
          }}
        />
        <VictoryLine
          data={data}
          x="x"
          y="y"
          style={{ data: { stroke: color, strokeWidth: 2 } }}
          interpolation="monotoneX"
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
  roomRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  roomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  roomChipText: { fontSize: 13, fontWeight: '500' },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 8,
  },
  rangeChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  rangeText: { fontSize: 13 },
  rangeTextActive: { fontWeight: '600' },
  content: { paddingBottom: 32 },
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  cardUnit: { fontSize: 13, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 10,
  },
  statColumn: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, marginBottom: 2 },
  statValue: { fontSize: 14, fontWeight: '600' },
  error: { textAlign: 'center', marginVertical: 12 },
  hint: { textAlign: 'center', marginVertical: 24 },
});
