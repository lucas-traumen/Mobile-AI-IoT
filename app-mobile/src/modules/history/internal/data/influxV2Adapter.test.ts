import { NullLogger } from '@core/logger';

import { InfluxV2Adapter, type FetchLike } from './influxV2Adapter';

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/csv' },
  });
}

const csvBody =
  '#datatype,string,dateTime:RFC3339,string,double\n' +
  ',result,table,_time,_field,_value\n' +
  ',0,0,2026-08-28T00:00:00Z,temperature,25.5\n' +
  ',0,1,2026-08-28T00:00:01Z,humidity,60.2\n';

describe('InfluxV2Adapter', () => {
  const config = {
    url: 'http://192.168.1.10:8086',
    org: 'iot',
    bucket: 'sensors',
    token: 'secret-token',
  };

  it('maps a successful response to series', async () => {
    const fetchImpl: FetchLike = jest.fn(async (url, init) => {
      expect(url).toBe('http://192.168.1.10:8086/api/v2/query?org=iot');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        Authorization: 'Token secret-token',
        Accept: 'application/csv',
      });
      return jsonResponse(csvBody);
    });

    const adapter = new InfluxV2Adapter(config, new NullLogger(), fetchImpl);
    const result = await adapter.query({
      measurement: 'temperature',
      range: '1h',
      fields: [],
      roomId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const temperature = result.value.find(s => s.field === 'temperature');
      expect(temperature?.points).toEqual([
        { t: Date.parse('2026-08-28T00:00:00Z') / 1000, value: 25.5 },
      ]);
    }
  });

  it('sends the roomId filter + keep/group columns (approved contract)', async () => {
    let body = '';
    const fetchImpl: FetchLike = jest.fn(async (_url, init) => {
      body = String(init.body);
      return jsonResponse(csvBody);
    });
    const adapter = new InfluxV2Adapter(config, new NullLogger(), fetchImpl);
    const result = await adapter.query({
      measurement: 'sensors',
      range: '1h',
      fields: ['temperature'],
      roomId: 'room-living',
    });
    expect(result.ok).toBe(true);
    expect(body).toContain('r._measurement == "sensors"');
    expect(body).toContain('r._field == "temperature"');
    expect(body).toContain('r.roomId == "room-living"');
    expect(body).toContain(
      'keep(columns: ["_time", "_field", "_value", "roomId"])',
    );
    expect(body).toContain('group(columns: ["roomId", "_field"])');
  });

  it('omits the room filter when roomId is null (connection probe)', async () => {
    let body = '';
    const fetchImpl: FetchLike = jest.fn(async (_url, init) => {
      body = String(init.body);
      return jsonResponse(csvBody);
    });
    const adapter = new InfluxV2Adapter(config, new NullLogger(), fetchImpl);
    await adapter.query({
      measurement: 'sensors',
      range: '1h',
      fields: [],
      roomId: null,
    });
    expect(body).not.toContain('roomId ==');
  });

  it('returns auth error on 401', async () => {
    const fetchImpl: FetchLike = jest.fn(async () =>
      jsonResponse('unauthorized', 401),
    );
    const adapter = new InfluxV2Adapter(config, new NullLogger(), fetchImpl);
    const result = await adapter.query({
      measurement: 'temperature',
      range: '24h',
      fields: [],
      roomId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth');
    }
  });

  it('returns network error on HTTP 500', async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse('boom', 500));
    const adapter = new InfluxV2Adapter(config, new NullLogger(), fetchImpl);
    const result = await adapter.query({
      measurement: 'temperature',
      range: '7d',
      fields: [],
      roomId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('network');
    }
  });

  it('returns network error when fetch rejects', async () => {
    const fetchImpl: FetchLike = jest.fn(async () => {
      throw new Error('connection refused');
    });
    const adapter = new InfluxV2Adapter(config, new NullLogger(), fetchImpl);
    const result = await adapter.query({
      measurement: 'temperature',
      range: '1h',
      fields: [],
      roomId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('network');
    }
  });

  it('returns validation error on an unparsable CSV body', async () => {
    const fetchImpl: FetchLike = jest.fn(async () => jsonResponse('not-a-csv'));
    const adapter = new InfluxV2Adapter(config, new NullLogger(), fetchImpl);
    const result = await adapter.query({
      measurement: 'temperature',
      range: '1h',
      fields: [],
      roomId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
  });
});
