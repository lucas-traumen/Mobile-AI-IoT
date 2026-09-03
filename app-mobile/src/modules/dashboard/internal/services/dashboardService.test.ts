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
import type { Logger } from '@core/logger';

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
  logger?: Logger;
}) {
  const bus = new InMemoryEventBus(createLogger('test'));
  const service = new DashboardServiceImpl({
    repository: new AsyncStorageDashboardRepository(new NullLogger()),
    registry: options?.registry ?? createDefaultRegistry(),
    bus,
    logger: options?.logger ?? createLogger('test'),
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
    const widgets = service.getActiveDashboard().widgets;
    expect(widgets).toHaveLength(4);
    expect(widgets.map(w => w.id)).toEqual([
      'w-temp',
      'w-hum',
      'w-light',
      'w-fan',
    ]);
    expect(widgets.map(w => w.type)).toEqual([
      'sensor-value',
      'sensor-value',
      'switch',
      'switch',
    ]);
    expect(widgets.every(w => w.roomId === 'room-living')).toBe(true);
    expect(service.getActiveRoomId()).toBeNull();
  });

  it('the seed contains no connection widget (retired type)', async () => {
    expect(
      service.getActiveDashboard().widgets.some(w => w.type === 'connection'),
    ).toBe(false);
  });

  it('the seed binds the switches to the Đèn/Quạt relays side by side', async () => {
    const widgets = service.getActiveDashboard().widgets;
    expect(widgets.find(w => w.id === 'w-light')?.binding).toEqual({
      deviceId: 'relay-1',
      capability: 'switch',
    });
    expect(widgets.find(w => w.id === 'w-light')?.layout).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 1,
    });
    expect(widgets.find(w => w.id === 'w-fan')?.binding).toEqual({
      deviceId: 'relay-2',
      capability: 'switch',
    });
    expect(widgets.find(w => w.id === 'w-fan')?.layout).toEqual({
      x: 1,
      y: 1,
      width: 1,
      height: 1,
    });
  });

  it('the seed drops the room-device-list card (the TYPE stays registrable)', async () => {
    expect(
      service
        .getActiveDashboard()
        .widgets.some(w => w.type === 'room-device-list'),
    ).toBe(false);
    // The TYPE remains registrable via Add Widget.
    const r = await service.addWidget('main', { type: 'room-device-list' });
    expect(r.ok).toBe(true);
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
    // Seed layout: rows 0 (sensors) + 1 (side-by-side switch cards) are
    // occupied → next free slot (0,2).
    expect(added.layout).toMatchObject({ x: 0, y: 2 });
    expect(mockSetItem).toHaveBeenCalled();
  });

  it('addWidget persists the roomId when provided', async () => {
    const r = await service.addWidget('main', {
      type: 'room-device-list',
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
    // room-device-list supports only 2x1 + 2x2.
    const r = await service.addWidget('main', {
      type: 'room-device-list',
      size: '1x1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
    }
  });

  it('addWidget computes the slot in the requested room scope (CP-R3)', async () => {
    // Seed row 0 is occupied by room-living widgets.
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
      type: 'room-device-list',
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
      type: 'room-device-list',
      roomId: 'room-living',
    });
    expect(r.ok).toBe(true);
  });

  it('addWidget rejects the retired connection type (absent from the registry)', async () => {
    const r = await service.addWidget('main', { type: 'connection' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
      expect(r.error.message).toMatch(/Unknown widget type "connection"/);
    }
  });

  it('addWidget rejects a binding violating the widget rules', async () => {
    // room-device-list has no caps → binding forbidden (service validates).
    const r = await service.addWidget('main', {
      type: 'room-device-list',
      binding: { deviceId: 'relay-1', capability: 'switch' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
    }
  });

  it('resizeWidget rejects an unsupported size', async () => {
    // sensor-value supports only 1x1 + 2x1.
    const r = await service.resizeWidget('main', 'w-temp', '2x2');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('validation');
      expect(r.error.message).toMatch(/not supported/);
    }
  });

  it('resizeWidget applies a supported size (relocates when blocked)', async () => {
    // sensor-value supports 1x1 and 2x1. w-temp is 1x1 at (0,0); expanding to
    // 2x1 would hit w-hum at (1,0) and the seed's side-by-side switch cards
    // occupy row 1 → relocated to the first free 2x1 slot (0,2).
    const r = await service.resizeWidget('main', 'w-temp', '2x1');
    expect(r.ok).toBe(true);
    const widget = service
      .getActiveDashboard()
      .widgets.find(w => w.id === 'w-temp')!;
    expect(widget.layout).toEqual({ x: 0, y: 2, width: 2, height: 1 });
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
    // Add a 2x1 room list below the seed (auto-placed at (0,2) — the seed's
    // side-by-side switch cards occupy row 1), then remove the seed's w-fan:
    // the compaction keeps the room list at (0,2) (w-light still blocks the
    // left half of row 1 for a 2x1 card).
    const added = await service.addWidget('main', {
      type: 'room-device-list',
    });
    expect(added.ok).toBe(true);
    const r = await service.removeWidget('main', 'w-fan');
    expect(r.ok).toBe(true);
    const roomList = service
      .getActiveDashboard()
      .widgets.find(w => w.id === 'w-1')!;
    expect(roomList.layout).toEqual({ x: 0, y: 2, width: 2, height: 1 });
  });

  it('moveWidget applies a valid move and rejects overlap', async () => {
    // w-temp at (0,0); w-hum occupies (1,0), row 1+ is free →
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
    // Both seed sensors bind sensor-01 (removed); the switch cards bind the
    // relays → the main dashboard keeps exactly those widgets.
    const main = service.findDashboard('main')!;
    expect(main.widgets.map(w => w.id)).toEqual(['w-light', 'w-fan']);
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
          w.id === 'w-temp'
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

      const r = await service.addWidget('main', { type: 'room-device-list' });
      expect(r.ok).toBe(true);

      // Persisted layout unchanged; draft grew by one.
      expect(mockSetItem.mock.calls.length).toBe(before);
      expect(service.getActiveDashboard().widgets).toHaveLength(4);
      const draft = service.getStore().getState().draftWidgets!;
      expect(draft).toHaveLength(5);
      expect(draft[draft.length - 1].type).toBe('room-device-list');
      // The new widget lands in the first free slot of the draft (seed rows
      // 0 + 1 are occupied → (0,2)).
      expect(draft[draft.length - 1].layout).toMatchObject({ x: 0, y: 2 });
    });

    it('after cancelEdit the added widget is gone (Hủy)', async () => {
      service.getStore().getState().enterEdit('main');
      await service.addWidget('main', { type: 'room-device-list' });
      service.getStore().getState().cancelEdit();
      expect(service.getActiveDashboard().widgets).toHaveLength(4);
      expect(service.getStore().getState().draftWidgets).toBeNull();
    });

    it('after applyLayout the added widget is persisted (Lưu)', async () => {
      service.getStore().getState().enterEdit('main');
      await service.addWidget('main', { type: 'room-device-list' });
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
              type: 'room-device-list',
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
    await made.service.addWidget('main', { type: 'room-device-list' });
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
    // Layouts are preserved.
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
    expect(widgets.filter(w => w.roomId === 'room-living')).toHaveLength(4);
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
              type: 'room-device-list',
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

describe('DashboardServiceImpl legacy connection migration (Phase 1)', () => {
  /**
   * A pre-Phase-1 persisted file: `connection` widgets (retired type) exist
   * in two dashboards, one of them BETWEEN kept widgets so the compaction
   * (slide-up) is observable; the second dashboard holds only the retired
   * widget. An unknown custom type is kept as-is (unknown-type fallback
   * must stay intact for unrelated widget types).
   */
  const legacyFile: DashboardsFile = {
    dashboards: [
      {
        id: 'main',
        name: 'Trang chủ',
        widgets: [
          {
            id: 'w-1',
            type: 'sensor-value',
            roomId: 'room-living',
            binding: { deviceId: 'sensor-01', capability: 'temperature' },
            layout: { x: 0, y: 0, width: 1, height: 1 },
          },
          {
            id: 'w-legacy-conn',
            type: 'connection',
            layout: { x: 0, y: 1, width: 2, height: 1 },
          },
          {
            id: 'w-2',
            type: 'room-device-list',
            roomId: 'room-living',
            layout: { x: 0, y: 2, width: 2, height: 1 },
          },
        ],
      },
      {
        id: 'dash-2',
        name: 'Tầng hai',
        widgets: [
          {
            id: 'w-legacy-conn-2',
            type: 'connection',
            layout: { x: 0, y: 0, width: 2, height: 1 },
          },
        ],
      },
    ],
    activeId: 'main',
    activeRoomId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetItem.mockResolvedValue(undefined);
  });

  it('removes legacy connection widgets across dashboards, compacts, persists', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(legacyFile));
    const made = makeService();
    await made.service.load();

    const main = made.service.findDashboard('main')!;
    expect(main.widgets.map(w => w.id)).toEqual(['w-1', 'w-2']);
    // Compaction: the room list slid up into the retired widget's row.
    expect(main.widgets[1].layout).toEqual({ x: 0, y: 1, width: 2, height: 1 });
    // The dashboard that held only the connection widget is now empty —
    // the dashboard itself survives (no data loss beyond the retired type).
    expect(made.service.findDashboard('dash-2')!.widgets).toEqual([]);
    // The cleaned snapshot was persisted.
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(
      mockSetItem.mock.calls[0][1] as string,
    ) as DashboardsFile;
    expect(
      persisted.dashboards.every(dashboard =>
        dashboard.widgets.every(w => w.type !== 'connection'),
      ),
    ).toBe(true);
    // The in-memory store mirrors the migrated file.
    expect(made.service.getStore().getState().dashboards).toHaveLength(2);
  });

  it('keeps unrelated custom/unknown widget types untouched', async () => {
    const withCustom: DashboardsFile = {
      ...legacyFile,
      dashboards: [
        {
          id: 'main',
          name: 'Trang chủ',
          widgets: [
            ...legacyFile.dashboards[0].widgets,
            {
              id: 'w-custom',
              type: 'future-vendor-widget',
              layout: { x: 0, y: 3, width: 2, height: 1 },
            },
          ],
        },
        legacyFile.dashboards[1],
      ],
    };
    mockGetItem.mockResolvedValue(JSON.stringify(withCustom));
    const made = makeService();
    await made.service.load();

    const main = made.service.findDashboard('main')!;
    expect(main.widgets.some(w => w.id === 'w-custom')).toBe(true);
    expect(main.widgets.map(w => w.id)).toEqual(['w-1', 'w-2', 'w-custom']);
  });

  it('is idempotent: loading an already-migrated file does not persist again', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(defaultDashboardsFile()));
    const made = makeService();
    await made.service.load();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('keeps the migrated in-memory result when the rewrite fails and warns', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(legacyFile));
    mockSetItem.mockRejectedValue(new Error('disk full'));
    const logger: Logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const made = makeService({ logger });

    // Load must NOT crash and must NOT seed over the valid persisted data.
    await expect(made.service.load()).resolves.toBeTruthy();

    const main = made.service.findDashboard('main')!;
    expect(main.widgets.map(w => w.id)).toEqual(['w-1', 'w-2']);
    expect(made.service.findDashboard('dash-2')!.widgets).toEqual([]);
    // The failure surfaced through the logger (visible, non-fatal).
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('legacy'),
      expect.anything(),
    );
  });

  it('retries the migration on the next load after a failed rewrite', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(legacyFile));
    mockSetItem.mockRejectedValueOnce(new Error('disk full'));
    const made = makeService();
    await made.service.load();
    expect(mockSetItem).toHaveBeenCalledTimes(1);

    // The rewrite failure left the persisted file untouched (still legacy),
    // so the next load re-runs the migration — the natural retry path.
    mockSetItem.mockResolvedValue(undefined);
    await made.service.load();
    expect(mockSetItem).toHaveBeenCalledTimes(2);
    const persisted = JSON.parse(
      mockSetItem.mock.calls[1][1] as string,
    ) as DashboardsFile;
    expect(
      persisted.dashboards.every(dashboard =>
        dashboard.widgets.every(w => w.type !== 'connection'),
      ),
    ).toBe(true);
  });
});

