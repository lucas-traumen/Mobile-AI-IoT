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
 * identity — the query filters the room's tag; fields come from the room's
 * projected registered sensors).
 *
 * Identity (boards-topic-contract-v2, decision 1): the backend's direct
 * InfluxDB contract tags real-board rows with the `boardId` tag. When
 * `boardCode` is present (the room is bound to a board) the query carries
 * `{boardId: boardCode, roomId: null}` so the Flux filter targets the
 * `boardId` tag; without it the exact historical behavior applies
 * (`tagRoomId ?? roomId` in the `roomId` filter). Field derivation ALWAYS
 * scopes by the internal `roomId` (registrations never carry codes); only
 * the tag identity switches.
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
  tagRoomId?: string,
  boardCode?: string,
): HistoryQuery | null {
  if (roomId === null) {
    return null;
  }
  const fields = sensorFieldsForRoom(devices, capabilities, roomId);
  if (fields.length === 0) {
    return null;
  }
  if (boardCode !== undefined) {
    return {
      measurement: 'sensors',
      range,
      fields,
      roomId: null,
      boardId: boardCode,
    };
  }
  return { measurement: 'sensors', range, fields, roomId: tagRoomId ?? roomId };
}
