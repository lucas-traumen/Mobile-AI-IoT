/**
 * History domain: Flux query builder + response mapping (pure functions).
 *
 * CP-R5 device-tagged contract: the collector stores `sensors` rows with the
 * stable app device id as the `deviceId` tag and the capability machine key
 * as the field. Queries carry a {@link HistoryQuery} value object; results
 * are separate series per `deviceId + field` so two sensors of the same
 * room never get mixed into one chart.
 */

import { z } from 'zod';

import { Errors, err, ok, type Result } from '@core/errors';

/** Supported history ranges (displayed in the UI). */
export type HistoryRange = '1h' | '24h' | '7d';

/**
 * Default sensor fields queried when no explicit field list is given
 * (back-compat with the pre-catalog two-sensor layout).
 */
export const DEFAULT_HISTORY_FIELDS: readonly string[] = [
  'temperature',
  'humidity',
];

/** Range → Flux duration literal. */
export const RANGE_TO_DURATION: Record<HistoryRange, string> = {
  '1h': '1h',
  '24h': '24h',
  '7d': '7d',
};

/**
 * CP-R5 query value object — everything one history request needs, carried
 * as a single argument instead of parallel optional parameters.
 */
export interface HistoryQuery {
  /** InfluxDB measurement (e.g. `sensors`). */
  readonly measurement: string;
  /** History range. */
  readonly range: HistoryRange;
  /**
   * Sensor fields (capability machine keys) to fetch; empty list falls back
   * to {@link DEFAULT_HISTORY_FIELDS}.
   */
  readonly fields: readonly string[];
  /**
   * `deviceId` tag filter; empty list = no device filter (probe/all devices).
   */
  readonly deviceIds: readonly string[];
}

/** Escaping for Flux string literals (backslash + double-quote). */
export function escapeFluxString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build a Flux query returning `_time`, `_field`, `_value` (+ the `deviceId`
 * tag) for the query object's measurement/range/fields/deviceIds.
 *
 * The `deviceId` tag is kept and used as a group key together with `_field`
 * so the CSV response separates every device+field combination (two
 * temperature sensors in one room yield two independent series).
 *
 * @param bucket - InfluxDB bucket (escaped into the query).
 * @param query - the query value object (measurement, range, fields, deviceIds).
 * @returns the Flux query string.
 */
export function buildFluxQuery(bucket: string, query: HistoryQuery): string {
  const b = escapeFluxString(bucket);
  const m = escapeFluxString(query.measurement);
  const duration = RANGE_TO_DURATION[query.range];
  const wanted =
    query.fields.length > 0 ? query.fields : DEFAULT_HISTORY_FIELDS;
  const fieldFilter = wanted
    .map(field => `r._field == "${escapeFluxString(field)}"`)
    .join(' or ');
  const lines = [
    `from(bucket: "${b}")`,
    `  |> range(start: -${duration})`,
    `  |> filter(fn: (r) => r._measurement == "${m}")`,
    `  |> filter(fn: (r) => ${fieldFilter})`,
  ];
  if (query.deviceIds.length > 0) {
    const deviceFilter = query.deviceIds
      .map(id => `r.deviceId == "${escapeFluxString(id)}"`)
      .join(' or ');
    lines.push(`  |> filter(fn: (r) => ${deviceFilter})`);
  }
  lines.push(
    `  |> keep(columns: ["_time", "_field", "_value", "deviceId"])`,
    `  |> group(columns: ["deviceId", "_field"])`,
  );
  return lines.join('\n');
}

/** One chart point after mapping. */
export interface HistoryPoint {
  /** Unix epoch seconds. */
  readonly t: number;
  readonly value: number;
}

/**
 * The mapped result of one history query — one series per
 * `deviceId + field` (CP-R5). `deviceId` is `null` for legacy rows without
 * the tag (they cannot be attributed to a room; collector migration is
 * required — documented in the README).
 */
export interface HistorySeries {
  /** Device the series belongs to (`null` = untagged legacy row). */
  readonly deviceId: string | null;
  /** Sensor field name (e.g. 'temperature', or a custom catalog type). */
  readonly field: string;
  readonly points: HistoryPoint[];
}

/** CSV row shape from the InfluxDB v2 CSV response. */
const CsvRowSchema = z.object({
  _time: z.string(),
  _field: z.string(),
  _value: z.union([z.string(), z.number()]),
});

/**
 * Parse the InfluxDB v2 annotated CSV response into
 * `{deviceId, field}`-identified series.
 *
 * The `deviceId` column is optional: legacy CSVs (or untagged rows) parse
 * with `deviceId: null` instead of being guessed into a room/device.
 */
export function parseFluxCsv(
  csv: string,
  fields: readonly string[] = DEFAULT_HISTORY_FIELDS,
): Result<HistorySeries[]> {
  // InfluxDB v2 annotates the CSV with `#datatype`, `#group`, `#default`
  // lines before the header row — skip those.
  const lines = csv
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) {
    return ok([]);
  }

  const header = lines[0];
  if (!header.includes('_field')) {
    return err(
      Errors.validation('InfluxDB CSV response is missing the _field column'),
    );
  }
  const columns = header.split(',');
  const fieldIdx = columns.indexOf('_field');
  const timeIdx = columns.indexOf('_time');
  const valueIdx = columns.indexOf('_value');
  const deviceIdx = columns.indexOf('deviceId');
  if (fieldIdx < 0 || timeIdx < 0 || valueIdx < 0) {
    return err(
      Errors.validation('InfluxDB CSV response is missing required columns'),
    );
  }

  // Series identity is `deviceId + field` (CP-R5).
  const series = new Map<
    string,
    { deviceId: string | null; field: string; points: HistoryPoint[] }
  >();

  for (const line of lines.slice(1)) {
    if (line === '') {
      continue;
    }
    // Values may contain commas when quoted — take the naive split; the
    // Influx CSV for numeric _value does not quote numbers.
    const cells = splitCsvLine(line);
    if (cells.length <= Math.max(fieldIdx, timeIdx, valueIdx)) {
      continue;
    }
    const field = cells[fieldIdx];
    const rawTime = cells[timeIdx];
    const rawValue = cells[valueIdx];
    // Group-key columns repeat per table block; a repeated header row parses
    // to an invalid _time below and is skipped naturally.
    const deviceId =
      deviceIdx >= 0 && cells.length > deviceIdx && cells[deviceIdx] !== ''
        ? cells[deviceIdx]
        : null;

    const parsed = CsvRowSchema.safeParse({
      _time: rawTime,
      _field: field,
      _value: rawValue,
    });
    if (!parsed.success) {
      continue;
    }
    const t = Date.parse(parsed.data._time) / 1000;
    if (Number.isNaN(t)) {
      continue;
    }
    const value = Number(parsed.data._value);
    if (!Number.isFinite(value)) {
      continue;
    }
    const identity = `${deviceId ?? ''}|${field}`;
    let entry = series.get(identity);
    if (!entry) {
      entry = { deviceId, field, points: [] };
      series.set(identity, entry);
    }
    entry.points.push({ t, value });
  }

  const allowed = new Set(fields.length > 0 ? fields : DEFAULT_HISTORY_FIELDS);
  const result: HistorySeries[] = [];
  for (const entry of series.values()) {
    if (!allowed.has(entry.field)) {
      // B2: do not silently collapse unknown fields into temperature.
      continue;
    }
    result.push({
      deviceId: entry.deviceId,
      field: entry.field,
      points: entry.points,
    });
  }
  return ok(result);
}
/** Split one CSV line respecting double-quoted cells. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}
