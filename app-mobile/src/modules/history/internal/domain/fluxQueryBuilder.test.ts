import {
  buildFluxQuery,
  escapeFluxString,
  parseFluxCsv,
  RANGE_TO_DURATION,
  type HistoryQuery,
} from './fluxQueryBuilder';

function makeQuery(overrides?: Partial<HistoryQuery>): HistoryQuery {
  return {
    measurement: 'temperature',
    range: '1h',
    fields: [],
    deviceIds: [],
    ...overrides,
  };
}

describe('buildFluxQuery', () => {
  it('builds a query for 1h range', () => {
    const query = buildFluxQuery('sensors', makeQuery());
    expect(query).toContain('from(bucket: "sensors")');
    expect(query).toContain('range(start: -1h)');
    expect(query).toContain('r._measurement == "temperature"');
    expect(query).toContain(
      'r._field == "temperature" or r._field == "humidity"',
    );
  });

  it('builds a query for 24h and 7d ranges', () => {
    expect(buildFluxQuery('sensors', makeQuery({ range: '24h' }))).toContain(
      'range(start: -24h)',
    );
    expect(buildFluxQuery('sensors', makeQuery({ range: '7d' }))).toContain(
      'range(start: -7d)',
    );
  });

  it('maps every range to a duration', () => {
    for (const range of ['1h', '24h', '7d'] as const) {
      expect(RANGE_TO_DURATION[range]).toBeTruthy();
    }
  });

  it('escapes bucket and measurement names', () => {
    const query = buildFluxQuery(
      'a"b\\c',
      makeQuery({ measurement: 'my"measure' }),
    );
    expect(query).toContain('a\\"b\\\\c');
    expect(query).toContain('my\\"measure');
  });

  it('builds a query for custom catalog fields (CP4)', () => {
    const query = buildFluxQuery(
      'sensors',
      makeQuery({ fields: ['temperature', 'pressure'] }),
    );
    expect(query).toContain('r._field == "temperature"');
    expect(query).toContain('r._field == "pressure"');
    expect(query).not.toContain('humidity');
  });

  it('falls back to the default fields for an empty list', () => {
    const query = buildFluxQuery('sensors', makeQuery({ fields: [] }));
    expect(query).toContain(
      'r._field == "temperature" or r._field == "humidity"',
    );
  });

  it('escapes custom field names (CP4)', () => {
    const query = buildFluxQuery('sensors', makeQuery({ fields: ['a"b'] }));
    expect(query).toContain('r._field == "a\\"b"');
  });

  it('filters deviceId tags and keeps/groups deviceId + _field (CP-R5)', () => {
    const query = buildFluxQuery(
      'sensors',
      makeQuery({
        measurement: 'sensors',
        deviceIds: ['sensor-01', 'sensor-02'],
      }),
    );
    expect(query).toContain(
      'r.deviceId == "sensor-01" or r.deviceId == "sensor-02"',
    );
    expect(query).toContain(
      'keep(columns: ["_time", "_field", "_value", "deviceId"])',
    );
    expect(query).toContain('group(columns: ["deviceId", "_field"])');
  });

  it('omits the deviceId filter when the list is empty', () => {
    const query = buildFluxQuery('sensors', makeQuery({ deviceIds: [] }));
    expect(query).not.toContain('r.deviceId ==');
  });

  it('escapes device ids (CP-R5)', () => {
    const query = buildFluxQuery(
      'sensors',
      makeQuery({ deviceIds: ['dev"1'] }),
    );
    expect(query).toContain('r.deviceId == "dev\\"1"');
  });
});

describe('escapeFluxString', () => {
  it('escapes backslashes and double quotes', () => {
    expect(escapeFluxString('a"b\\c')).toBe('a\\"b\\\\c');
    expect(escapeFluxString('plain')).toBe('plain');
  });
});

