/**
 * HistoryChartWidget — full-size (2x2) history chart for the widget's exact
 * bound `deviceId + capability` (CP-R5) with Min/Max/Trung bình stats.
 *
 * Queries through `queryHistory({ measurement, range, fields: [capability],
 * deviceIds: [deviceId] })` — never the whole room or default fields. The
 * result series matching the binding identity is rendered with
 * victory-native behind the active theme. The chart sizes from the MEASURED
 * card content width (`onLayout`, pure `chartLayout` policy) and can never
 * force a width larger than its parent. Loading / error / empty states come
 * from STRINGS.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VictoryAxis, VictoryChart, VictoryLine } from 'victory-native';

import { HISTORY_RANGES } from '@core/constants';
import { STRINGS } from '@core/i18n';
import { useTheme } from '@core/theme';
import type { HistoryRange, HistorySeries } from '@modules/history/api';
import { computeSeriesStats } from '@modules/history/api';
import { historyChartDimensions } from '../../domain/chartLayout';
import { resolveCapabilityAccent } from '../../domain/capabilityColor';
import {
  historyQueryForWidget,
  selectWidgetSeries,
} from '../../domain/historyQuery';

import type { WidgetConfig } from '../../domain/widgetTypes';
import { useWidgetServices } from '../widgetContext';

/** Default range shown when the widget mounts. */
const DEFAULT_RANGE: HistoryRange = '24h';

/** Card padding (points) — subtracted from the measured card width. */
const CARD_PADDING = 12;

/** `HH:MM` wall-clock label for a series timestamp (x axis ticks). */
function formatTick(t: number): string {
  return new Date(t * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * History chart widget: range chips + victory line chart + stats row.
 *
 * @param props.config - widget config (binding decides the exact query).
 */
export function HistoryChartWidget({ config }: { config: WidgetConfig }) {
  const { tokens } = useTheme();
  const services = useWidgetServices();
  // Measured sizing: the chart consumes the actual card CONTENT width (card
  // width from `onLayout` minus the card padding) — never the window width
  // and never a minimum that can exceed the parent (no narrow-card overflow).
  // Until the first layout event the pure policy falls back to a safe width.
  const [cardWidth, setCardWidth] = useState<number | null>(null);
  const [range, setRange] = useState<HistoryRange>(DEFAULT_RANGE);
  // Last resolved request: loading = no resolved result yet OR the resolved
  // range differs from the selected one (a newer request is in flight).
  const [result, setResult] = useState<{
    range: HistoryRange;
    series: readonly HistorySeries[];
    error: string | null;
  } | null>(null);

  const deviceId = config.binding?.deviceId ?? '';
  const capability = config.binding?.capability ?? 'temperature';
  const hasBinding = deviceId !== '';

  useEffect(() => {
    if (!hasBinding) {
      return;
    }
    let cancelled = false;
    // CP-R5: exact device + capability query (never default fields).
    services
      .queryHistory(historyQueryForWidget(deviceId, capability, range))
      .then(queryResult => {
        if (cancelled) {
          return;
        }
        if (queryResult.ok) {
          setResult({ range, series: queryResult.value, error: null });
        } else {
          setResult({ range, series: [], error: queryResult.error.message });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ range, series: [], error: STRINGS.history.error });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, deviceId, capability, hasBinding]);

  const loading = result === null || result.range !== range;
  const error = loading ? null : result?.error ?? null;
  const series = loading ? [] : result?.series ?? [];

  // CP-R5 (fix cycle 2): identity match is EXACT — `deviceId === bound id`
  // and `field === capability`. A legacy `deviceId: null` series (untagged
  // InfluxDB rows) is never accepted as a fallback, and neither is another
  // device's series.
  const match = selectWidgetSeries(series, deviceId, capability);
  const stats = match ? computeSeriesStats(match.points) : null;
  const data = match ? match.points.map(p => ({ x: p.t, y: p.value })) : [];

  const def = services
    .getCapabilities()
    .find(candidate => candidate.type === capability);
  const color = resolveCapabilityAccent(capability, def, tokens);

  const title = config.title ?? STRINGS.widgets.historyChart;
  // Responsive: chart size from the measured card content width (pure
  // policy — clamped, safe fallback, never wider than the parent).
  const chart = historyChartDimensions(
    cardWidth === null ? NaN : cardWidth - 2 * CARD_PADDING,
  );

  return (
    <View
      style={styles.card}
      onLayout={event => {
        setCardWidth(event.nativeEvent.layout.width);
      }}
    >
      <Text style={[styles.title, { color: tokens.textPrimary }]}>{title}</Text>

      <View style={[styles.chipRow, { borderColor: tokens.border }]}>
        {HISTORY_RANGES.map(r => (
          <TouchableOpacity
            key={r}
            style={[
              styles.chip,
              range === r && { backgroundColor: tokens.primary },
            ]}
            onPress={() => setRange(r)}
          >
            <Text
              style={[
                styles.chipText,
                { color: range === r ? tokens.surface : tokens.textSecondary },
              ]}
            >
              {STRINGS.history.ranges[r]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <Text style={[styles.hint, { color: tokens.textSecondary }]}>
          {STRINGS.history.loading}
        </Text>
      ) : null}
      {!loading && error ? (
        <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text>
      ) : null}
      {!loading && !error && data.length === 0 ? (
        <Text style={[styles.hint, { color: tokens.textSecondary }]}>
          {STRINGS.history.empty}
        </Text>
      ) : null}
      {!loading && !error && data.length > 0 ? (
        <>
          <View style={styles.chart}>
            <VictoryChart
              width={chart.width}
              height={chart.height}
              padding={{ top: 10, bottom: 24, left: 36, right: 6 }}
            >
              <VictoryAxis
                tickFormat={(tick: number) => formatTick(tick)}
                style={{
                  axis: { stroke: tokens.border },
                  tickLabels: {
                    fill: tokens.textSecondary,
                    fontSize: 9,
                  },
                }}
              />
              <VictoryAxis
                dependentAxis
                style={{
                  axis: { stroke: tokens.border },
                  tickLabels: {
                    fill: tokens.textSecondary,
                    fontSize: 9,
                  },
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
          </View>
          <View style={[styles.statsRow, { borderTopColor: tokens.border }]}>
            <Text
              style={[styles.stat, { color: tokens.textPrimary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {STRINGS.history.min}:{' '}
              <Text style={{ color: tokens.textSecondary }}>
                {stats === null || !match ? '—' : stats.min.toFixed(1)}
              </Text>
            </Text>
            <Text
              style={[styles.stat, { color: tokens.textPrimary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {STRINGS.history.max}:{' '}
              <Text style={{ color: tokens.textSecondary }}>
                {stats === null || !match ? '—' : stats.max.toFixed(1)}
              </Text>
            </Text>
            <Text
              style={[styles.stat, { color: tokens.textPrimary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {STRINGS.history.avg}:{' '}
              <Text style={{ color: tokens.textSecondary }}>
                {stats === null || !match ? '—' : stats.avg.toFixed(1)}
              </Text>
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: CARD_PADDING },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  chipRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 16,
    padding: 2,
    marginBottom: 8,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 14,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  chart: { alignItems: 'center' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 8,
  },
  stat: { fontSize: 12, fontWeight: '600' },
  hint: { textAlign: 'center', marginVertical: 20, fontSize: 13 },
  error: { textAlign: 'center', marginVertical: 20, fontSize: 13 },
});
