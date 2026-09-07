/**
 * HistoryChartCard — one Smart Home chart card on the History tab
 * (history-smart-home-redesign): white card surface (`smart.colors.card`),
 * hairline `cardBorder`, `smart.radius.card` corners, the subtle smart
 * card shadow, and the approved anatomy — sensor icon + title + stats
 * (Thấp nhất / Cao nhất / Trung bình WITH units) + the victory-native
 * line/area chart with a touch tooltip.
 *
 * Strictly presentational: receives the field identity, label, unit,
 * points, accent color, layout metrics and the SHARED time axis (domain +
 * tick formatter from `timeAxis.ts`, so every card aligns). Stats are
 * computed from the SAME points the chart renders (`computeSeriesStats`) —
 * no mockup numbers; a registered sensor without points renders the
 * truthful `Chưa có dữ liệu` state (NEVER a 0).
 *
 * Chart recipe (approved spec): line strokeWidth 2 + area fill in the same
 * accent at ~5% opacity, light-gray grid, the shared 24h tick format
 * (date added when the range crosses midnight, reduced tick count on
 * narrow widths), height 160–200 phone / 200–240 tablet. Tooltip:
 * `VictoryVoronoiContainer` + `VictoryTooltip` — hidden on mount, shown on
 * touch, and de-activated on touch end (`activateData={false}` keeps the
 * label lifecycle label-only, so the release/cancel event clears it).
 *
 * victory-native@36 on React 19 REQUIRES explicit native SVG primitives
 * (the `NATIVE_CHART_*` pattern — function-component `defaultProps` no
 * longer exist, so without explicit props the inner web components crash
 * on device). This applies to the chart, both axes, the line, the area,
 * the voronoi container AND the tooltip (its label/flyout/group).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ClipPath, G, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  Background,
  Curve,
  Flyout,
  LineSegment,
  Path,
  VictoryArea,
  VictoryAxis,
  VictoryChart,
  VictoryClipContainer,
  VictoryContainer,
  VictoryLabel,
  VictoryLine,
  VictoryTooltip,
  VictoryVoronoiContainer,
} from 'victory-native';

import { STRINGS } from '@core/i18n';
import type { ThemeTokens } from '@core/theme';

import { computeSeriesStats } from '@modules/history/api';

import { formatTooltipTime, type TimeDomain } from './timeAxis';

/** Explicit native SVG primitives (React 19 `defaultProps` workaround). */
const NATIVE_CHART_GROUP = <G />;
const NATIVE_CHART_CONTAINER = <VictoryContainer />;
const NATIVE_CHART_BACKGROUND = <Background />;
const NATIVE_AXIS_SEGMENT = <LineSegment />;
const NATIVE_LABEL = <VictoryLabel />;

/**
 * WEB-SAFE line/area curve (user-acceptance fix: axes painted but the
 * VictoryLine/VictoryArea shapes did NOT on the web build).
 *
 * Root cause: victory's `Curve` (victory-line/es/curve.js) ALWAYS passes
 * `pathComponent` down to its inner `Path` — it is in `defaultProps` and
 * Curve never strips it before `cloneElement(props.pathComponent, props)`.
 * With the React-19 native-primitive workaround `dataComponent={<Curve/>}`,
 * that inner path component is victory-native's `VPath`, which spreads ALL
 * of its props onto react-native-svg's `Path`. On web, react-native-svg's
 * `WebShape.render` forwards every prop through `unstable_createElement`
 * onto the DOM `<path>`, so the RN-only `pathComponent` prop (a React
 * element object) reaches the DOM and react-dom REJECTS the render with
 * `warnUnknownProperties` — the shape never paints.
 *
 * Why the axes survived: `LineSegment` (victory-core/es) clones its
 * `lineComponent` with an EXPLICIT prop whitelist (x1/x2/y1/y2/style/…) and
 * drops `lineComponent`/`pathComponent`, so nothing RN-only leaks.
 *
 * Fix: a small module-local wrapper around victory's own `Curve` that
 * passes `<Path/>` as the `pathComponent` AND strips that same prop from
 * the spread. Curve's explicit `cloneElement` payload (`d`, evaluated
 * style, transform, role, shapeRendering, className, clipPath, tabIndex,
 * aria-label) is already SVG-safe, and victory-native's `VPath` converts
 * the style object into native props. Result: the computed victory `d`
 * string + stroke/fill reach the `<path>` identically on web AND native,
 * and no RN-only `pathComponent` element ever reaches the DOM. The wrapper
 * keeps the `Curve` component identity in the tree (regression-guardable)
 * and keeps the explicit native-primitive pattern intact.
 *
 * @param props - the full victory `Curve` props (from VictoryLine/Area).
 */
type CurveProps = React.ComponentProps<typeof Curve>;
const SafeCurve = (props: CurveProps) => {
  const { pathComponent: _discarded, ...rest } = props;
  return <Curve pathComponent={<Path />} {...rest} />;
};
const NATIVE_LINE_CURVE = <SafeCurve />;
const NATIVE_AREA_CURVE = <SafeCurve />;

