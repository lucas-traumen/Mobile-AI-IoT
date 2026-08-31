/**
 * Devices domain: rooms/devices schemas + pure helpers.
 *
 * V2 abstraction: a widget binds to `deviceId + capability`, never to an MQTT
 * topic. A `Device` declares its capabilities and a `binding` that tells the
 * app where its data comes from:
 *
 * - `telemetry-sensor` → values come from the shared telemetry topic; every
 *   declared sensor capability is mapped from the payload field with the same
 *   name as the capability type (e.g. `temperature`, `humidity`, `pressure`).
 * - `relay` (index 1..3) → `switch` capability, commands routed to the relay
 *   module (`<prefix>/cmnd/relay/<n>`).
 *
 * The binding↔capability constraints below are enforced by zod so no invalid
 * device can ever be persisted or enter the registry.
 *
 * Capabilities are open: the app ships three built-ins
 * ({@link BUILT_IN_CAPABILITIES}) and the user can add more (e.g. `pressure`)
 * through the capability catalog (stored in the persisted snapshot).
 */

import { z } from 'zod';

/**
 * All built-in capability types the app understands. Custom capability types
 * can be added through the capability catalog, so runtime capability values
 * are plain strings ({@link CapabilityType}).
 */
export const CAPABILITY_TYPES = ['temperature', 'humidity', 'switch'] as const;

/**
 * The built-in capability literals (`'temperature' | 'humidity' | 'switch'`).
 * Use in exhaustive switches; {@link CapabilityType} is the widened string
 * form accepted everywhere capabilities flow (devices, bindings, state keys).
 */
export type KnownCapability = (typeof CAPABILITY_TYPES)[number];

/**
 * A capability of a device or a widget binding. Widened to `string` so custom
 * capability types from the catalog are first-class citizens.
 */
export type CapabilityType = string;

/**
 * zod schema for a capability string (any non-empty string — the catalog
 * defines the known ones at runtime, not the schema).
 */
export const CapabilitySchema = z.string().min(1);

/** Behavior kind of a capability definition. */
export const CapabilityKindSchema = z.enum(['sensor', 'switch']);

/** Behavior kind of a capability definition ('sensor' | 'switch'). */
export type CapabilityKind = z.infer<typeof CapabilityKindSchema>;

/**
 * ASCII machine-key format for NEW capability types (CP-R4).
 *
 * Must start with a lowercase letter, followed by lowercase letters, digits
 * or underscores. No spaces, no dashes, no uppercase, no Vietnamese chars.
 * Examples: `temperature`, `humidity`, `pressure`, `co2_level`.
 *
 * NOTE: This is stricter than {@link CapabilityDefSchema} which accepts any
 * non-empty string for backwards compatibility with legacy persisted keys
 * (e.g. Vietnamese slugs like 'áp-suất'). Use this schema for validating
 * NEW capability creation input only.
 */
export const CAPABILITY_KEY_REGEX = /^[a-z][a-z0-9_]*$/;

/** Zod schema for validating NEW capability machine keys (strict ASCII). */
export const CapabilityMachineKeySchema = z
  .string()
  .min(1)
  .regex(CAPABILITY_KEY_REGEX, {
    message:
      'Capability key must be lowercase ASCII letters/digits/underscores, starting with a letter (e.g. "pressure")',
  });

/**
 * One entry of the capability catalog: metadata describing a capability type
 * (label, kind, optional unit/color/icon).
 */
export const CapabilityDefSchema = z.object({
  /** Capability type key (unique in the catalog, e.g. 'pressure'). */
  type: z.string().min(1),
  /** Human-readable label (e.g. 'Áp suất'). */
  label: z.string().min(1),
  /** 'sensor' (numeric readings) or 'switch' (boolean commands). */
  kind: CapabilityKindSchema,
  /** Display unit (e.g. '°C', '%') — sensors only. */
  unit: z.string().optional(),
  /** Accent color used for display (hex). */
  color: z.string().optional(),
  /** Ionicons glyph name (e.g. 'thermometer-outline'). */
  icon: z.string().optional(),
  /**
   * Shipped-with-the-app capability (temperature/humidity/switch). Built-ins
   * are locked: the catalog UI shows a lock and the service rejects removal
   * (CP5) so seeds and bindings can never lose their core types.
   */
  builtin: z.boolean().optional(),
});

