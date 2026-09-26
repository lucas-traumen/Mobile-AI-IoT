/**
 * secretsQrContract tests (settings-secrets-qr) — the pure credentials-QR
 * parse authority: full/partial fills, empty-field keep-current semantics,
 * and every honest rejection (garbage JSON, unknown kind, wrong
 * schemaVersion, QR with no values). The QR is the server's printed
 * KEY — the parser never trims secret values (verbatim) and never throws.
 */

import { parseCredentialsQr } from './secretsQrContract';

/** A full credentials QR payload (the README contract example shape). */
const FULL_QR = JSON.stringify({
  schemaVersion: 1,
  kind: 'credentials',
  mqttUsername: 'homeuser',
  mqttPassword: 's3cret-pass',
  influxToken: 'influx-token-abc',
});

describe('parseCredentialsQr — accepted payloads', () => {
  it('parses a full credentials QR into all three fields', () => {
    const result = parseCredentialsQr(FULL_QR);
    expect(result).toEqual({
      ok: true,
      credentials: {
        mqttUsername: 'homeuser',
        mqttPassword: 's3cret-pass',
        influxToken: 'influx-token-abc',
      },
    });
  });

  it('parses a single-field QR: only the carried field is in the patch', () => {
    const result = parseCredentialsQr(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'credentials',
        mqttPassword: 'only-pass',
      }),
    );
    expect(result).toEqual({
      ok: true,
      credentials: { mqttPassword: 'only-pass' },
    });
  });

  it('keeps secret values VERBATIM (never trimmed — a space can be part of a secret)', () => {
    const result = parseCredentialsQr(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'credentials',
        mqttPassword: ' padded secret ',
      }),
    );
    expect(result).toEqual({
      ok: true,
      credentials: { mqttPassword: ' padded secret ' },
    });
  });

  it('treats an EMPTY field as keep-current (dropped from the patch, not an error)', () => {
    const result = parseCredentialsQr(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'credentials',
        mqttUsername: '',
        mqttPassword: 'kept-pass',
        influxToken: '',
      }),
    );
    expect(result).toEqual({
      ok: true,
      credentials: { mqttPassword: 'kept-pass' },
    });
  });

  it('tolerates unknown extra fields (server tooling may enrich; zod strips)', () => {
    const result = parseCredentialsQr(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'credentials',
        mqttPassword: 'p',
        futureField: { nested: true },
      }),
    );
    expect(result).toEqual({ ok: true, credentials: { mqttPassword: 'p' } });
  });
});

describe('parseCredentialsQr — honest rejections', () => {
  it('rejects garbage JSON as malformed', () => {
    expect(parseCredentialsQr('not json at all')).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects non-object JSON (array, number, string, null) as malformed', () => {
    expect(parseCredentialsQr('[1,2,3]')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(parseCredentialsQr('42')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(parseCredentialsQr('"text"')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(parseCredentialsQr('null')).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects a missing kind as malformed (kind is part of the contract)', () => {
    expect(
      parseCredentialsQr(
        JSON.stringify({ schemaVersion: 1, mqttPassword: 'p' }),
      ),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects an UNKNOWN kind without trying to parse fields (forward-compat honesty)', () => {
    const result = parseCredentialsQr(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'system',
        mqttPassword: 'p',
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'unsupportedKind' });
  });

  it('rejects a wrong schemaVersion', () => {
    const result = parseCredentialsQr(
      JSON.stringify({
        schemaVersion: 2,
        kind: 'credentials',
        mqttPassword: 'p',
      }),
    );
    expect(result).toEqual({ ok: false, reason: 'unsupportedVersion' });
  });

  it('rejects a missing schemaVersion', () => {
    expect(parseCredentialsQr(JSON.stringify({ kind: 'credentials' }))).toEqual(
      { ok: false, reason: 'unsupportedVersion' },
    );
  });

  it('rejects a well-formed credentials QR where NO field has a value ("QR rỗng")', () => {
    expect(
      parseCredentialsQr(
        JSON.stringify({ schemaVersion: 1, kind: 'credentials' }),
      ),
    ).toEqual({ ok: false, reason: 'empty' });
    expect(
      parseCredentialsQr(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'credentials',
          mqttUsername: '',
          mqttPassword: '',
          influxToken: '',
        }),
      ),
    ).toEqual({ ok: false, reason: 'empty' });
  });
});
