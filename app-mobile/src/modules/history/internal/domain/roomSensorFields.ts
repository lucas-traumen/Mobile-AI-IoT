/**
 * History domain: room → history query mapping (pure).
 *
 * CP4: history is room-aware. CP-R5: a room's history query filters the
 * `deviceId` tags of the room's telemetry devices AND the sensor fields of
 * their capabilities; results stay separated per `deviceId + field`.
 * `null` roomId = no valid active room (no query must be issued).
 */

import type { CapabilityDef, Device } from '@modules/devices/api';
import type { HistoryQuery, HistoryRange } from './fluxQueryBuilder';

/**
 * Sensor fields (Flux `_field` names) to query for a room.
 *
 * @param devices - all registered devices.
 * @param capabilities - the capability catalog (sensor kinds only are kept).
 * @param roomId - room to scope to (`null` = no valid room → empty).
 * @returns unique capability types of the room's `telemetry-sensor` devices,
 *   in device order (empty when the room has no sensor devices).
 */
export function sensorFieldsForRoom(
  devices: readonly Device[],
  capabilities: readonly CapabilityDef[],
  roomId: string | null,
): readonly string[] {
  const sensorTypes = new Set(
    capabilities.filter(def => def.kind === 'sensor').map(def => def.type),
  );
  const pool =
    roomId === null ? [] : devices.filter(device => device.roomId === roomId);
  const fields: string[] = [];
  for (const device of pool) {
    if (device.binding.kind !== 'telemetry-sensor') {
      continue;
    }
    for (const capability of device.capabilities) {
      if (sensorTypes.has(capability) && !fields.includes(capability)) {
        fields.push(capability);
      }
    }
  }
  return fields;
}

/**
 * CP-R5: build the room's history query value object.
 *
 * @returns `null` when the room has no telemetry sensor devices (the caller
 *   must short-circuit to an empty state instead of issuing an invalid
 * query), or the query filtering the room's device ids + sensor fields.
 */
export function historyQueryForRoom(
  devices: readonly Device[],
  capabilities: readonly CapabilityDef[],
  roomId: string | null,
  range: HistoryRange,
): HistoryQuery | null {
  if (roomId === null) {
    return null;
  }
  const fields = sensorFieldsForRoom(devices, capabilities, roomId);
  if (fields.length === 0) {
    return null;
  }
  const sensorTypes = new Set(
    capabilities.filter(def => def.kind === 'sensor').map(def => def.type),
  );
  const deviceIds = devices
    .filter(
      device =>
        device.roomId === roomId &&
        device.binding.kind === 'telemetry-sensor' &&
        device.capabilities.some(cap => sensorTypes.has(cap)),
    )
    .map(device => device.id);
  return { measurement: 'sensors', range, fields, deviceIds };
}