/** One entry of the capability catalog. */
export type CapabilityDef = z.infer<typeof CapabilityDefSchema>;

/**
 * The built-in capability catalog (temperature °C, humidity %, switch).
 * Snapshots persisted before the catalog existed migrate to this list.
 */
export const BUILT_IN_CAPABILITIES: readonly CapabilityDef[] = [
  {
    type: 'temperature',
    label: 'Nhiệt độ',
    kind: 'sensor',
    unit: '°C',
    color: '#e65100',
    icon: 'thermometer-outline',
    builtin: true,
  },
  {
    type: 'humidity',
    label: 'Độ ẩm',
    kind: 'sensor',
    unit: '%',
    color: '#00897b',
    icon: 'water-outline',
    builtin: true,
  },
  {
    type: 'switch',
    label: 'Công tắc',
    kind: 'switch',
    icon: 'toggle-outline',
    builtin: true,
  },
];

/** Relay channel numbers supported by the hardware contract (1..3). */
export const RELAY_CHANNELS = [1, 2, 3] as const;

/** A relay channel (1 | 2 | 3). */
export type RelayChannel = (typeof RELAY_CHANNELS)[number];

/** Where a device's data comes from. */
export const DeviceBindingSchema = z.discriminatedUnion('kind', [
  /** Sensor values from the shared telemetry topic. */
  z.object({ kind: z.literal('telemetry-sensor') }),
  /** ON/OFF relay with a fixed hardware index. */
  z.object({
    kind: z.literal('relay'),
    index: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
]);

/** A device binding ('telemetry-sensor' | 'relay' with index 1..3). */
export type DeviceBinding = z.infer<typeof DeviceBindingSchema>;

/** A device registered in the app (id, name, capabilities, binding). */
export const DeviceSchema = z
  .object({
    /** Stable device id (generated by the registry on create). */
    id: z.string().min(1, 'Device id is required'),
    /** Display name (e.g. 'Đèn phòng khách'). */
    name: z.string().trim().min(1, 'Device name is required'),
    /** Id of the room this device belongs to (optional). */
    roomId: z.string().min(1).optional(),
    /** Device type label (e.g. 'sensor' | 'relay'). */
    type: z.string().trim().min(1, 'Device type is required'),
    /** Capabilities this device exposes (at least one; strings, catalog-defined). */
    capabilities: z.array(CapabilitySchema).min(1),
    /** Data binding (telemetry sensor or relay channel). */
    binding: DeviceBindingSchema,
  })
  .superRefine((device, ctx) => {
    if (device.binding.kind === 'relay') {
      const onlySwitch =
        device.capabilities.length === 1 && device.capabilities[0] === 'switch';
      if (!onlySwitch) {
        ctx.addIssue({
          code: 'custom',
          path: ['capabilities'],
          message: 'Relay devices must expose exactly the "switch" capability',
        });
      }
    } else if (device.capabilities.includes('switch')) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'Telemetry sensors cannot expose the "switch" capability',
      });
    }
  });

/** A registered device. */
export type Device = z.infer<typeof DeviceSchema>;

/** A room grouping devices. */
export const RoomSchema = z.object({
  /** Stable room id. */
  id: z.string().min(1, 'Room id is required'),
  /** Display name (e.g. 'Phòng khách'). */
  name: z.string().trim().min(1, 'Room name is required'),
  /** Sort order (integer, ascending). */
  order: z.number().int('Room order must be an integer'),
  /** Optional Ionicons glyph name shown next to the room (e.g. 'home-outline'). */
  icon: z.string().optional(),
});

/** A room grouping devices. */
export type Room = z.infer<typeof RoomSchema>;