/**
 * The React-19 `defaultProps` workaround REQUIRES explicit primitives for
 * EVERY component slot victory would otherwise default — including the clip
 * path inside `VictoryClipContainer` (`clipPathComponent`, which no caller
 * here overrode). Without it the line/area CLIP group silently drops back
 * to victory-core's web `<ClipPath>` and crashes on device. Provide an
 * explicit native `<ClipPath>` so the clip container is fully native too.
 * (VictoryClipContainer renders its own `<Defs>` wrapper; only the clip
 * path itself needed the explicit primitive.)
 */
const NATIVE_CLIP_PATH = <ClipPath />;
const NATIVE_LINE_GROUP = (
  <VictoryClipContainer clipPathComponent={NATIVE_CLIP_PATH} />
);
const NATIVE_VORONOI_CONTAINER = (
  // activateData=false: activation/deactivation is LABEL-only, so the
  // touch-release/cancel events genuinely clear the tooltip (the approved
  // "hidden after interaction ends" contract).
  <VictoryVoronoiContainer activateData={false} />
);
const NATIVE_TOOLTIP_LABEL = (
  <VictoryLabel textComponent={<SvgText />} backgroundComponent={<G />} />
);
const NATIVE_TOOLTIP_FLYOUT = <Flyout pathComponent={<Path />} />;
const NATIVE_TOOLTIP_GROUP = <G />;
const NATIVE_TOOLTIP = (
  <VictoryTooltip
    renderInPortal={false}
    labelComponent={NATIVE_TOOLTIP_LABEL}
    flyoutComponent={NATIVE_TOOLTIP_FLYOUT}
    groupComponent={NATIVE_TOOLTIP_GROUP}
  />
);

export interface HistoryChartCardProps {
  /** Base testID (`<testID>-icon`, `-no-data`, …). */
  readonly testID: string;
  /** The Ionicons glyph for the card header (22–24pt). */
  readonly icon: keyof typeof Ionicons.glyphMap;
  /** Card title WITHOUT the unit (e.g. `Nhiệt độ`). */
  readonly label: string;
  /** Display unit (appended to the title + every stat value; may be ''). */
  readonly unit: string;
  /** The series points the chart AND the stats are computed from. */
  readonly points: readonly { t: number; value: number }[];
  /** Series accent (temperature teal / humidity blue / catalog color). */
  readonly color: string;
  /** Active theme tokens (theme-aware via the smart block only). */
  readonly tokens: ThemeTokens;
  /** Card content width in px (the chart fills it minus padding/border). */
  readonly chartWidth: number;
  /** Chart height: 160–200 phone / 200–240 tablet (responsive). */
  readonly chartHeight: number;
  /** Wide canvas → stats sit RIGHT of the title row; else below it. */
  readonly wide: boolean;
  /** The SHARED x-domain (same for every card on the screen). */
  readonly domain: TimeDomain;
  /** The SHARED x-axis tick values (same for every card). */
  readonly tickValues: readonly number[];
  /** The SHARED x-axis tick formatter (same for every card). */
  readonly tickFormat: (t: number) => string;
}

/**
 * One Smart Home history chart card.
 *
 * @param props - see {@link HistoryChartCardProps}.
 */
