/**
 * createRoomAndAddToTemplate tests — the cross-store add-room compensation
 * contract (app layer). Creating a physical room and adding its Template
 * reference span TWO repositories, so every branch must be truthful:
 *
 * - success: room created + reference added → `added`;
 * - room creation fails → plain error (no compensation needed);
 * - reference add fails + compensation (room removal) succeeds → plain
 *   error, the orphan room is GONE (no partial state);
 * - reference add fails + compensation ALSO fails → truthful `partial`
 *   (the room exists but is not referenced — never reported as success).
 */

import { err, Errors, ok } from '@core/errors';

import type { AppDependencies } from '../wiring/container';
import { createRoomAndAddToTemplate } from './addRoomToTemplate';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

interface RegistryStub {
  addRoom: jest.Mock;
  removeRoomWithMigration: jest.Mock;
  getRooms: jest.Mock;
}

function makeHarness(options?: {
  addRoom?: jest.Mock;
  addRoomReference?: jest.Mock;
}) {
  const registry: RegistryStub = {
    addRoom:
      options?.addRoom ??
      jest.fn(async () => ok({ id: 'room-new', name: 'Mới' })),
    removeRoomWithMigration: jest.fn(async () => ok(undefined)),
    getRooms: jest.fn(() => [
      { id: 'room-new', name: 'Mới', order: 0, icon: 'home-outline' },
      { id: 'room-other', name: 'Khác', order: 1, icon: 'bed-outline' },
    ]),
  };
  const deps = {
    devicesRegistry: registry,
    dashboardService: {
      addRoomReference:
        options?.addRoomReference ?? jest.fn(async () => ok(undefined)),
    },
  } as unknown as AppDependencies;
  return { deps, registry };
}

describe('createRoomAndAddToTemplate (cross-store compensation)', () => {
  it('success: room created + reference added (kind "added")', async () => {
    const { deps } = makeHarness();
    const outcome = await createRoomAndAddToTemplate(
      deps,
      'tpl-1',
      'Phòng mới',
    );
    expect(outcome).toEqual({ ok: true, message: '', kind: 'added' });
  });

  it('room creation failure → plain error, no compensation attempted', async () => {
    const addRoom = jest.fn(async () => err(Errors.unknown('duplicate name')));
    const { deps, registry } = makeHarness({ addRoom });
    const outcome = await createRoomAndAddToTemplate(deps, 'tpl-1', 'Trùng');
    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({ kind: 'error' });
    expect(registry.removeRoomWithMigration).not.toHaveBeenCalled();
  });

  it('reference failure + successful compensation → error, orphan room removed', async () => {
    const addRoomReference = jest.fn(async () =>
      err(Errors.unknown('storage down')),
    );
    const { deps, registry } = makeHarness({ addRoomReference });
    const outcome = await createRoomAndAddToTemplate(deps, 'tpl-1', 'Mới');
    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({ kind: 'error' });
    // The just-created device-less room was compensated away (moved
    // "nothing" into the first other room — a no-op migration target).
    expect(registry.removeRoomWithMigration).toHaveBeenCalledWith('room-new', {
      kind: 'move',
      roomId: 'room-other',
    });
  });

  it('reference failure + compensation failure → truthful PARTIAL outcome', async () => {
    const addRoomReference = jest.fn(async () =>
      err(Errors.unknown('storage down')),
    );
    const removeRoomWithMigration = jest.fn(async () =>
      err(Errors.unknown('rollback failed')),
    );
    const { deps, registry } = makeHarness({ addRoomReference });
    registry.removeRoomWithMigration = removeRoomWithMigration;
    const outcome = await createRoomAndAddToTemplate(deps, 'tpl-1', 'Mới');
    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({ kind: 'partial' });
  });

  it('compensation is skipped when NO other room exists (truthful partial)', async () => {
    const addRoomReference = jest.fn(async () =>
      err(Errors.unknown('storage down')),
    );
    const { deps, registry } = makeHarness({ addRoomReference });
    registry.getRooms = jest.fn(() => [
      { id: 'room-new', name: 'Mới', order: 0, icon: 'home-outline' },
    ]);
    const outcome = await createRoomAndAddToTemplate(deps, 'tpl-1', 'Mới');
    expect(outcome).toMatchObject({ kind: 'partial' });
    expect(registry.removeRoomWithMigration).not.toHaveBeenCalled();
  });
});