/** Raw snapshot shape before the capability-catalog migration. */
const RawDevicesSnapshotSchema = z
  .object({
    rooms: z.array(RoomSchema),
    devices: z.array(DeviceSchema),
    /** Capability catalog; absent on pre-catalog snapshots (parse migration). */
    capabilities: z.array(CapabilityDefSchema).optional(),
  })
  .superRefine((snapshot, ctx) => {
    const deviceIds = new Set<string>();
    for (const device of snapshot.devices) {
      if (deviceIds.has(device.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['devices'],
          message: `Duplicate device id "${device.id}"`,
        });
      }
      deviceIds.add(device.id);
    }
    const roomIds = new Set<string>();
    for (const room of snapshot.rooms) {
      if (roomIds.has(room.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rooms'],
          message: `Duplicate room id "${room.id}"`,
        });
      }
      roomIds.add(room.id);
    }
    if (snapshot.capabilities) {
      const types = new Set<string>();
      for (const def of snapshot.capabilities) {
        if (types.has(def.type)) {
          ctx.addIssue({
            code: 'custom',
            path: ['capabilities'],
            message: `Duplicate capability type "${def.type}"`,
          });
        }
        types.add(def.type);
      }
    }
  });

/**
 * The persisted devices snapshot (rooms + devices + capability catalog).
 *
 * Parse migration: snapshots persisted before the capability catalog existed
 * (no `capabilities` field) parse with the built-in catalog
 * ({@link BUILT_IN_CAPABILITIES}); snapshots with an explicit catalog
 * round-trip unchanged.
 */
export const DevicesSnapshotSchema = RawDevicesSnapshotSchema.transform(
  snapshot => ({
    rooms: snapshot.rooms,
    devices: snapshot.devices,
    // Parse migration: pre-catalog snapshots get the built-ins; snapshots
    // persisted before the builtin lock (CP5) get `builtin: true` re-stamped
    // on the three core types so they stay locked.
    capabilities: (snapshot.capabilities ?? [...BUILT_IN_CAPABILITIES]).map(
      def =>
        BUILT_IN_CAPABILITIES.some(builtin => builtin.type === def.type)
          ? { ...def, builtin: true }
          : def,
    ),
  }),
);

/**
 * The persisted devices snapshot.
 *
 * Declared manually (rather than inferred) so every field is `readonly` —
 * the zod pipeline above infers the same shape with mutable arrays.
 */
export interface DevicesSnapshot {
  readonly rooms: readonly Room[];
  readonly devices: readonly Device[];
  /** Capability catalog (built-ins when the snapshot was migrated). */
  readonly capabilities: readonly CapabilityDef[];
}

/**
 * Pure helper: build the canonical state-store key for a device capability
 * (`${deviceId}:${capability}`).
 */
export function capabilityKey(deviceId: string, capability: string): string {
  return `${deviceId}:${capability}`;
}

/**
 * Derive a machine type key from a user-entered capability label (CP5).
 *
 * Slug rules: lowercase, runs of non-alphanumerics collapse to a single `-`,
 * leading/trailing dashes trimmed. Uniqueness: when the slug already exists
 * in `existingTypes`, `-2`, `-3`, … are appended until free. An empty/
 * un-sluggable label falls back to `cap` (then `cap-2`, …).
 *
 * @param label - the human label (e.g. 'Áp suất' → 'áp-suất').
 * @param existingTypes - capability types already in the catalog.
 * @returns a unique type key (pure).
 */
export function capabilityTypeFromLabel(
  label: string,
  existingTypes: readonly string[],
): string {
  // Vietnamese letters live in Latin-1 Supplement, Latin Extended-A and
  // Latin Extended Additional — keep them, collapse everything else to '-'.
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9à-öø-ÿā-ſḀ-ỿ]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = slug.length > 0 ? slug : 'cap';
  const taken = new Set(existingTypes);
  if (!taken.has(base)) {
    return base;
  }
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** Built-in capabilities offered when *creating* a device for a binding kind. */
export function deviceCapabilityOptions(
  binding: DeviceBinding,
): readonly KnownCapability[] {
  return binding.kind === 'relay'
    ? (['switch'] as const)
    : (['temperature', 'humidity'] as const);
}

/**
 * Validate arbitrary input against the snapshot schema.
 * Returns the parsed snapshot or a list of human-readable field errors.
 */
export function parseDevicesSnapshot(
  input: unknown,
): { ok: true; value: DevicesSnapshot } | { ok: false; errors: string[] } {
  const result = DevicesSnapshotSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map(
      issue => `${issue.path.join('.') || 'snapshot'}: ${issue.message}`,
    ),
  };
}
