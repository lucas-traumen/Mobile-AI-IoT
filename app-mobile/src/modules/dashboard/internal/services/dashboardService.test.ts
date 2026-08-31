/**
 * DashboardServiceImpl tests.
 *
 * Verifies: addWidget places in a free slot at the first supported size (+
 * roomId persistence/validation); resize with an unsupported size → err;
 * delete last dashboard → err; removeWidgetsForDevice cascade + compaction;
 * create/setActive/delete dashboard; setActiveRoom (room predicate);
 * move/remove widget; persist + `dashboards:changed` emit.
 * (Seed-on-load behavior is covered by dashboardRepository.test.ts.)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { InMemoryEventBus } from '@core/eventbus';
import { createLogger, NullLogger } from '@core/logger';

import type { DashboardsFile } from '../domain/dashboardSchema';
import { defaultDashboardsFile } from '../domain/seeds';
import { AsyncStorageDashboardRepository } from '../data/dashboardRepository';
import { createDefaultRegistry } from '@modules/widgets/api';
import type { WidgetConfig, WidgetRegistry } from '@modules/widgets/api';
import type { CapabilityDef } from '@modules/devices/api';
import { DashboardServiceImpl } from './dashboardService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

function makeService(options?: {
  persisted?: DashboardsFile;
  registry?: WidgetRegistry;
  roomExists?: (roomId: string) => boolean;
  getCapabilities?: () => readonly CapabilityDef[];
}) {
  const bus = new InMemoryEventBus(createLogger('test'));
  const service = new DashboardServiceImpl({
    repository: new AsyncStorageDashboardRepository(new NullLogger()),
    registry: options?.registry ?? createDefaultRegistry(),
    bus,
    logger: createLogger('test'),
    roomExists: options?.roomExists,
    getCapabilities: options?.getCapabilities,
  });
  return { bus, service };
}

describe('DashboardServiceImpl', () => {
  let service: DashboardServiceImpl;
  let bus: InMemoryEventBus;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Start from the seed file persisted (so load() returns it).
    mockGetItem.mockResolvedValue(JSON.stringify(defaultDashboardsFile()));
    mockSetItem.mockResolvedValue(undefined);
    const made = makeService();
    bus = made.bus;
    service = made.service;
    await service.load();
  });

  it('loads the seed file (default dashboard with 4 widgets)', async () => {
    expect(service.getDashboards()).toHaveLength(1);
    expect(service.getActiveId()).toBe('main');
    expect(service.getActiveDashboard().widgets).toHaveLength(4);
    expect(service.getActiveRoomId()).toBeNull();
  });

  it('addWidget places in a free slot at the first supported size', async () => {
    const r = await service.addWidget('main', {
      type: 'sensor-value',
      binding: { deviceId: 'sensor-01', capability: 'temperature' },
    });
    expect(r.ok).toBe(true);
    const widgets = service.getActiveDashboard().widgets;
    const added = widgets.find(w => w.id === 'w-1')!;
    expect(added.type).toBe('sensor-value');
    expect(added.layout).toMatchObject({ width: 1, height: 1 });
    // Seed layout: row 0 col 0/1 + rows 1..2 → next free spot below the conn widget.
    expect(added.layout).toMatchObject({ x: 0, y: 3 });
    expect(mockSetItem).toHaveBeenCalled();
  });

  it('addWidget persists the roomId when provided', async () => {
    const r = await service.addWidget('main', {
      type: 'connection',
      roomId: 'room-living',
    });
    expect(r.ok).toBe(true);
    const added = service
      .getActiveDashboard()
      .widgets.find(w => w.id === 'w-1')!;
    expect(added.roomId).toBe('room-living');
  });

  it('addWidget honors the requested size (CP-R3)', async () => {
    // room-device-list supports 2x1 + 2x2; requesting 2x2 must win over the
    // definition's first supported size (2x1).
    const r = await service.addWidget('main', {
      type: 'room-device-list',
      roomId: 'room-bedroom',
      size: '2x2',
    });
    expect(r.ok).toBe(true);
    const added = service
      .getActiveDashboard()
      .widgets.find(w => w.id === 'w-1')!;
    expect(added.layout).toMatchObject({ width: 2, height: 2 });
  });

  it('addWidget rejects a size unsupported by the definition (CP-R3)', async () => {
    // connection supports only 2x1.
    const r = await service.addWidget('main', {
      type: 'connection',
      size: '1x1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
    }
  });

  it('addWidget computes the slot in the requested room scope (CP-R3)', async () => {
    // Seed rows 0..2 are occupied by room-living widgets + one global.
    // A widget for a different room must reuse (0,0) — it cannot collide
    // with room-living widgets in the room-aware layout engine.
    const r = await service.addWidget('main', {
      type: 'sensor-value',
      binding: { deviceId: 'sensor-01', capability: 'temperature' },
      roomId: 'room-bedroom',
    });
    expect(r.ok).toBe(true);
    const added = service
      .getActiveDashboard()
      .widgets.find(w => w.id === 'w-1')!;
    expect(added.roomId).toBe('room-bedroom');
    expect(added.layout).toMatchObject({ x: 0, y: 0 });
  });

  it('addWidget in draft mode honors the requested size against the draft (CP-R3)', async () => {
    const store = service.getStore();
    store.getState().enterEdit('main', 'room-living');
    const r = await service.addWidget('main', {
      type: 'sensor-value',
      binding: { deviceId: 'sensor-01', capability: 'temperature' },
      roomId: 'room-living',
      size: '2x1',
    });
    expect(r.ok).toBe(true);
    const draft = store.getState().draftWidgets!;
    const added = draft.find(
      w => w.type === 'sensor-value' && !['w-temp', 'w-hum'].includes(w.id),
    )!;
    expect(added).toBeDefined();
    expect(added.layout).toMatchObject({ width: 2, height: 1 });
    // Draft mode: nothing persisted yet.
    expect(
      service.getActiveDashboard().widgets.some(w => w.id === added.id),
    ).toBe(false);
    store.getState().cancelEdit();
  });

  it('addWidget rejects a roomId unknown to the room predicate', async () => {
    const made = makeService({ roomExists: () => false });
    await made.service.load();
    const r = await made.service.addWidget('main', {
      type: 'connection',
      roomId: 'room-ghost',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('not-found');
    }
  });

  it('addWidget accepts a roomId accepted by the room predicate', async () => {
    const made = makeService({ roomExists: id => id === 'room-living' });
    await made.service.load();
    const r = await made.service.addWidget('main', {
      type: 'connection',
      roomId: 'room-living',
    });
    expect(r.ok).toBe(true);
  });

  it('addWidget rejects an unknown widget type', async () => {
    const r = await service.addWidget('main', { type: 'nope' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
    }
  });

  it('addWidget rejects a binding violating the widget rules', async () => {
    // connection widget has no caps → binding forbidden (service validates).
    const r = await service.addWidget('main', {
      type: 'connection',
      binding: { deviceId: 'relay-1', capability: 'switch' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
    }
  });

  it('resizeWidget rejects an unsupported size', async () => {
    // connection supports only 2x1.
    const r = await service.resizeWidget('main', 'w-conn', '2x2');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
      expect(r.error.message).toMatch(/not supported/);
    }
  });

  it('resizeWidget applies a supported size (relocates when blocked)', async () => {
    // sensor-value supports 1x1 and 2x1. w-temp is 1x1 at (0,0); expanding to
    // 2x1 would hit w-hum at (1,0) → relocated to the first free 2x1 slot.
    const r = await service.resizeWidget('main', 'w-temp', '2x1');
    expect(r.ok).toBe(true);
    const widget = service
      .getActiveDashboard()
      .widgets.find(w => w.id === 'w-temp')!;
    expect(widget.layout).toEqual({ x: 0, y: 3, width: 2, height: 1 });
  });

  it('createDashboard generates dash-N id and becomes active', async () => {
    const r = await service.createDashboard('Thứ hai');
    expect(r.ok).toBe(true);
    const created = service.getDashboards()[1];
    expect(created.id).toMatch(/^dash-\d+$/);
    expect(created.name).toBe('Thứ hai');
    expect(service.getActiveId()).toBe(created.id);
    expect(service.getStore().getState().dashboards).toHaveLength(2);
  });

  it('createDashboard rejects an empty name', async () => {
    const r = await service.createDashboard('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
    }
  });

  it('setActiveDashboard switches and skips no-op commits', async () => {
    await service.createDashboard('Thứ hai');
    const second = service.getDashboards()[1].id;
    const r1 = await service.setActiveDashboard(second);
    expect(r1.ok).toBe(true);
    expect(service.getActiveId()).toBe(second);
    const calls1 = mockSetItem.mock.calls.length;
    // No-op (same id) → no extra persist.
    const r2 = await service.setActiveDashboard(second);
    expect(r2.ok).toBe(true);
    expect(mockSetItem.mock.calls.length).toBe(calls1);
  });

  it('setActiveDashboard rejects an unknown dashboard', async () => {
    const r = await service.setActiveDashboard('ghost');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('not-found');
    }
  });

  it('setActiveRoom stores the filter and mirrors it to the store', async () => {
    const made = makeService({ roomExists: id => id === 'room-living' });
    await made.service.load();
    const r = await made.service.setActiveRoom('room-living');
    expect(r.ok).toBe(true);
    expect(made.service.getActiveRoomId()).toBe('room-living');
    expect(made.service.getStore().getState().activeRoomId).toBe('room-living');
  });

  it('setActiveRoom null clears the filter (Tất cả)', async () => {
    const made = makeService({ roomExists: () => true });
    await made.service.load();
    await made.service.setActiveRoom('room-living');
    const r = await made.service.setActiveRoom(null);
    expect(r.ok).toBe(true);
    expect(made.service.getActiveRoomId()).toBeNull();
  });

  it('setActiveRoom rejects a room unknown to the predicate', async () => {
    const made = makeService({ roomExists: () => false });
    await made.service.load();
    const r = await made.service.setActiveRoom('room-ghost');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('not-found');
    }
    expect(made.service.getActiveRoomId()).toBeNull();
  });

  it('deleteDashboard rejects when it is the last dashboard', async () => {
    const r = await service.deleteDashboard('main');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
      expect(r.error.message).toMatch(/last/);
    }
  });

  it('deleteDashboard falls back to the first remaining dashboard', async () => {
    await service.createDashboard('Thứ hai');
    const created = service.getDashboards()[1].id;
    await service.setActiveDashboard(created);
    const r = await service.deleteDashboard(created);
    expect(r.ok).toBe(true);
    expect(service.getDashboards()).toHaveLength(1);
    expect(service.getActiveId()).toBe('main');
  });

  it('removeWidget compacts the layout upward', async () => {
    // Remove w-room-devices (row 1) → w-conn moves up to row 1.
    const r = await service.removeWidget('main', 'w-room-devices');
    expect(r.ok).toBe(true);
    const conn = service
      .getActiveDashboard()
      .widgets.find(w => w.id === 'w-conn')!;
    expect(conn.layout).toEqual({ x: 0, y: 1, width: 2, height: 1 });
  });

  it('moveWidget applies a valid move and rejects overlap', async () => {
    // w-temp at (0,0); w-hum occupies (1,0) and rows 1..2 are full-width →
    // (1,5) is a truly free target below every row.
    const r1 = await service.moveWidget('main', 'w-temp', 1, 5);
    expect(r1.ok).toBe(true);
    const moved = service
      .getActiveDashboard()
      .widgets.find(w => w.id === 'w-temp')!;
    expect(moved.layout).toEqual({ x: 1, y: 5, width: 1, height: 1 });

    // Overlap: w-hum occupies (1,0); moving w-temp onto (1,0) → err.
    const r2 = await service.moveWidget('main', 'w-temp', 1, 0);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.code).toBe('validation');
    }
  });

  it('removeWidgetsForDevice removes bindings across dashboards and compacts', async () => {
    await service.createDashboard('Thứ hai');
    const second = service.getDashboards()[1].id;
    await service.addWidget(second, {
      type: 'sensor-value',
      binding: { deviceId: 'sensor-01', capability: 'humidity' },
    });
    expect(service.findDashboard(second)!.widgets).toHaveLength(1);

    const events: { activeId: string }[] = [];
    bus.subscribe('dashboards:changed', e => events.push(e));

    const r = await service.removeWidgetsForDevice('sensor-01');
    expect(r.ok).toBe(true);
    // Main dashboard keeps only the room-device-list widget + connection.
    const main = service.findDashboard('main')!;
    expect(main.widgets.map(w => w.id)).toEqual(['w-room-devices', 'w-conn']);
    expect(service.findDashboard(second)!.widgets).toHaveLength(0);
    expect(events.length).toBe(1);
  });

  it('removeWidgetsForDevice is a no-op when nothing matches', async () => {
    const r = await service.removeWidgetsForDevice('ghost-device');
    expect(r.ok).toBe(true);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('emits dashboards:changed with the activeId on commit', async () => {
    const events: { activeId: string }[] = [];
    bus.subscribe('dashboards:changed', e => events.push(e));
    await service.createDashboard('Thứ hai');
    expect(events).toHaveLength(1);
    expect(events[0].activeId).toBe(service.getActiveId());
  });

  describe('applyLayout (CP3)', () => {
    it('persists a valid draft layout and emits dashboards:changed', async () => {
      const events: { activeId: string }[] = [];
      bus.subscribe('dashboards:changed', e => events.push(e));

      const draft = service.getActiveDashboard().widgets.map(w => ({
        ...w,
        layout: { ...w.layout, y: w.layout.y + 5 },
      }));
      const r = await service.applyLayout('main', draft);
      expect(r.ok).toBe(true);
      const persisted = service
        .getActiveDashboard()
        .widgets.find(w => w.id === 'w-temp')!;
      expect(persisted.layout).toMatchObject({ x: 0, y: 5 });
      expect(mockSetItem).toHaveBeenCalled();
      expect(events).toHaveLength(1);
    });

    it('rejects an unknown dashboard', async () => {
      const r = await service.applyLayout('ghost', []);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('not-found');
      }
    });

    it('rejects a draft containing an unknown widget type', async () => {
      const draft: WidgetConfig[] = [
        ...service.getActiveDashboard().widgets,
        {
          id: 'w-bad',
          type: 'not-registered',
          layout: { x: 0, y: 9, width: 1, height: 1 },
        },
      ];
      const r = await service.applyLayout('main', draft);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('validation');
        expect(mockSetItem).not.toHaveBeenCalled();
      }
    });

    it('rejects a draft whose layout overlaps', async () => {
      const draft = service.getActiveDashboard().widgets.map(w => ({
        ...w,
        // Collapse every widget onto (0,0) → overlap.
        layout: { ...w.layout, x: 0, y: 0 },
      }));
      const r = await service.applyLayout('main', draft);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('validation');
      }
    });

    it('rejects an unsupported size in the draft', async () => {
      const draft: WidgetConfig[] = service
        .getActiveDashboard()
        .widgets.map(w =>
          w.id === 'w-conn'
            ? { ...w, layout: { x: 0, y: 5, width: 2, height: 2 } }
            : w,
        );
      const r = await service.applyLayout('main', draft);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('validation');
        expect(r.error.message).toMatch(/not supported/);
      }
    });

    it('accepts an empty draft (all widgets removed)', async () => {
      const r = await service.applyLayout('main', []);
      expect(r.ok).toBe(true);
      expect(service.getActiveDashboard().widgets).toHaveLength(0);
    });
  });

  describe('updateWidgetBinding (CP3)', () => {
    it('rebinds a widget to another device capability', async () => {
      const r = await service.updateWidgetBinding('main', 'w-temp', {
        deviceId: 'sensor-02',
        capability: 'humidity',
      });
      expect(r.ok).toBe(true);
      const widget = service
        .getActiveDashboard()
        .widgets.find(w => w.id === 'w-temp')!;
      expect(widget.binding).toEqual({
        deviceId: 'sensor-02',
        capability: 'humidity',
      });
      expect(widget.layout).toMatchObject({ x: 0, y: 0 }); // layout untouched
      expect(mockSetItem).toHaveBeenCalled();
    });

    it('rejects a capability the widget does not support', async () => {
      const r = await service.updateWidgetBinding('main', 'w-temp', {
        deviceId: 'relay-1',
        capability: 'switch',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe('validation');
      }
    });

    it('rejects an unknown widget or dashboard', async () => {
      const r1 = await service.updateWidgetBinding('main', 'ghost', {
        deviceId: 'sensor-01',
        capability: 'temperature',
      });
      expect(r1.ok).toBe(false);
      const r2 = await service.updateWidgetBinding('ghost', 'w-temp', {
        deviceId: 'sensor-01',
        capability: 'temperature',
      });
      expect(r2.ok).toBe(false);
    });
  });

  describe('addWidget while a draft is open (CP3)', () => {
    it('appends to the draft without persisting', async () => {
      service.getStore().getState().enterEdit('main');
      const before = mockSetItem.mock.calls.length;

      const r = await service.addWidget('main', { type: 'connection' });
      expect(r.ok).toBe(true);

      // Persisted layout unchanged; draft grew by one.
      expect(mockSetItem.mock.calls.length).toBe(before);
      expect(service.getActiveDashboard().widgets).toHaveLength(4);
      const draft = service.getStore().getState().draftWidgets!;
      expect(draft).toHaveLength(5);
      expect(draft[draft.length - 1].type).toBe('connection');
      // The new widget lands in the first free slot of the draft.
      expect(draft[draft.length - 1].layout).toMatchObject({ x: 0, y: 3 });
    });

    it('after cancelEdit the added widget is gone (Hủy)', async () => {
      service.getStore().getState().enterEdit('main');
      await service.addWidget('main', { type: 'connection' });
      service.getStore().getState().cancelEdit();
      expect(service.getActiveDashboard().widgets).toHaveLength(4);
      expect(service.getStore().getState().draftWidgets).toBeNull();
    });

    it('after applyLayout the added widget is persisted (Lưu)', async () => {
      service.getStore().getState().enterEdit('main');
      await service.addWidget('main', { type: 'connection' });
      const draft = service.getStore().getState().draftWidgets!;
      const r = await service.applyLayout('main', draft);
      expect(r.ok).toBe(true);
      expect(service.getActiveDashboard().widgets).toHaveLength(5);
    });
  });

  it('load aligns the id counter with persisted w-N ids', async () => {
    // A persisted file whose widgets already use `w-1..w-3` ids: the next
    // widget must not reuse those ids (counter starts after the max).
    const file: DashboardsFile = {
      dashboards: [
        {
          id: 'main',
          name: 'Trang chủ',
          widgets: [
            {
              id: 'w-3',
              type: 'connection',
              layout: { x: 0, y: 0, width: 2, height: 1 },
            },
          ],
        },
      ],
      activeId: 'main',
      activeRoomId: null,
    };
    mockGetItem.mockResolvedValue(JSON.stringify(file));
    const made = makeService();
    await made.service.load();
    await made.service.addWidget('main', { type: 'connection' });
    const widgets = made.service.getActiveDashboard().widgets;
    expect(widgets.map(w => w.id)).toEqual(['w-3', 'w-4']);
  });
});

describe('DashboardServiceImpl migrateWidgetsFromRoom (CP5)', () => {
  let service: DashboardServiceImpl;
  let bus: InMemoryEventBus;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(JSON.stringify(defaultDashboardsFile()));
    mockSetItem.mockResolvedValue(undefined);
    const made = makeService();
    bus = made.bus;
    service = made.service;
    await service.load();
  });

  it('move: retargets the removed room widgets and keeps layouts', async () => {
    const events: unknown[] = [];
    bus.subscribe('dashboards:changed', e => events.push(e));

    const r = await service.migrateWidgetsFromRoom('room-living', 'room-new');
    expect(r.ok).toBe(true);

    const widgets = service.getActiveDashboard().widgets;
    const byId = Object.fromEntries(widgets.map(w => [w.id, w]));
    expect(byId['w-temp'].roomId).toBe('room-new');
    expect(byId['w-hum'].roomId).toBe('room-new');
    expect(byId['w-room-devices'].roomId).toBe('room-new');
    // The global widget stays untouched, and layouts are preserved.
    expect(byId['w-conn'].roomId).toBeUndefined();
    expect(byId['w-temp'].layout).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(mockSetItem).toHaveBeenCalled();
    expect(events).toHaveLength(1);
  });

  it('unassign: the removed room widgets become global', async () => {
    const r = await service.migrateWidgetsFromRoom('room-living', null);
    expect(r.ok).toBe(true);

    const widgets = service.getActiveDashboard().widgets;
    const roomBound = widgets.filter(w => w.roomId !== undefined);
    expect(roomBound).toHaveLength(0);
    expect(widgets).toHaveLength(4);
    expect(mockSetItem).toHaveBeenCalled();
  });

  it('is a no-op (no persist) when no widget references the room', async () => {
    const r = await service.migrateWidgetsFromRoom('room-ghost', 'room-new');
    expect(r.ok).toBe(true);
    const widgets = service.getActiveDashboard().widgets;
    expect(widgets.filter(w => w.roomId === 'room-living')).toHaveLength(3);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('relocates a mover that collides with the target room (merge merge-safe)', async () => {
    // Target room-b already occupies (0,0); the source room-a widget sits at
    // the same coordinates. Migrating room-a into room-b must relocate the
    // mover deterministically, keep the target widget and the global
    // untouched, and persist a valid layout.
    const file: DashboardsFile = {
      activeId: 'main',
      activeRoomId: null,
      dashboards: [
        {
          id: 'main',
          name: 'Nhà',
          widgets: [
            {
              id: 'w-target',
              type: 'sensor-value',
              roomId: 'room-b',
              binding: { deviceId: 'd1', capability: 'temperature' },
              layout: { x: 0, y: 0, width: 1, height: 1 },
            },
            {
              id: 'w-mover',
              type: 'sensor-value',
              roomId: 'room-a',
              binding: { deviceId: 'd2', capability: 'temperature' },
              layout: { x: 0, y: 0, width: 1, height: 1 },
            },
            {
              id: 'w-global',
              type: 'connection',
              layout: { x: 0, y: 4, width: 2, height: 1 },
            },
          ],
        },
      ],
    };
    mockGetItem.mockResolvedValue(JSON.stringify(file));
    const made = makeService();
    await made.service.load();

    const r = await made.service.migrateWidgetsFromRoom('room-a', 'room-b');
    expect(r.ok).toBe(true);

    const widgets = made.service.getActiveDashboard().widgets;
    const byId = Object.fromEntries(widgets.map(w => [w.id, w]));
    // The mover was retargeted and relocated to the first free slot in the
    // target room's scope — the occupant stays at (0,0).
    expect(byId['w-mover'].roomId).toBe('room-b');
    expect(byId['w-mover'].layout).toEqual({ x: 1, y: 0, width: 1, height: 1 });
    expect(byId['w-target'].layout).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    // Globals are preserved untouched.
    expect(byId['w-global'].roomId).toBeUndefined();
    expect(byId['w-global'].layout).toEqual({
      x: 0,
      y: 4,
      width: 2,
      height: 1,
    });
    expect(mockSetItem).toHaveBeenCalled();
  });

  it('relocates movers that collide with each other when merging rooms', async () => {
    // Two different source widgets share (0,0) via different rooms; both
    // move into room-b. The second mover must be placed after the first
    // (incremental relocation), never overlapping it.
    const file: DashboardsFile = {
      activeId: 'main',
      activeRoomId: null,
      dashboards: [
        {
          id: 'main',
          name: 'Nhà',
          widgets: [
            {
              id: 'w-a1',
              type: 'sensor-value',
              roomId: 'room-a',
              binding: { deviceId: 'd1', capability: 'temperature' },
              layout: { x: 0, y: 0, width: 1, height: 1 },
            },
            {
              id: 'w-a2',
              type: 'sensor-value',
              roomId: 'room-c',
              binding: { deviceId: 'd2', capability: 'temperature' },
              layout: { x: 0, y: 0, width: 1, height: 1 },
            },
          ],
        },
      ],
    };
    mockGetItem.mockResolvedValue(JSON.stringify(file));
    const made = makeService();
    await made.service.load();

    const r = await made.service.migrateWidgetsFromRoom('room-c', 'room-a');
    expect(r.ok).toBe(true);

    const byId = Object.fromEntries(
      made.service.getActiveDashboard().widgets.map(w => [w.id, w]),
    );
    expect(byId['w-a1'].layout).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(byId['w-a2'].roomId).toBe('room-a');
    expect(byId['w-a2'].layout).toEqual({ x: 1, y: 0, width: 1, height: 1 });
  });
});

describe('DashboardServiceImpl custom capability binding (CP5/CP6)', () => {
  const catalog: readonly CapabilityDef[] = [
    { type: 'temperature', label: 'Nhiệt độ', kind: 'sensor' },
    { type: 'humidity', label: 'Độ ẩm', kind: 'sensor' },
    { type: 'switch', label: 'Công tắc', kind: 'switch' },
    { type: 'pressure', label: 'Áp suất', kind: 'sensor' },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(JSON.stringify(defaultDashboardsFile()));
    mockSetItem.mockResolvedValue(undefined);
  });

  it('addWidget accepts a user-defined sensor capability when the catalog is wired', async () => {
    const made = makeService({ getCapabilities: () => catalog });
    await made.service.load();
    const r = await made.service.addWidget('main', {
      type: 'sensor-value',
      binding: { deviceId: 'sensor-01', capability: 'pressure' },
    });
    expect(r.ok).toBe(true);
    const added = made.service
      .getActiveDashboard()
      .widgets.find(w => w.binding?.capability === 'pressure');
    expect(added).toBeDefined();
  });

  it('addWidget rejects a user-defined capability without the catalog', async () => {
    const made = makeService();
    await made.service.load();
    const r = await made.service.addWidget('main', {
      type: 'sensor-value',
      binding: { deviceId: 'sensor-01', capability: 'pressure' },
    });
    expect(r.ok).toBe(false);
  });
});
