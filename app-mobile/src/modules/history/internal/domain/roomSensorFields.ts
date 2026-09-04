/**
 * History domain: room → history query mapping (pure).
 *
 * Approved room-sensor contract (room-sensor-derived-history-layout-rework):
 * History is DERIVED from the room's registered sensors — one projected
 * sensor registration ({roomId, field}) means one requested field and one
 * History card. The wire identity is `roomId + field`; the Influx query
 * filters the `roomId` tag and groups by `roomId, _field`.
 * `null` roomId = no valid active room (no query must be issued).
 */

import type { CapabilityDef, Device } from '@modules/devices/api';
import { projectSensorRegistrations } from '@modules/devices/api';
import type { HistoryQuery, HistoryRange } from './fluxQueryBuilder';

/**
 * Sensor fields (Influx `_field` keys) registered in a room, derived from
 * the pure sensor projection (one visible sensor = one metric; legacy
 * multi-capability boards contribute each of their capabilities).
 *
 * @param devices - all registered devices.
 * @param capabilities - the capability catalog (sensor kinds only project).
 * @param roomId - room to scope to (`null` = no valid room → empty).
 * @returns the room's registered fields in registration order (unique).
 */
export function sensorFieldsForRoom(
  devices: readonly Device[],
  capabilities: readonly CapabilityDef[],
  roomId: string | null,
): readonly string[] {
  if (roomId === null) {
    return [];
  }
  const fields: string[] = [];
  for (const registration of projectSensorRegistrations(
    devices,
    capabilities,
  )) {
    if (
      registration.roomId === roomId &&
      !fields.includes(registration.field)
    ) {
      fields.push(registration.field);
    }
  }
  return fields;
}

/**
 * Build the room's history query value object (approved `roomId + _field`
 * identity — the query filters the `roomId` tag; fields come from the
 * room's projected registered sensors).
 *
 * @returns `null` when the room has no registered sensor (the caller must
 *   short-circuit to an empty state instead of issuing an invalid query),
 *   or the query filtering the room + registered fields.
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
  return { measurement: 'sensors', range, fields, roomId };
}
