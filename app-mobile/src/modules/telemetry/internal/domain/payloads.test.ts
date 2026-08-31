import { parseTelemetryPayload, TelemetryPayloadSchema } from './payloads';

describe('parseTelemetryPayload', () => {
  it('parses a valid payload', () => {
    const result = parseTelemetryPayload(
      '{"temperature": 25.6, "humidity": 60.2}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ temperature: 25.6, humidity: 60.2 });
    }
  });

  it('parses a valid payload with optional ts', () => {
    const result = parseTelemetryPayload(
      '{"temperature": 25.6, "humidity": 60.2, "ts": 1756300000}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ts).toBe(1756300000);
    }
  });

  it('parses a partial payload (temperature only)', () => {
    const result = parseTelemetryPayload('{"temperature": 25.6}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.temperature).toBe(25.6);
      expect(result.value.humidity).toBeUndefined();
    }
  });

  it('parses a custom-field payload (pressure only)', () => {
    const result = parseTelemetryPayload('{"pressure": 1013}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pressure).toBe(1013);
    }
  });

  it('rejects invalid JSON', () => {
    const result = parseTelemetryPayload('not-json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
  });

  it('rejects an empty payload (no numeric sensor field)', () => {
    const result = parseTelemetryPayload('{}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
  });

  it('rejects a payload with only ts', () => {
    const result = parseTelemetryPayload('{"ts": 1756300000}');
    expect(result.ok).toBe(false);
  });

  it('rejects a payload with a wrong type', () => {
    const result = parseTelemetryPayload(
      '{"temperature": "hot", "humidity": 60}',
    );
    expect(result.ok).toBe(false);
  });

  it('rejects non-finite numbers', () => {
    const result = parseTelemetryPayload(
      '{"temperature": Infinity, "humidity": 60}',
    );
    expect(result.ok).toBe(false);
  });

  it('rejects non-numeric custom fields', () => {
    const result = parseTelemetryPayload('{"pressure": "high"}');
    expect(result.ok).toBe(false);
  });

  it('rejects a negative or zero ts', () => {
    const result = parseTelemetryPayload(
      '{"temperature": 25, "humidity": 60, "ts": -5}',
    );
    expect(result.ok).toBe(false);
  });

  it('schema accepts numbers including negative temperatures', () => {
    const result = parseTelemetryPayload(
      '{"temperature": -3.5, "humidity": 80}',
    );
    expect(result.ok).toBe(true);
  });

  it('rejects non-object payloads (arrays)', () => {
    const result = parseTelemetryPayload('[1, 2, 3]');
    expect(result.ok).toBe(false);
  });
});

describe('TelemetryPayloadSchema', () => {
  it('exposes the zod schema for reuse', () => {
    expect(
      TelemetryPayloadSchema.safeParse({ temperature: 1, humidity: 2 }).success,
    ).toBe(true);
    expect(
      TelemetryPayloadSchema.safeParse({ temperature: '1', humidity: 2 })
        .success,
    ).toBe(false);
  });

  it('accepts additional numeric fields through the catchall', () => {
    const result = TelemetryPayloadSchema.safeParse({
      temperature: 25,
      pressure: 1013,
      co2: 412,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pressure).toBe(1013);
      expect(result.data.co2).toBe(412);
    }
  });
});