describe('parseFluxCsv', () => {
  const csvHeader =
    '#datatype,string,dateTime:RFC3339,string,double\n' +
    ',result,table,_time,_field,_value\n' +
    ',0,0,2026-08-28T00:00:00Z,temperature,25.5\n' +
    ',0,1,2026-08-28T00:00:01Z,humidity,60.2\n';

  it('maps a CSV response to series (legacy rows → deviceId null)', () => {
    const result = parseFluxCsv(csvHeader);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const temperature = result.value.find(s => s.field === 'temperature');
      const humidity = result.value.find(s => s.field === 'humidity');
      expect(temperature?.deviceId).toBeNull();
      expect(temperature?.points).toEqual([
        { t: Date.parse('2026-08-28T00:00:00Z') / 1000, value: 25.5 },
      ]);
      expect(humidity?.deviceId).toBeNull();
      expect(humidity?.points).toEqual([
        { t: Date.parse('2026-08-28T00:00:01Z') / 1000, value: 60.2 },
      ]);
    }
  });

  it('returns an empty series list for an empty body', () => {
    const result = parseFluxCsv('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('maps humidity rows to a humidity series (B2 regression)', () => {
    const csv =
      ',result,table,_time,_field,_value\n' +
      ',0,0,2026-08-28T00:00:00Z,humidity,61.5\n' +
      ',0,1,2026-08-28T00:00:01Z,humidity,62.0\n';
    const result = parseFluxCsv(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].field).toBe('humidity');
      expect(result.value[0].points).toEqual([
        { t: Date.parse('2026-08-28T00:00:00Z') / 1000, value: 61.5 },
        { t: Date.parse('2026-08-28T00:00:01Z') / 1000, value: 62.0 },
      ]);
    }
  });

  it('ignores unknown fields instead of collapsing them to temperature (B2)', () => {
    const csv =
      ',result,table,_time,_field,_value\n' +
      ',0,0,2026-08-28T00:00:00Z,temperature,25.5\n' +
      ',0,1,2026-08-28T00:00:01Z,soil,40.0\n';
    const result = parseFluxCsv(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].field).toBe('temperature');
      expect(result.value[0].points).toHaveLength(1);
    }
  });

  it('maps custom catalog fields when listed (CP4)', () => {
    const csv =
      ',result,table,_time,_field,_value\n' +
      ',0,0,2026-08-28T00:00:00Z,pressure,1013.2\n' +
      ',0,1,2026-08-28T00:00:01Z,humidity,60.0\n';
    const result = parseFluxCsv(csv, ['pressure']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].field).toBe('pressure');
      expect(result.value[0].points).toEqual([
        { t: Date.parse('2026-08-28T00:00:00Z') / 1000, value: 1013.2 },
      ]);
    }
  });

  it('separates same-field rows by deviceId tag (CP-R5)', () => {
    const csv =
      '#datatype,string,dateTime:RFC3339,string,string,double\n' +
      ',result,table,_time,_field,deviceId,_value\n' +
      ',0,0,2026-08-28T00:00:00Z,temperature,sensor-01,25.5\n' +
      ',0,0,2026-08-28T00:00:01Z,temperature,sensor-01,25.7\n' +
      ',0,1,2026-08-28T00:00:00Z,temperature,sensor-02,22.1\n';
    const result = parseFluxCsv(csv, ['temperature']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      const first = result.value.find(s => s.deviceId === 'sensor-01');
      const second = result.value.find(s => s.deviceId === 'sensor-02');
      expect(first?.field).toBe('temperature');
      expect(first?.points).toEqual([
        { t: Date.parse('2026-08-28T00:00:00Z') / 1000, value: 25.5 },
        { t: Date.parse('2026-08-28T00:00:01Z') / 1000, value: 25.7 },
      ]);
      expect(second?.points).toEqual([
        { t: Date.parse('2026-08-28T00:00:00Z') / 1000, value: 22.1 },
      ]);
    }
  });

  it('parses untagged rows in a deviceId CSV as deviceId null (legacy)', () => {
    const csv =
      ',result,table,_time,_field,deviceId,_value\n' +
      ',0,0,2026-08-28T00:00:00Z,temperature,,25.5\n' +
      ',0,1,2026-08-28T00:00:01Z,temperature,sensor-01,20.0\n';
    const result = parseFluxCsv(csv, ['temperature']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const legacy = result.value.find(s => s.deviceId === null);
      const tagged = result.value.find(s => s.deviceId === 'sensor-01');
      expect(legacy?.points).toHaveLength(1);
      expect(tagged?.points).toHaveLength(1);
    }
  });

  it('rejects a body without the _field column', () => {
    const result = parseFluxCsv(',result,table,value\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
  });

  it('skips malformed rows', () => {
    const csv =
      ',result,table,_time,_field,_value\n' +
      ',0,0,not-a-time,temperature,25.5\n' +
      ',0,1,2026-08-28T00:00:00Z,humidity,not-a-number\n' +
      ',0,2,2026-08-28T00:00:02Z,temperature,21.0\n';
    const result = parseFluxCsv(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const temperature = result.value.find(s => s.field === 'temperature');
      expect(temperature?.points).toEqual([
        { t: Date.parse('2026-08-28T00:00:02Z') / 1000, value: 21.0 },
      ]);
      expect(result.value.some(s => s.field === 'humidity')).toBe(false);
    }
  });

  it('handles quoted CSV cells', () => {
    const csv =
      ',result,table,_time,_field,_value\n' +
      ',0,0,2026-08-28T00:00:00Z,temperature,"25.5"\n';
    const result = parseFluxCsv(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].points[0].value).toBe(25.5);
    }
  });
});
