/**
 * Secrets QR contract (settings-secrets-qr plan) — the pure, server-facing
 * half of the "quét QR từ server" fill path (Bước 2 của flow lần đầu cài
 * app, sau khi mDNS đã điền các trường non-secret).
 *
 * The Smart Home Server prints ONE credentials QR for the owner to scan
 * (server-init.sh → terminal; see the settings README — the two-sided
 * contract document):
 *
 * ```json
 * { "schemaVersion": 1, "kind": "credentials",
 *   "mqttUsername": "...", "mqttPassword": "...", "influxToken": "..." }
 * ```
 *
 * - `kind: "credentials"` — forward-compat: a future `kind: "system"`
 *   (full-system share) is a separate task. An unknown kind is an HONEST
 *   typed error ("Loại QR không hỗ trợ") and parsing never continues.
 * - All three secret fields are OPTIONAL keep-current: a missing OR empty
 *   field keeps the form's current value (never overwrites with nothing).
 *   A QR where NO field has a value is a typed "QR rỗng" error.
 * - The fill NEVER saves: the screen dispatches the fields through the
 *   store's `updateMqtt` / `updateInflux` actions and the user still
 *   presses Lưu (same fill-never-autosaves rule as mDNS).
 *
 * Same pure-file pattern as `mdnsDiscoveryContract.ts`: NOT exported
 * through the module `api/` — a screen-local concern. zod is the single
 * authority on the shape (`schemaVersion` literal pin, the
 * `boardQrLabel.ts` pattern).
 */

import { z } from 'zod';

/**
 * The credentials QR schema: `schemaVersion` pinned to 1, `kind` pinned to
 * `"credentials"`, the three secret fields optional strings. Unknown/extra
 * fields are tolerated (zod default strip) so server tooling can enrich
 * the payload without breaking older app versions.
 */
export const CredentialsQrSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('credentials'),
  mqttUsername: z.string().optional(),
  mqttPassword: z.string().optional(),
  influxToken: z.string().optional(),
});

/** A raw (pre-normalization) credentials QR payload. */
export type CredentialsQrPayload = z.infer<typeof CredentialsQrSchema>;

/**
 * The parsed credentials patch: ONLY the fields the QR actually carries
 * with a non-empty value. An absent key means "keep the current form
 * value" — the key is structurally unreachable for the applier, so an
 * empty QR field can never overwrite a secret with nothing.
 */
export interface CredentialsQrPatch {
  readonly mqttUsername?: string;
  readonly mqttPassword?: string;
  readonly influxToken?: string;
}

/** Why a scanned QR was rejected (each reason maps to an honest UI string). */
export type SecretsQrParseError =
  /** Not JSON / not a JSON object — not a QR this app understands. */
  | 'malformed'
  /** `kind` present but not `"credentials"` (e.g. a future `"system"`). */
  | 'unsupportedKind'
  /** `schemaVersion` missing or not 1. */
  | 'unsupportedVersion'
  /** A well-formed credentials QR where NO secret field has a value. */
  | 'empty';

/** The pure parse result: a normalized patch or a typed rejection reason. */
export type SecretsQrParseResult =
  | { readonly ok: true; readonly credentials: CredentialsQrPatch }
  | { readonly ok: false; readonly reason: SecretsQrParseError };

/**
 * Read one secret field off a parsed payload: present AND non-empty keeps
 * its VERBATIM value (secrets are never trimmed — a trailing space can be
 * part of the secret); missing or empty string drops out of the patch
 * (keep-current). Returns `undefined` when the field must not overwrite.
 */
function readSecretField(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.length > 0 ? value : undefined;
}

/**
 * Pure QR parse: JSON.parse the raw scan, discriminate the kind, zod-
 * validate, and normalize to the keep-current patch — or a typed error
 * (never throws). The kind check runs BEFORE field parsing (an unknown
 * kind is honest "Loại QR không hỗ trợ" even if the rest would parse).
 */
export function parseCredentialsQr(raw: string): SecretsQrParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'malformed' };
  }
  const record = parsed as Record<string, unknown>;
  if (record.kind !== undefined && record.kind !== 'credentials') {
    return { ok: false, reason: 'unsupportedKind' };
  }
  if (record.schemaVersion !== 1) {
    return { ok: false, reason: 'unsupportedVersion' };
  }
  const result = CredentialsQrSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: 'malformed' };
  }
  const payload = result.data;
  const credentials: {
    mqttUsername?: string;
    mqttPassword?: string;
    influxToken?: string;
  } = {};
  const username = readSecretField(payload.mqttUsername);
  const password = readSecretField(payload.mqttPassword);
  const token = readSecretField(payload.influxToken);
  if (username !== undefined) {
    credentials.mqttUsername = username;
  }
  if (password !== undefined) {
    credentials.mqttPassword = password;
  }
  if (token !== undefined) {
    credentials.influxToken = token;
  }
  if (
    credentials.mqttUsername === undefined &&
    credentials.mqttPassword === undefined &&
    credentials.influxToken === undefined
  ) {
    return { ok: false, reason: 'empty' };
  }
  return { ok: true, credentials };
}
