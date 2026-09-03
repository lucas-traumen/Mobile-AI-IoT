/**
 * SensorValueWidget — biggest single reading for a sensor capability, with
 * an axis-labelled sparkline when laid out at width >= 2 (CP6 mock style).
 *
 * Card anatomy (approved Light/Dark design system): a line-style Ionicons
 * glyph inside a soft icon chip, a MUTED capability label, the big reading
 * in the capability SEMANTIC ACCENT with a small unit, and a secondary
 * caption — the delta "↑ 0,4 °C so với 1 giờ trước" (newest point vs the
 * point ~1h earlier in the series), plus a sparkline with y-axis
 * (max/mid/min) + x-axis (time) labels when wide.
 *
 * Display values use the Vietnamese decimal comma (`28,5`) through the pure
 * {@link formatVietnameseValue} helper — the numeric state, subscriptions
 * and history/query contracts stay numeric and untouched.
 *
 * Accents come from the theme tokens (`temperature`/`humidity`) or the
 * capability catalog color for custom capabilities.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { STRINGS } from '@core/i18n';
import { INTER_SEMIBOLD, useTheme } from '@core/theme';
import { deltaOverHorizon } from '@modules/devices/api';

import { parseWidgetSize, type WidgetConfig } from '../../domain/widgetTypes';
import { resolveCapabilityAccent } from '../../domain/capabilityColor';
import {
  useWidgetServices,
  useCapabilityState,
  useCapabilitySeries,
} from '../widgetContext';

/** One hour in millis — the delta comparison horizon (mock copy). */
const DELTA_HORIZON_MS = 3_600_000;

/** Sparkline geometry (SVG units). */
const SPARKLINE_VIEWBOX = { width: 100, height: 28 };
/** Sparkline stroke width (SVG units). */
const SPARKLINE_STROKE = 1.5;
/** Axis label font size inside the SVG (SVG units). */
const AXIS_FONT = 6;

/**
 * Pure display formatting: Vietnamese one-decimal value with a comma
 * decimal separator (`28.5` → `'28,5'`).
 *
 * Display-only: never feed the result back into numeric state or queries.
 * Non-finite input renders the em-dash placeholder (the widget uses the
 * same placeholder when no observation exists).
 *
 * @param value - the numeric reading.
 * @param digits - decimal digits (default 1, the widget's documented form).
 */
export function formatVietnameseValue(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(digits).replace('.', ',');
}

/**
 * Map a numeric series to a polyline path within the viewBox.
 * Returns `null` when the series does not have at least 2 points.
 */
