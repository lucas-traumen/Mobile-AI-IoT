/**
 * InfluxDB v2 data source: HTTP query API adapter (read-only, Bearer token).
 */

import {
  INFLUX_MAX_POINTS,
  INFLUX_QUERY_PATH,
  INFLUX_TOKEN_HEADER,
  INFLUX_TOKEN_PREFIX,
} from '@core/constants';
import { Errors, err, ok, type Result } from '@core/errors';
import type { Logger } from '@core/logger';

import type { HistoryQuery } from '../domain/fluxQueryBuilder';
import {
  buildFluxQuery,
  parseFluxCsv,
  type HistorySeries,
} from '../domain/fluxQueryBuilder';

/** InfluxDB connection settings (read-only). */
export interface InfluxConfig {
  readonly url: string;
  readonly org: string;
  readonly bucket: string;
  readonly token: string;
}

/** Port: history data source. */
export interface HistoryDataSourcePort {
  /**
   * Query sensor series for a query value object (CP-R5).
   * @param query - measurement + range + fields + `deviceId` tag filter.
   * @returns `ok(series)` (one per deviceId+field) or `err`
   *   (`network`/`auth`/`validation`).
   */
  query(query: HistoryQuery): Promise<Result<HistorySeries[]>>;
}

/** Fetch function shape (injectable for tests). */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * InfluxDB v2 adapter over the HTTP query API.
 *
 * - Requests `POST {url}/api/v2/query?org={org}` with `Accept:
 *   application/csv`, `Authorization: Token {token}`.
 * - Maps the CSV response to {@link HistorySeries} (deviceId+field identity).
 */
export class InfluxV2Adapter implements HistoryDataSourcePort {
  private config: InfluxConfig;
  private readonly logger: Logger;
  private readonly fetchImpl: FetchLike;

  constructor(config: InfluxConfig, logger: Logger, fetchImpl?: FetchLike) {
    this.config = config;
    this.logger = logger;
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
  }

  /** Update the connection config (called on `settings:changed`). */
  configure(url: string, org: string, bucket: string, token: string): void {
    this.config = { url, org, bucket, token };
  }

  async query(query: HistoryQuery): Promise<Result<HistorySeries[]>> {
    if (!this.config.url || !this.config.bucket) {
      return err(
        Errors.config(
          'InfluxDB is not configured — set URL/bucket/token in Settings first',
        ),
      );
    }
    const flux = buildFluxQuery(this.config.bucket, query);
    const url = `${this.config.url.replace(
      /\/+$/,
      '',
    )}${INFLUX_QUERY_PATH}?org=${encodeURIComponent(this.config.org)}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.flux',
          Accept: 'application/csv',
          [INFLUX_TOKEN_HEADER]: `${INFLUX_TOKEN_PREFIX}${this.config.token}`,
        },
        body: flux,
      });
    } catch (e) {
      return err(Errors.network(`InfluxDB request failed: ${String(e)}`, e));
    }

    if (response.status === 401 || response.status === 403) {
      return err(Errors.auth('InfluxDB rejected the token (401/403)'));
    }
    if (!response.ok) {
      return err(
        Errors.network(`InfluxDB query failed with HTTP ${response.status}`),
      );
    }

    let body: string;
    try {
      body = await response.text();
    } catch (e) {
      return err(Errors.network('InfluxDB response could not be read', e));
    }

    const parsed = parseFluxCsv(body, query.fields);
    if (!parsed.ok) {
      return parsed;
    }
    // Cap the number of points defensively.
    for (const series of parsed.value) {
      series.points.splice(INFLUX_MAX_POINTS);
    }
    this.logger.debug(
      `InfluxDB: ${parsed.value.length} series for ${query.measurement}/${query.range}`,
    );
    return ok(parsed.value);
  }
}