describe('DashboardServiceImpl legacy seed relay normalization (responsive redesign)', () => {
  /**
   * A pre-responsive persisted file: the two relay cards still carry the
   * ORIGINAL default seed arrangement (w-light 2x1 at (0,1), w-fan 2x1 at
   * (0,2), switch bindings, no custom title). This is the ONLY arrangement
   * the conditional migration may rewrite — to the approved side-by-side
   * 1x1 pair at (0,1)/(1,1).
   */
  function legacySeedFile(): DashboardsFile {
    return {
      dashboards: [
        {
          id: 'main',
          name: 'Trang chủ',
          widgets: [
            {
              id: 'w-temp',
              type: 'sensor-value',
              roomId: 'room-living',
              binding: { deviceId: 'sensor-01', capability: 'temperature' },
              layout: { x: 0, y: 0, width: 1, height: 1 },
            },
            {
              id: 'w-hum',
              type: 'sensor-value',
              roomId: 'room-living',
              binding: { deviceId: 'sensor-01', capability: 'humidity' },
              layout: { x: 1, y: 0, width: 1, height: 1 },
            },
            {
              id: 'w-light',
              type: 'switch',
              roomId: 'room-living',
              binding: { deviceId: 'relay-1', capability: 'switch' },
              layout: { x: 0, y: 1, width: 2, height: 1 },
            },
            {
              id: 'w-fan',
              type: 'switch',
              roomId: 'room-living',
              binding: { deviceId: 'relay-2', capability: 'switch' },
              layout: { x: 0, y: 2, width: 2, height: 1 },
            },
          ],
        },
      ],
      activeId: 'main',
      activeRoomId: null,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetItem.mockResolvedValue(undefined);
  });

  it('normalizes the untouched legacy seed pair to side-by-side 1x1', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(legacySeedFile()));
    const made = makeService();
    await made.service.load();

    const widgets = made.service.findDashboard('main')!.widgets;
    expect(widgets.find(w => w.id === 'w-light')?.layout).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 1,
    });
    expect(widgets.find(w => w.id === 'w-fan')?.layout).toEqual({
      x: 1,
      y: 1,
      width: 1,
      height: 1,
    });
    // The normalized snapshot was persisted exactly once.
    expect(mockSetItem).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: an already-normalized file persists nothing', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(defaultDashboardsFile()));
    const made = makeService();
    await made.service.load();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('never rewrites a customized relay layout (moved card)', async () => {
    const file = legacySeedFile();
    const light = file.dashboards[0].widgets.find(w => w.id === 'w-light')!;
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        ...file,
        dashboards: [
          {
            ...file.dashboards[0],
            widgets: file.dashboards[0].widgets.map(w =>
              w.id === 'w-light'
                ? { ...w, layout: { x: 0, y: 4, width: 2, height: 1 } }
                : w,
            ),
          },
        ],
      }),
    );
    void light;
    const made = makeService();
    await made.service.load();

    const widgets = made.service.findDashboard('main')!.widgets;
    expect(widgets.find(w => w.id === 'w-light')?.layout).toEqual({
      x: 0,
      y: 4,
      width: 2,
      height: 1,
    });
    expect(widgets.find(w => w.id === 'w-fan')?.layout).toEqual({
      x: 0,
      y: 2,
      width: 2,
      height: 1,
    });
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('never rewrites a renamed (custom-title) relay card', async () => {
    const file = legacySeedFile();
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        ...file,
        dashboards: [
          {
            ...file.dashboards[0],
            widgets: file.dashboards[0].widgets.map(w =>
              w.id === 'w-light' ? { ...w, title: 'Đèn phòng khách' } : w,
            ),
          },
        ],
      }),
    );
    const made = makeService();
    await made.service.load();

    const widgets = made.service.findDashboard('main')!.widgets;
    expect(widgets.find(w => w.id === 'w-light')?.layout).toEqual({
      x: 0,
      y: 1,
      width: 2,
      height: 1,
    });
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('skips the normalization when a target cell is occupied (no overlap)', async () => {
    const file = legacySeedFile();
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        ...file,
        dashboards: [
          {
            ...file.dashboards[0],
            // An extra widget occupies the (1,1) target cell.
            widgets: [
              ...file.dashboards[0].widgets,
              {
                id: 'w-1',
                type: 'room-device-list',
                roomId: 'room-living',
                layout: { x: 1, y: 1, width: 1, height: 1 },
              },
            ],
          },
        ],
      }),
    );
    const made = makeService();
    await made.service.load();

    const widgets = made.service.findDashboard('main')!.widgets;
    expect(widgets.find(w => w.id === 'w-light')?.layout).toEqual({
      x: 0,
      y: 1,
      width: 2,
      height: 1,
    });
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('normalizes only the untouched pair (one customized card blocks both)', async () => {
    const file = legacySeedFile();
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        ...file,
        dashboards: [
          {
            ...file.dashboards[0],
            // w-fan was resized by the user — the PAIR no longer matches the
            // untouched legacy arrangement, so w-light stays untouched too.
            widgets: file.dashboards[0].widgets.map(w =>
              w.id === 'w-fan'
                ? { ...w, layout: { x: 0, y: 2, width: 1, height: 1 } }
                : w,
            ),
          },
        ],
      }),
    );
    const made = makeService();
    await made.service.load();

    const widgets = made.service.findDashboard('main')!.widgets;
    expect(widgets.find(w => w.id === 'w-light')?.layout).toEqual({
      x: 0,
      y: 1,
      width: 2,
      height: 1,
    });
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});
