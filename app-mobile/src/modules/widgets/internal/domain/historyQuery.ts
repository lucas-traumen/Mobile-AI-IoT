/**
 * Exact history query for the history-chart widget (CP-R5, fix cycle 1).
 *
 * Extracted as a pure helper so the widget's query contract is directly
 * unit-testable: the widget NEVER queries the whole room or the default
 * fields — it requests exactly its own `deviceId + capability` series.
 */

import type {
  HistoryQuery,
  HistoryRange,
  HistorySeries,
} from '@modules/history/api';

/**
 * Build the exact query for one widget binding.
 *
 * @param deviceId - the bound device id (must be non-empty).
 * @param capability - the bound capability type (the only requested field).
 * @param range - the selected history range.
 */
export function historyQueryForWidget(
  deviceId: string,
  capability: string,
  range: HistoryRange,
): HistoryQuery {
  return {
    measurement: 'sensors',
    range,
    fields: [capability],
    deviceIds: [deviceId],
  };
}

/**
 * Exact result matching for the widget (fix cycle 2): the rendered series
 * must satisfy `s.deviceId === deviceId && s.field === capability` — a
 * legacy `deviceId: null` series (untagged rows) is NEVER accepted, and
 * another device's series is never accepted either. The first matching
 * series (adapter order) wins.
 */
export function selectWidgetSeries(
  series: readonly HistorySeries[],
  deviceId: string,
  capability: string,
): HistorySeries | undefined {
  return series.find(s => s.deviceId === deviceId && s.field === capability);
}