function sparklinePoints(
  series: readonly number[],
): readonly { x: number; y: number }[] | null {
  if (series.length < 2) {
    return null;
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min;
  const stepX = SPARKLINE_VIEWBOX.width / (series.length - 1);
  return series.map((value, index) => {
    const y =
      span === 0
        ? SPARKLINE_VIEWBOX.height / 2
        : SPARKLINE_VIEWBOX.height -
          ((value - min) / span) * SPARKLINE_VIEWBOX.height;
    return { x: index * stepX, y };
  });
}

/** `HH:MM` wall-clock label for a series timestamp (axis ticks). */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sensor value widget: icon chip + muted label + big accent reading +
 * 1h delta caption + sparkline.
 *
 * @param props.config - widget config (binding + layout decide the display).
 */
export function SensorValueWidget({ config }: { config: WidgetConfig }) {
  const { tokens } = useTheme();
  const services = useWidgetServices();

  const capability = config.binding?.capability ?? 'temperature';
  const deviceId = config.binding?.deviceId ?? '';
  const enabled = !!config.binding && !!deviceId;

  // CP-R1: reactive subscriptions via useSyncExternalStore hooks.
  const state = useCapabilityState(deviceId, capability, enabled);
  const series = useCapabilitySeries(deviceId, capability, enabled);

  const def = services
    .getCapabilities()
    .find(candidate => candidate.type === capability);

  const size = parseWidgetSize(
    `${config.layout.width}x${config.layout.height}`,
  );
  const wide = (size?.width ?? 1) >= 2;
  const values = series.map(point => point.value);
  const points = wide ? sparklinePoints(values) : null;
  // "Now" is the newest observation's timestamp (pure: no Date.now in render).
  const newestTs = series.length > 0 ? series[series.length - 1].ts : 0;
  const delta = deltaOverHorizon(series, DELTA_HORIZON_MS, newestTs);

  // Accent: built-in temperature/humidity resolve from the active theme
  // tokens; custom capabilities use the catalog color (CP-R6 resolver).
  const accent = resolveCapabilityAccent(capability, def, tokens);
  const title =
    config.title ??
    def?.label ??
    (capability === 'temperature'
      ? STRINGS.dashboard.temperature
      : STRINGS.dashboard.humidity);
  const unit = def?.unit ?? (capability === 'temperature' ? '°C' : '%');

  const valueText =
    state && typeof state.value === 'number'
      ? formatVietnameseValue(state.value)
      : '—';

  const min = values.length > 0 ? Math.min(...values) : null;
  const max = values.length > 0 ? Math.max(...values) : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View
          style={[
            styles.iconChip,
            {
              backgroundColor: tokens.surfaceElevated,
              borderColor: tokens.border,
            },
          ]}
        >
          <Ionicons
            name={
              (def?.icon ?? 'pulse-outline') as keyof typeof Ionicons.glyphMap
            }
            size={18}
            color={accent}
          />
        </View>
        <Text style={[styles.title, { color: tokens.textSecondary }]}>
          {title}
        </Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: accent }]} numberOfLines={1}>
          {valueText}
        </Text>
        <Text style={[styles.unit, { color: accent }]}>{unit}</Text>
      </View>
      {delta !== null ? (
        <Text style={[styles.delta, { color: tokens.textSecondary }]}>
          {delta >= 0 ? '↑' : '↓'} {formatVietnameseValue(Math.abs(delta))}{' '}
          {unit} {STRINGS.dashboard.deltaVsHourAgo}
        </Text>
      ) : null}
      {points !== null && min !== null && max !== null ? (
        <View style={styles.sparkline}>
          <View style={styles.yAxis}>
            <Text style={[styles.axisLabel, { color: tokens.textSecondary }]}>
              {max.toFixed(0)}
            </Text>
            <Text style={[styles.axisLabel, { color: tokens.textSecondary }]}>
              {((max + min) / 2).toFixed(0)}
            </Text>
            <Text style={[styles.axisLabel, { color: tokens.textSecondary }]}>
              {min.toFixed(0)}
            </Text>
          </View>
          <View style={styles.chartCol}>
            <Svg
              width={SPARKLINE_VIEWBOX.width}
              height={SPARKLINE_VIEWBOX.height}
              viewBox={`0 0 ${SPARKLINE_VIEWBOX.width} ${SPARKLINE_VIEWBOX.height}`}
            >
              <Polyline
                points={points
                  .map(
                    p =>
                      `${Math.round(p.x * 10) / 10},${
                        Math.round(p.y * 10) / 10
                      }`,
                  )
                  .join(' ')}
                fill="none"
                stroke={accent}
                strokeWidth={SPARKLINE_STROKE}
              />
              <Line
                x1={0}
                y1={SPARKLINE_VIEWBOX.height}
                x2={SPARKLINE_VIEWBOX.width}
                y2={SPARKLINE_VIEWBOX.height}
                stroke={tokens.border}
                strokeWidth={0.5}
              />
            </Svg>
            <View style={styles.xAxis}>
              <Text style={[styles.axisLabel, { color: tokens.textSecondary }]}>
                {formatTime(series[0].ts)}
              </Text>
              <Text style={[styles.axisLabel, { color: tokens.textSecondary }]}>
                {formatTime(series[Math.floor(series.length / 2)].ts)}
              </Text>
              <Text style={[styles.axisLabel, { color: tokens.textSecondary }]}>
                {formatTime(series[series.length - 1].ts)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  // Soft icon chip (approved anatomy): elevated surface + border, the
  // capability accent colors the line-style glyph inside.
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 12, fontWeight: '600' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  value: { fontSize: 28, fontFamily: INTER_SEMIBOLD },
  unit: { fontSize: 14, fontWeight: '600' },
  // Secondary caption: muted (the accent is reserved for the value/unit).
  delta: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  sparkline: { marginTop: 8, flexDirection: 'row', gap: 4 },
  yAxis: {
    justifyContent: 'space-between',
    height: SPARKLINE_VIEWBOX.height,
    alignItems: 'flex-end',
  },
  chartCol: { flex: 1 },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  axisLabel: { fontSize: AXIS_FONT + 3 },
});
