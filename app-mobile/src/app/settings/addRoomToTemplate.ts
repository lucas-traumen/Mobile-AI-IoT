/**
 * Cross-store room-membership creation with explicit compensation (approved
 * contract for the add-room flow): creating a physical room and adding its
 * reference to a Template span TWO repositories (devices + dashboard), and
 * neither can wrap both writes in one transaction through the approved
 * facades. The helper therefore:
 *
 * 1. creates the physical room through the devices registry,
 * 2. adds the Template reference through the dashboard service,
 * 3. on a reference failure, COMPENSATES by removing the just-created
 *    (device-less) physical room — the room removal itself needs a
 *    migration target; a fresh room owns no devices, so moving "nothing"
 *    to the first other room is a no-op,
 * 4. when even the compensation fails, reports a truthful PARTIAL outcome
 *    (the room exists but is not referenced) — partial success is never
 *    reported as full success, and the UI copy tells the user the retry
 *    path (add the room from the existing-rooms list).
 *
 * Physical-room ownership is untouched: rooms remain devices-module
 * records with no Template identity (model 1A). Lives under the Settings
 * app layer because the CreateRoom route is part of the Settings
 * management hierarchy (the Dashboard tab is view-only).
 */

import type { AppDependencies } from '../wiring/container';
import type { CreateRoomOutcome } from '@modules/dashboard/ui/CreateRoomScreen';

export async function createRoomAndAddToTemplate(
  deps: AppDependencies,
  templateId: string,
  name: string,
): Promise<CreateRoomOutcome> {
  const roomResult = await deps.devicesRegistry.addRoom(name);
  if (!roomResult.ok) {
    return {
      ok: false,
      message: roomResult.error.message || 'Lỗi',
      kind: 'error',
    };
  }
  const room = roomResult.value;
  const addResult = await deps.dashboardService.addRoomReference(
    templateId,
    room.id,
  );
  if (addResult.ok) {
    return { ok: true, message: '', kind: 'added' };
  }
  // Compensation: remove the just-created device-less room so no orphan
  // physical room is left behind by the failed reference add.
  const rooms = deps.devicesRegistry.getRooms();
  const target = rooms.find(candidate => candidate.id !== room.id);
  if (target) {
    const compensated = await deps.devicesRegistry.removeRoomWithMigration(
      room.id,
      { kind: 'move', roomId: target.id },
    );
    if (compensated.ok) {
      return {
        ok: false,
        message: addResult.error.message || 'Lỗi',
        kind: 'error',
      };
    }
  }
  // Compensation impossible/failed → truthful partial state.
  return {
    ok: false,
    message: addResult.error.message || 'Lỗi',
    kind: 'partial',
  };
}