export function HistoryChartCard({
  testID,
  icon,
  label,
  unit,
  points,
  color,
  tokens,
  chartWidth,
  chartHeight,
  wide,
  domain,
  tickValues,
  tickFormat,
}: HistoryChartCardProps) {
  const stats = computeSeriesStats(
    points.map(point => ({ t: point.t, value: point.value })),
  );
  const title = unit ? `${label} (${unit})` : label;
  const statsRow = (
    <View
      style={[styles.statsRow, wide ? styles.statsRowWide : null]}
      testID={`${testID}-stats`}
    >
      <StatCell
        label={STRINGS.history.statMin}
        value={stats?.min ?? null}
        unit={unit}
        tokens={tokens}
      />
      <StatCell
        label={STRINGS.history.statMax}
        value={stats?.max ?? null}
        unit={unit}
        tokens={tokens}
      />
      <StatCell
        label={STRINGS.history.statAvg}
        value={stats?.avg ?? null}
        unit={unit}
        tokens={tokens}
      />
    </View>
  );

  // The chart fills the card's inner width exactly: the screen passes the
  // band content width and we subtract this card's own padding (2×16) and
  // hairline border (2×1) — the axis gutter is INTERNAL to VictoryChart
  // (padding.left) and must not be subtracted again.
  const innerWidth = Math.max(
    200,
    chartWidth - tokens.smart.spacing.cardPadding * 2 - 2,
  );

  // The tooltip text function is resolved EAGERLY by victory even while a
  // point is inactive (its `text` prop is evaluated against a placeholder
  // datum without values) — so the formatter must tolerate a value-less
  // datum and only produce text for real points.
  const tooltipText = ({
    datum,
  }: {
    datum: { x?: number; y?: number };
  }): string =>
    typeof datum.x === 'number' && typeof datum.y === 'number'
      ? `${formatTooltipTime(datum.x)} · ${datum.y.toFixed(1)}${
          unit ? ` ${unit}` : ''
        }`
      : '';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.smart.colors.card,
          borderColor: tokens.smart.colors.cardBorder,
          borderRadius: tokens.smart.radius.card,
          padding: tokens.smart.spacing.cardPadding,
          marginBottom: tokens.smart.spacing.cardGap,
        },
        tokens.smart.cardShadow,
      ]}
    >
      <View style={wide ? styles.headerWide : styles.headerStacked}>
        <View style={styles.titleRow}>
          <Ionicons
            testID={`${testID}-icon`}
            name={icon}
            size={22}
            color={color}
          />
          <Text
            style={[
              styles.cardTitle,
              {
                color: tokens.smart.colors.textPrimary,
                fontSize: tokens.smart.typography.cardTitle,
              },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        {wide ? statsRow : null}
      </View>
      {wide ? null : statsRow}

      {points.length === 0 ? (
        // Registered but no points yet — the card stays visible with the
        // truthful no-data state (NEVER rendered as 0).
        <View style={styles.noDataWrap} testID={`${testID}-no-data`}>
          <Text
            style={[
              styles.noDataText,
              { color: tokens.smart.colors.textSecondary },
            ]}
          >
            {STRINGS.history.noData}
          </Text>
        </View>
      ) : (
        <VictoryChart
          width={innerWidth}
          height={chartHeight}
          padding={{ top: 12, bottom: 28, left: 44, right: 12 }}
          domain={{ x: [domain.start, domain.end] }}
          containerComponent={NATIVE_VORONOI_CONTAINER}
          groupComponent={NATIVE_CHART_GROUP}
          backgroundComponent={NATIVE_CHART_BACKGROUND}
        >
          <VictoryAxis
            tickValues={[...tickValues]}
            tickFormat={tickFormat}
            style={{
              axis: { stroke: tokens.smart.colors.cardBorder },
              grid: { stroke: 'transparent' },
              tickLabels: {
                fill: tokens.smart.colors.textSecondary,
                fontSize: 11,
              },
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
            tickCount={4}
            style={{
              axis: { stroke: 'transparent' },
              grid: { stroke: tokens.smart.colors.cardBorder },
              tickLabels: {
                fill: tokens.smart.colors.textSecondary,
                fontSize: 11,
              },
            }}
            axisComponent={NATIVE_AXIS_SEGMENT}
            tickComponent={NATIVE_AXIS_SEGMENT}
            gridComponent={NATIVE_AXIS_SEGMENT}
            tickLabelComponent={NATIVE_LABEL}
            axisLabelComponent={NATIVE_LABEL}
            groupComponent={NATIVE_CHART_GROUP}
          />
          {/* Area fill: the SAME accent at ~5% opacity under the line. */}
          <VictoryArea
            data={[...points]}
            x="t"
            y="value"
            interpolation="monotoneX"
            style={{ data: { fill: color, fillOpacity: 0.05 } }}
            dataComponent={NATIVE_AREA_CURVE}
            groupComponent={NATIVE_LINE_GROUP}
            containerComponent={NATIVE_CHART_CONTAINER}
            labelComponent={NATIVE_LABEL}
          />
          <VictoryLine
            data={[...points]}
            x="t"
            y="value"
            interpolation="monotoneX"
            style={{ data: { stroke: color, strokeWidth: 2 } }}
            labels={tooltipText}
            labelComponent={NATIVE_TOOLTIP}
            dataComponent={NATIVE_LINE_CURVE}
            groupComponent={NATIVE_LINE_GROUP}
            containerComponent={NATIVE_CHART_CONTAINER}
          />
        </VictoryChart>
      )}
    </View>
  );
}

/** One stat cell: secondary label above the `statsValue` number + unit. */
function StatCell({
  label,
  value,
  unit,
  tokens,
}: {
  readonly label: string;
  readonly value: number | null;
  readonly unit: string;
  readonly tokens: ThemeTokens;
}) {
  return (
    <View style={styles.statCell}>
      <Text
        style={[
          styles.statLabel,
          {
            color: tokens.smart.colors.textSecondary,
            fontSize: tokens.smart.typography.secondary,
          },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.statValue,
          {
            color: tokens.smart.colors.textPrimary,
            fontSize: tokens.smart.typography.statsValue,
          },
        ]}
      >
        {value === null ? '—' : `${value.toFixed(1)}${unit ? ` ${unit}` : ''}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  // Phone: title row, then the stats row BELOW it.
  headerStacked: {},
  // Tablet/wide: title row on the left, stats on the RIGHT of the row.
  headerWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  cardTitle: {
    fontWeight: '600',
    flexShrink: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  statsRowWide: {
    marginTop: 0,
    marginBottom: 0,
    flexShrink: 0,
  },
  statCell: {},
  statLabel: {
    marginBottom: 2,
  },
  statValue: {
    fontWeight: '600',
  },
  noDataWrap: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: { fontSize: 14 },
});
