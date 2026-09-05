/**
 * DashboardServiceImpl tests (Template model).
 *
 * Verifies: seed/stamp/migration loads (idempotent, never reseeding valid
 * data), Template CRUD + duplicate (fresh ids) + last-delete guard +
 * deterministic selection fallback, atomic commit rollback, room-reference
 * add/reorder/duplicate/remove, room-scoped widget operations (add/apply/
 * duplicate-to-room/move-to-room with room-compatible bindings and
 * uniqueness), retired/duplicate load migrations, custom unknown-field
 * round-trip, device cascades, and the History room-selection seam.
 */

import { InMemoryEventBus } from '@core/eventbus';
import { createLogger } from '@core/logger';
import { err, Errors, ok, type Result } from '@core/errors';
import { FakeClock } from '@core/time';

import type {
  DashboardsFile,
  LegacyDashboardsFile,
} from '../domain/dashboardSchema';
import { parseDashboardsFile } from '../domain/dashboardSchema';
import { defaultDashboardsFile } from '../domain/seeds';
import type { DashboardRepository } from '../data/dashboardRepository';
import { createDefaultRegistry } from '@modules/widgets/api';
import type { WidgetConfig } from '@modules/widgets/api';
import type { CapabilityDef, Room } from '@modules/devices/api';
import { DashboardServiceImpl } from './dashboardService';

type LegacyWidget =
  LegacyDashboardsFile['dashboards'][number]['widgets'][number];

// widgetTypes pulls the devices barrel (→ AsyncStorage) transitively — pin
// the native module as the other dashboard tests do.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

/** Deterministic in-memory repository with injectable save failures. */
class FakeRepository implements DashboardRepository {
  savedPayloads: string[] = [];
  remainingSaveFailures = 0;

  constructor(private stored: string | null = null) {}

  async load(): Promise<
    Result<import('../data/dashboardRepository').LoadedDashboardsFile>
  > {
    if (this.stored === null) {
      return ok({ kind: 'seed' });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.stored);
    } catch {
      return ok({ kind: 'seed' });
    }
    const result = parseDashboardsFile(parsed);
    if (!result.ok) {
      return ok({ kind: 'seed' });
    }
    return ok({
      kind: 'file',
      file: result.value,
      migratedFromLegacy: result.migrated,
    });
  }

  async save(file: DashboardsFile): Promise<Result<void>> {
    if (this.remainingSaveFailures > 0) {
      this.remainingSaveFailures -= 1;
      return err(Errors.unknown('storage down'));
    }
    this.savedPayloads.push(JSON.stringify(file));
    this.stored = JSON.stringify(file);
    return ok(undefined);
  }
}

const CAPABILITIES: readonly CapabilityDef[] = [
  {
    type: 'temperature',
    label: 'Nhiệt độ',
    kind: 'sensor',
    unit: '°C',
    builtin: true,
  },
  {
    type: 'humidity',
    label: 'Độ ẩm',
    kind: 'sensor',
    unit: '%',
    builtin: true,
  },
  { type: 'switch', label: 'Công tắc', kind: 'switch', builtin: true },
];

const ROOMS: readonly Room[] = [
  { id: 'room-living', name: 'Phòng khách', order: 0 },
  { id: 'room-bedroom', name: 'Phòng ngủ', order: 1 },
  { id: 'room-kitchen', name: 'Bếp', order: 2 },
];

function makeService(options?: {
  stored?: string | null;
  roomExists?: (roomId: string) => boolean;
  getRooms?: () => readonly Room[];
  getDeviceRoom?: (deviceId: string) => string | undefined;
}) {
  const clock = new FakeClock();
  const repository = new FakeRepository(options?.stored ?? null);
  const bus = new InMemoryEventBus(createLogger('test'));
  const service = new DashboardServiceImpl({
    repository,
    registry: createDefaultRegistry(),
    bus,
    logger: createLogger('test'),
    clock,
    roomExists:
      options?.roomExists ?? (id => ROOMS.some(room => room.id === id)),
    getRooms: options?.getRooms ?? (() => ROOMS),
    getCapabilities: () => CAPABILITIES,
    getDeviceRoom:
      options?.getDeviceRoom ??
      (deviceId => {
        if (
          deviceId.startsWith('sensor-living') ||
          deviceId.startsWith('relay-living') ||
          // The seed bindings live in Phòng khách.
          ['sensor-temp-01', 'sensor-hum-01', 'relay-1', 'relay-2'].includes(
            deviceId,
          )
        ) {
          return 'room-living';
        }
        if (
          deviceId.startsWith('sensor-bedroom') ||
          deviceId.startsWith('relay-bedroom')
        ) {
          return 'room-bedroom';
        }
        return undefined;
      }),
  });
  // Start the clock at a non-zero instant so `updatedAt` stamps are
  // distinguishable from the 0 sentinel.
  clock.advance(1000);
  return { bus, clock, repository, service };
}

/** A minimal valid widget factory for current-file fixtures. */
function widget(
  id: string,
  roomId?: string,
  overrides: Partial<WidgetConfig> = {},
): WidgetConfig {
  return {
    id,
    type: 'sensor-value',
    roomId,
    binding: { deviceId: `sensor-living-${id}`, capability: 'temperature' },
    layout: { x: 0, y: 0, width: 1, height: 1 },
    ...overrides,
  };
}

describe('load: seed, stamping, idempotence, storage', () => {
  it('seeds one Template on first run, stamps updatedAt and persists once', async () => {
    const { repository, service } = makeService();
    await service.load();
    expect(service.getTemplates()).toHaveLength(1);
    expect(service.getActiveTemplateId()).toBe('main');
    expect(service.getActiveTemplate().updatedAt).toBe(0 + 1000);
    // The seed template owns one room reference (Phòng khách) with 4 widgets.
    const rooms = service.getActiveTemplate().rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.roomId).toBe('room-living');
    expect(rooms[0]!.order).toBe(0);
    expect(rooms[0]!.widgets.map(w => w.id)).toEqual([
      'w-temp',
      'w-hum',
      'w-light',
      'w-fan',
    ]);
    expect(repository.savedPayloads).toHaveLength(1);
  });

  it('loads a valid current file WITHOUT writing (idempotent reload)', async () => {
    const file = defaultDashboardsFile();
    file.templates[0]!.updatedAt = 1234;
    const { repository, service } = makeService({
      stored: JSON.stringify(file),
    });
    await service.load();
    expect(service.getTemplates()[0]!.updatedAt).toBe(1234);
    expect(repository.savedPayloads).toHaveLength(0);

    // Second load: still no write (idempotent).
    await service.load();
    expect(repository.savedPayloads).toHaveLength(0);
  });

  it('stamps a zero updatedAt (seed/migration) exactly once', async () => {
    const file = defaultDashboardsFile(); // updatedAt: 0
    const { repository, service } = makeService({
      stored: JSON.stringify(file),
    });
    await service.load();
    expect(service.getActiveTemplate().updatedAt).toBe(1000);
    expect(repository.savedPayloads).toHaveLength(1);
    await service.load();
    expect(repository.savedPayloads).toHaveLength(1); // no re-write
  });

  it('maps a storage load failure to a Result error', async () => {
    const failing: DashboardRepository = {
      load: async () => err(Errors.unknown('disk error')),
      save: async () => ok(undefined),
    };
    const bus = new InMemoryEventBus(createLogger('test'));
    const broken = new DashboardServiceImpl({
      repository: failing,
      registry: createDefaultRegistry(),
      bus,
      logger: createLogger('test'),
      clock: new FakeClock(),
    });
    const result = await broken.load();
    expect(result.ok).toBe(false);
  });

  it('migrates a LEGACY file: registry-ordered references, stamped, persisted once', async () => {
    const legacy: LegacyDashboardsFile = {
      dashboards: [
        {
          id: 'dash-legacy',
          name: 'Cũ',
          widgets: [
            widget('w-k', 'room-kitchen', {
              binding: {
                deviceId: 'sensor-living-x',
                capability: 'temperature',
              },
            }),
            widget('w-l', 'room-living'),
          ],
        },
      ],
      activeId: 'dash-legacy',
      activeRoomId: 'room-living',
    };
    const { repository, service } = makeService({
      stored: JSON.stringify(legacy),
    });
    await service.load();
    const template = service.findTemplate('dash-legacy')!;
    expect(template).toBeDefined();
    expect(template.name).toBe('Cũ');
    // Ordered references follow the devices registry order.
    expect(template.rooms.map(r => r.roomId)).toEqual([
      'room-living',
      'room-kitchen',
    ]);
    expect(template.rooms.map(r => r.order)).toEqual([0, 1]);
    // Widgets preserved (ids/bindings/layouts) inside their rooms.
    expect(template.rooms[0]!.widgets.map(w => w.id)).toEqual(['w-l']);
    expect(template.rooms[1]!.widgets.map(w => w.id)).toEqual(['w-k']);
    expect(template.updatedAt).toBe(1000);
    // The History seam survives.
    expect(service.getActiveRoomId()).toBe('room-living');
    // Persisted exactly once (the migrated snapshot).
    expect(repository.savedPayloads).toHaveLength(1);
    // Idempotent: a reload of the migrated file writes nothing.
    await service.load();
    expect(repository.savedPayloads).toHaveLength(1);
  });

  it('folds legacy roomless widgets into the first reference (roomId mirror)', async () => {
    const legacy: LegacyDashboardsFile = {
      dashboards: [
        {
          id: 'dash-g',
          name: 'G',
          widgets: [
            widget('w-room', 'room-bedroom'),
            { ...widget('w-free'), roomId: undefined } as LegacyWidget,
          ],
        },
      ],
      activeId: 'dash-g',
      activeRoomId: null,
    };
    const { service } = makeService({ stored: JSON.stringify(legacy) });
    await service.load();
    const template = service.findTemplate('dash-g')!;
    expect(template.rooms.map(r => r.roomId)).toEqual(['room-bedroom']);
    const widgets = template.rooms[0]!.widgets;
    expect(widgets.map(w => w.id)).toEqual(['w-room', 'w-free']);
    expect(widgets[1]!.roomId).toBe('room-bedroom');
  });

  it('keeps unknown custom widget types/fields through load + save', async () => {
    const legacy: LegacyDashboardsFile = {
      dashboards: [
        {
          id: 'dash-c',
          name: 'C',
          widgets: [
            {
              id: 'w-vendor',
              type: 'vendor-camera-panel',
              roomId: 'room-living',
              layout: { x: 0, y: 0, width: 2, height: 2 },
              config: { stream: 'rtsp://cam/main' },
              vendorVersion: '2.1.0',
            } as unknown as WidgetConfig,
          ],
        },
      ],
      activeId: 'dash-c',
      activeRoomId: null,
    };
    const { repository, service } = makeService({
      stored: JSON.stringify(legacy),
    });
    await service.load();
    const kept = service.findTemplate('dash-c')!.rooms[0]!.widgets[0]!;
    expect(kept.type).toBe('vendor-camera-panel');
    expect((kept as Record<string, unknown>).config).toEqual({
      stream: 'rtsp://cam/main',
    });
    expect((kept as Record<string, unknown>).vendorVersion).toBe('2.1.0');
    // Persisted snapshot keeps the fields byte-for-byte.
    expect(repository.savedPayloads[0]).toContain('"vendorVersion":"2.1.0"');
    expect(repository.savedPayloads[0]).toContain('vendor-camera-panel');
  });

  it('removes retired built-in types from a CURRENT file (custom types pinned)', async () => {
    const file = defaultDashboardsFile();
    file.templates[0]!.rooms[0]!.widgets.push(
      widget('w-retired', 'room-living', {
        type: 'connection',
        binding: undefined,
      }),
      widget('w-vendor', 'room-living', {
        type: 'vendor-camera-panel',
        binding: undefined,
      }),
    );
    file.templates[0]!.updatedAt = 55;
    const { service } = makeService({ stored: JSON.stringify(file) });
    await service.load();
    const widgets = service.getActiveTemplate().rooms[0]!.widgets;
    expect(widgets.some(w => w.type === 'connection')).toBe(false);
    expect(widgets.some(w => w.type === 'vendor-camera-panel')).toBe(true);
  });

  it('removes the RETIRED room-device-list overview once, idempotently (custom types pinned)', async () => {
    const file = defaultDashboardsFile();
    file.templates[0]!.rooms[0]!.widgets.push(
      widget('w-list', 'room-living', {
        type: 'room-device-list',
        binding: undefined,
      }),
      widget('w-vendor', 'room-living', {
        type: 'vendor-camera-panel',
        binding: undefined,
      }),
    );
    file.templates[0]!.updatedAt = 55;
    const { repository, service } = makeService({
      stored: JSON.stringify(file),
    });
    await service.load();
    const widgets = service.getActiveTemplate().rooms[0]!.widgets;
    expect(widgets.some(w => w.type === 'room-device-list')).toBe(false);
    // The unknown custom type is NEVER erased by the retired cleanup.
    expect(widgets.some(w => w.type === 'vendor-camera-panel')).toBe(true);
    // The approved seed widgets are untouched.
    expect(widgets.some(w => w.id === 'w-temp')).toBe(true);
    // Removed exactly once: the cleanup persisted through the load
    // write-through…
    expect(repository.savedPayloads).toHaveLength(1);
    // …and a second load is a no-op (idempotent, nothing new to write).
    await service.load();
    expect(repository.savedPayloads).toHaveLength(1);
    expect(
      service
        .getActiveTemplate()
        .rooms[0]!.widgets.some(w => w.type === 'room-device-list'),
    ).toBe(false);
  });

  it('deduplicates exact approved placements per room (first wins)', async () => {
    const file = defaultDashboardsFile();
    file.templates[0]!.rooms[0]!.widgets.push(
      widget('w-dup', 'room-living', {
        binding: { deviceId: 'sensor-temp-01', capability: 'temperature' },
        layout: { x: 0, y: 9, width: 1, height: 1 },
      }),
    );
    file.templates[0]!.updatedAt = 55;
    const { service } = makeService({ stored: JSON.stringify(file) });
    await service.load();
    const widgets = service.getActiveTemplate().rooms[0]!.widgets;
    const temps = widgets.filter(
      w =>
        w.type === 'sensor-value' &&
        w.binding?.deviceId === 'sensor-temp-01' &&
        w.binding?.capability === 'temperature',
    );
    expect(temps).toHaveLength(1);
    expect(temps[0]!.id).toBe('w-temp'); // first occurrence wins
  });

  it('keeps an unknown-room reference (never drops placements)', async () => {
    const legacy: LegacyDashboardsFile = {
      dashboards: [
        {
          id: 'dash-u',
          name: 'U',
          widgets: [widget('w-x', 'room-ghost')],
        },
      ],
      activeId: 'dash-u',
      activeRoomId: null,
    };
    const { service } = makeService({ stored: JSON.stringify(legacy) });
    await service.load();
    const rooms = service.findTemplate('dash-u')!.rooms;
    expect(rooms.map(r => r.roomId)).toEqual(['room-ghost']);
    expect(rooms[0]!.widgets.map(w => w.id)).toEqual(['w-x']);
  });
});

describe('Template CRUD', () => {
  let context: ReturnType<typeof makeService>;
  let service: DashboardServiceImpl;
  let repository: FakeRepository;

  beforeEach(async () => {
    context = makeService();
    service = context.service;
    repository = context.repository;
    await service.load();
  });

  it('createTemplate validates the name, becomes active and persists', async () => {
    const empty = await service.createTemplate('   ');
    expect(empty.ok).toBe(false);

    const created = await service.createTemplate('Tầng 2');
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.id).toBe('tpl-1');
      expect(created.value.name).toBe('Tầng 2');
      expect(created.value.rooms).toEqual([]);
      expect(created.value.updatedAt).toBe(1000);
    }
    expect(service.getActiveTemplateId()).toBe('tpl-1');
    expect(repository.savedPayloads).toHaveLength(2); // seed + create
  });

  it('renameTemplate changes the name and bumps updatedAt (others untouched)', async () => {
    await service.createTemplate('A');
    context.clock.advance(500);
    const before = service.findTemplate('main')!;
    const result = await service.renameTemplate('main', 'Nhà chính');
    expect(result.ok).toBe(true);
    const renamed = service.findTemplate('main')!;
    expect(renamed.name).toBe('Nhà chính');
    expect(renamed.updatedAt).toBe(before.updatedAt + 500);
    expect(service.findTemplate('tpl-1')!.updatedAt).toBe(1000);
  });

  it('renameTemplate rejects empty names and unknown ids', async () => {
    expect((await service.renameTemplate('main', ' ')).ok).toBe(false);
    expect((await service.renameTemplate('ghost', 'X')).ok).toBe(false);
  });

  it('duplicateTemplate deep-copies layouts with FRESH ids and shared rooms', async () => {
    context.clock.advance(100);
    const copy = await service.duplicateTemplate('main');
    expect(copy.ok).toBe(true);
    if (!copy.ok) {
      return;
    }
    expect(copy.value.id).toBe('tpl-1');
    expect(copy.value.name).toBe('Trang chủ (bản sao)');
    const source = service.findTemplate('main')!;
    expect(copy.value.rooms.map(r => r.roomId)).toEqual(
      source.rooms.map(r => r.roomId),
    );
    const sourceWidgets = source.rooms[0]!.widgets;
    const copyWidgets = copy.value.rooms[0]!.widgets;
    expect(copyWidgets.map(w => w.id)).not.toEqual(
      sourceWidgets.map(w => w.id),
    );
    expect(copyWidgets.map(w => [w.type, w.binding, { ...w.layout }])).toEqual(
      sourceWidgets.map(w => [w.type, w.binding, { ...w.layout }]),
    );
    // Physical room references are shared (model 1A), widget ids are not.
    expect(copyWidgets.every(w => w.roomId === 'room-living')).toBe(true);
    // Selection unchanged; copy gets its own timestamp (clock +100).
    expect(service.getActiveTemplateId()).toBe('main');
    expect(copy.value.updatedAt).toBe(1100);
  });

  it('later edits to a duplicate never mutate the source Template', async () => {
    const copy = await service.duplicateTemplate('main');
    if (!copy.ok) {
      return;
    }
    await service.renameTemplate(copy.value.id, 'Bản sao riêng');
    await service.removeRoomReference(copy.value.id, 'room-living');
    const source = service.findTemplate('main')!;
    expect(source.name).toBe('Trang chủ');
    expect(source.rooms).toHaveLength(1);
    expect(service.findTemplate(copy.value.id)!.rooms).toHaveLength(0);
  });

  it('deleteTemplate protects the last Template and falls back deterministically', async () => {
    const only = await service.deleteTemplate('main');
    expect(only.ok).toBe(false);

    await service.createTemplate('A'); // tpl-1, becomes active
    await service.createTemplate('B'); // tpl-2, becomes active
    // Delete the ACTIVE template → fallback to the first remaining.
    const result = await service.deleteTemplate('tpl-2');
    expect(result.ok).toBe(true);
    expect(service.getActiveTemplateId()).toBe('main');

    // Delete a NON-active template → active selection unchanged (tpl-3 was
    // created last and became active).
    await service.createTemplate('C'); // tpl-3 (active)
    await service.deleteTemplate('main');
    expect(service.getActiveTemplateId()).toBe('tpl-3');
    expect((await service.deleteTemplate('ghost')).ok).toBe(false);
  });

  it('commit failures are atomic: the file and selection stay unchanged', async () => {
    repository.remainingSaveFailures = 1;
    const before = service.getTemplates();
    const result = await service.createTemplate('Sập');
    expect(result.ok).toBe(false);
    expect(service.getTemplates()).toEqual(before);
    expect(service.getActiveTemplateId()).toBe('main');
    // A retry after storage recovers succeeds.
    const retried = await service.createTemplate('Sập');
    expect(retried.ok).toBe(true);
  });

  it('setActiveTemplate switches selection without touching updatedAt', async () => {
    await service.createTemplate('A');
    context.clock.advance(100);
    const before = service.findTemplate('main')!.updatedAt;
    await service.setActiveTemplate('main');
    expect(service.getActiveTemplateId()).toBe('main');
    expect(service.findTemplate('main')!.updatedAt).toBe(before);
    expect((await service.setActiveTemplate('ghost')).ok).toBe(false);
  });
});

describe('room references', () => {
  let context: ReturnType<typeof makeService>;
  let service: DashboardServiceImpl;

  beforeEach(async () => {
    context = makeService();
    service = context.service;
    await service.load();
  });

  it('addRoomReference appends an empty layout; duplicates and unknown rooms rejected', async () => {
    const okResult = await service.addRoomReference('main', 'room-bedroom');
    expect(okResult.ok).toBe(true);
    const template = service.findTemplate('main')!;
    expect(template.rooms.map(r => r.roomId)).toEqual([
      'room-living',
      'room-bedroom',
    ]);
    expect(template.rooms[1]!.widgets).toEqual([]);
    expect(template.rooms[1]!.order).toBe(1);

    expect((await service.addRoomReference('main', 'room-bedroom')).ok).toBe(
      false,
    );
    expect((await service.addRoomReference('main', 'room-ghost')).ok).toBe(
      false,
    );
    expect((await service.addRoomReference('ghost', 'room-bedroom')).ok).toBe(
      false,
    );
  });

  it('removeRoomReference removes only that reference/layout', async () => {
    await service.createTemplate('T2'); // tpl-1
    await service.addRoomReference('tpl-1', 'room-living');
    const result = await service.removeRoomReference('main', 'room-living');
    expect(result.ok).toBe(true);
    expect(service.findTemplate('main')!.rooms).toEqual([]);
    // The other Template keeps its reference (physical room untouched).
    expect(service.findTemplate('tpl-1')!.rooms[0]!.roomId).toBe('room-living');
    expect((await service.removeRoomReference('main', 'room-living')).ok).toBe(
      false,
    );
  });

  it('removeRoomReference drops the removed room layout with the reference', async () => {
    const template = service.findTemplate('main')!;
    expect(template.rooms[0]!.widgets).toHaveLength(4);
    await service.removeRoomReference('main', 'room-living');
    expect(service.findTemplate('main')!.rooms).toHaveLength(0);
  });

  it('reorderRoomReferences accepts a permutation and rejects anything else', async () => {
    await service.addRoomReference('main', 'room-bedroom');
    await service.addRoomReference('main', 'room-kitchen');
    const template = () => service.findTemplate('main')!;

    const noOp = await service.reorderRoomReferences('main', [
      'room-living',
      'room-bedroom',
      'room-kitchen',
    ]);
    expect(noOp.ok).toBe(true);

    const reorder = await service.reorderRoomReferences('main', [
      'room-kitchen',
      'room-living',
      'room-bedroom',
    ]);
    expect(reorder.ok).toBe(true);
    expect(template().rooms.map(r => r.roomId)).toEqual([
      'room-kitchen',
      'room-living',
      'room-bedroom',
    ]);
    expect(template().rooms.map(r => r.order)).toEqual([0, 1, 2]);

    // Not a permutation: missing room.
    expect(
      (
        await service.reorderRoomReferences('main', [
          'room-kitchen',
          'room-living',
        ])
      ).ok,
    ).toBe(false);
    // Duplicated id.
    expect(
      (
        await service.reorderRoomReferences('main', [
          'room-kitchen',
          'room-kitchen',
          'room-living',
        ])
      ).ok,
    ).toBe(false);
    // Unknown room.
    expect(
      (
        await service.reorderRoomReferences('main', [
          'room-ghost',
          'room-living',
          'room-bedroom',
        ])
      ).ok,
    ).toBe(false);
    // The rejected reorder mutated nothing.
    expect(template().rooms.map(r => r.roomId)).toEqual([
      'room-kitchen',
      'room-living',
      'room-bedroom',
    ]);
  });

  it('duplicateRoomReference copies the layout with fresh widget ids', async () => {
    await service.createTemplate('T2'); // tpl-1
    const result = await service.duplicateRoomReference(
      'main',
      'room-living',
      'tpl-1',
    );
    expect(result.ok).toBe(true);
    const source = service.findTemplate('main')!.rooms[0]!;
    const copy = service.findTemplate('tpl-1')!.rooms[0]!;
    expect(copy.roomId).toBe('room-living');
    expect(copy.widgets.map(w => w.id)).not.toEqual(
      source.widgets.map(w => w.id),
    );
    expect(copy.widgets.map(w => w.type)).toEqual(
      source.widgets.map(w => w.type),
    );
    // Source untouched.
    expect(
      service.findTemplate('main')!.rooms[0]!.widgets.map(w => w.id),
    ).toEqual(source.widgets.map(w => w.id));
  });

  it('duplicateRoomReference rejects same-template and existing memberships', async () => {
    expect(
      (await service.duplicateRoomReference('main', 'room-living', 'main')).ok,
    ).toBe(false);
    await service.createTemplate('T2');
    await service.addRoomReference('tpl-1', 'room-living');
    expect(
      (await service.duplicateRoomReference('main', 'room-living', 'tpl-1')).ok,
    ).toBe(false);
    // The rejected duplicate mutated nothing.
    expect(service.findTemplate('tpl-1')!.rooms[0]!.widgets).toHaveLength(0);
  });
});

describe('widget operations', () => {
  let context: ReturnType<typeof makeService>;
  let service: DashboardServiceImpl;
  let store: ReturnType<DashboardServiceImpl['getStore']>;

  beforeEach(async () => {
    context = makeService();
    service = context.service;
    store = service.getStore();
    await service.load();
  });

  it('addWidget places in a free slot at the first supported size', async () => {
    const result = await service.addWidget('main', 'room-living', {
      type: 'sensor-value',
      binding: { deviceId: 'sensor-living-9', capability: 'temperature' },
      roomId: 'room-living',
    });
    expect(result.ok).toBe(true);
    const added = service
      .findTemplate('main')!
      .rooms[0]!.widgets.find(w => w.binding?.deviceId === 'sensor-living-9')!;
    expect(added.layout).toMatchObject({ x: 0, y: 2, width: 1, height: 1 });
  });

  it('addWidget rejects unknown types, unsupported sizes, cross-room bindings and duplicates', async () => {
    expect(
      (
        await service.addWidget('main', 'room-living', {
          type: 'nope',
          roomId: 'room-living',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await service.addWidget('main', 'room-living', {
          type: 'switch',
          size: '2x2',
        })
      ).ok,
    ).toBe(false);
    // Binding source belongs to another room → rejected by the
    // room-authoritative check.
    expect(
      (
        await service.addWidget('main', 'room-living', {
          type: 'sensor-value',
          binding: {
            deviceId: 'sensor-bedroom-1',
            capability: 'temperature',
          },
          roomId: 'room-living',
        })
      ).ok,
    ).toBe(false);
    // Exact duplicate of the seed temperature card.
    expect(
      (
        await service.addWidget('main', 'room-living', {
          type: 'sensor-value',
          binding: {
            deviceId: 'sensor-temp-01',
            capability: 'temperature',
          },
          roomId: 'room-living',
        })
      ).ok,
    ).toBe(false);
    // Unknown room/template.
    expect(
      (await service.addWidget('main', 'room-ghost', { type: 'switch' })).ok,
    ).toBe(false);
    expect(
      (await service.addWidget('ghost', 'room-living', { type: 'switch' })).ok,
    ).toBe(false);
  });

  it('addWidget in draft mode appends to the draft and does not persist', async () => {
    store.getState().enterEdit('main', 'room-living');
    const result = await service.addWidget('main', 'room-living', {
      type: 'sensor-value',
      binding: { deviceId: 'sensor-living-9', capability: 'temperature' },
      roomId: 'room-living',
    });
    expect(result.ok).toBe(true);
    const draft = store.getState().draftWidgets!;
    expect(draft.some(w => w.binding?.deviceId === 'sensor-living-9')).toBe(
      true,
    );
    // Persisted layout unchanged (no commit for the draft add).
    expect(
      service
        .findTemplate('main')!
        .rooms[0]!.widgets.some(w => w.binding?.deviceId === 'sensor-living-9'),
    ).toBe(false);
  });

  it('applyLayout replaces one room atomically and stamps updatedAt', async () => {
    const template = service.findTemplate('main')!;
    const widgets = template.rooms[0]!.widgets;
    const edited = widgets.map(w =>
      w.id === 'w-temp' ? { ...w, title: 'Nhiệt độ PK' } : w,
    );
    context.clock.advance(250);
    const result = await service.applyLayout('main', 'room-living', edited);
    expect(result.ok).toBe(true);
    const after = service.findTemplate('main')!;
    expect(after.rooms[0]!.widgets.find(w => w.id === 'w-temp')!.title).toBe(
      'Nhiệt độ PK',
    );
    expect(after.updatedAt).toBe(template.updatedAt + 250);
    // Unknown custom fields survive Save.
    const withCustom = [
      ...edited,
      {
        ...widget('w-custom', 'room-living', {
          layout: { x: 0, y: 5, width: 2, height: 2 },
        }),
        type: 'vendor-camera-panel',
        binding: undefined,
        config: { a: 1 },
        vendorVersion: 3,
      } as unknown as WidgetConfig,
    ];
    // Unknown/custom types are preserved verbatim through applyLayout.
    const customResult = await service.applyLayout(
      'main',
      'room-living',
      withCustom,
    );
    expect(customResult.ok).toBe(true);
    const saved = service
      .findTemplate('main')!
      .rooms[0]!.widgets.find(w => w.id === 'w-custom')!;
    expect(saved.type).toBe('vendor-camera-panel');
    expect((saved as Record<string, unknown>).config).toEqual({ a: 1 });
    expect((saved as Record<string, unknown>).vendorVersion).toBe(3);
  });

  it('applyLayout rejects invalid layouts and mutates nothing', async () => {
    const template = service.findTemplate('main')!;
    const widgets = template.rooms[0]!.widgets;

    // Cross-room binding.
    const crossRoom = widgets.map(w =>
      w.id === 'w-temp'
        ? {
            ...w,
            binding: {
              deviceId: 'sensor-bedroom-1',
              capability: 'temperature',
            },
          }
        : w,
    );
    expect(
      (await service.applyLayout('main', 'room-living', crossRoom)).ok,
    ).toBe(false);

    // Duplicate placement.
    const dup = [
      ...widgets,
      widget('w-dup', 'room-living', {
        binding: { deviceId: 'sensor-temp-01', capability: 'temperature' },
        layout: { x: 1, y: 5, width: 1, height: 1 },
      }),
    ];
    expect((await service.applyLayout('main', 'room-living', dup)).ok).toBe(
      false,
    );

    // Overlap.
    const overlap = widgets.map(
      (w): WidgetConfig =>
        w.id === 'w-hum'
          ? { ...w, layout: { x: 0, y: 0, width: 1, height: 1 } }
          : w,
    );
    expect((await service.applyLayout('main', 'room-living', overlap)).ok).toBe(
      false,
    );

    // Wrong-room widget in the list.
    const wrongRoom = [...widgets, widget('w-other', 'room-bedroom')];
    expect(
      (await service.applyLayout('main', 'room-living', wrongRoom)).ok,
    ).toBe(false);

    // Nothing changed.
    expect(service.findTemplate('main')!.rooms[0]!.widgets).toEqual(widgets);
    expect(service.findTemplate('main')!.updatedAt).toBe(template.updatedAt);
  });

  it('duplicateWidgetToRoom copies with a fresh id and a compatible binding', async () => {
    await service.addRoomReference('main', 'room-bedroom');
    // A bedroom-bound sensor card cannot be copied into the living room's
    // layout... and a living-room-bound card CAN be copied into the bedroom
    // reference only when its binding matches that room. Build a
    // bedroom-compatible card first via the bedroom reference.
    const bedroomTemplate = service.findTemplate('main')!;
    const bedroomRef = bedroomTemplate.rooms.find(
      r => r.roomId === 'room-bedroom',
    )!;
    expect(bedroomRef).toBeDefined();

    // Seed a compatible source in the bedroom reference via applyLayout.
    const source = widget('w-bed-src', 'room-bedroom', {
      binding: { deviceId: 'sensor-bedroom-1', capability: 'temperature' },
      layout: { x: 0, y: 0, width: 1, height: 1 },
    });
    await service.applyLayout('main', 'room-bedroom', [source]);

    // Copy the living-room temperature card into the bedroom: its binding
    // device belongs to the living room → rejected.
    const living = service.findTemplate('main')!.rooms[0]!;
    const livingTemp = living.widgets.find(w => w.id === 'w-temp')!;
    expect(
      (
        await service.duplicateWidgetToRoom(
          'main',
          'room-living',
          livingTemp.id,
          'room-bedroom',
        )
      ).ok,
    ).toBe(false);

    // Copy the bedroom card into the living room: binding belongs to the
    // bedroom → rejected.
    expect(
      (
        await service.duplicateWidgetToRoom(
          'main',
          'room-bedroom',
          'w-bed-src',
          'room-living',
        )
      ).ok,
    ).toBe(false);

    // An UNBOUND widget (no binding — here an unknown custom type) is
    // compatible with every room: duplicate the bedroom card into the
    // living room with a fresh id.
    const unboundCard: WidgetConfig = {
      ...widget('w-bed-list', 'room-bedroom'),
      type: 'vendor-camera-panel',
      binding: undefined,
      layout: { x: 0, y: 1, width: 2, height: 1 },
    };
    await service.applyLayout('main', 'room-bedroom', [source, unboundCard]);
    const copyResult = await service.duplicateWidgetToRoom(
      'main',
      'room-bedroom',
      'w-bed-list',
      'room-living',
    );
    expect(copyResult.ok).toBe(true);
    const livingWidgets = service.findTemplate('main')!.rooms[0]!.widgets;
    const copied = livingWidgets.find(w => w.type === 'vendor-camera-panel')!;
    expect(copied.roomId).toBe('room-living');
    expect(copied.id).not.toBe('w-bed-list');
    // The source room keeps its placement.
    expect(
      service
        .findTemplate('main')!
        .rooms.find(r => r.roomId === 'room-bedroom')!
        .widgets.some(w => w.id === 'w-bed-list'),
    ).toBe(true);
  });

  it('moveWidgetToRoom validates the destination first, then moves atomically', async () => {
    await service.addRoomReference('main', 'room-bedroom');
    const unbound = {
      ...widget('w-list', 'room-living'),
      type: 'vendor-camera-panel',
      binding: undefined,
      layout: { x: 0, y: 2, width: 2, height: 1 },
    } as WidgetConfig;
    const living = service.findTemplate('main')!.rooms[0]!.widgets;
    await service.applyLayout('main', 'room-living', [...living, unbound]);

    const result = await service.moveWidgetToRoom(
      'main',
      'room-living',
      'w-list',
      'room-bedroom',
    );
    expect(result.ok).toBe(true);
    const template = service.findTemplate('main')!;
    expect(
      template.rooms
        .find(r => r.roomId === 'room-living')!
        .widgets.some(w => w.id === 'w-list'),
    ).toBe(false);
    const moved = template.rooms
      .find(r => r.roomId === 'room-bedroom')!
      .widgets.find(w => w.id === 'w-list')!;
    expect(moved.roomId).toBe('room-bedroom');

    // Incompatible move (living-room binding → bedroom): nothing changes.
    const before = service.findTemplate('main')!;
    expect(
      (
        await service.moveWidgetToRoom(
          'main',
          'room-living',
          'w-temp',
          'room-bedroom',
        )
      ).ok,
    ).toBe(false);
    expect(service.findTemplate('main')!).toEqual(before);
  });
});

describe('cascades (devices ownership)', () => {
  let context: ReturnType<typeof makeService>;
  let service: DashboardServiceImpl;

  beforeEach(async () => {
    context = makeService();
    service = context.service;
    await service.load();
    await service.createTemplate('T2'); // tpl-1
    await service.addRoomReference('tpl-1', 'room-living');
    await service.applyLayout('tpl-1', 'room-living', [
      widget('w-t2-a', 'room-living', {
        binding: { deviceId: 'sensor-temp-01', capability: 'temperature' },
        layout: { x: 0, y: 0, width: 1, height: 1 },
      }),
      widget('w-t2-b', 'room-living', {
        type: 'switch',
        binding: { deviceId: 'relay-living-1', capability: 'switch' },
        layout: { x: 1, y: 0, width: 1, height: 1 },
      }),
    ]);
  });

  it('removeWidgetsForDevice cleans every Template and compacts', async () => {
    const result = await service.removeWidgetsForDevice('sensor-temp-01');
    expect(result.ok).toBe(true);
    expect(
      service
        .findTemplate('main')!
        .rooms[0]!.widgets.some(w => w.binding?.deviceId === 'sensor-temp-01'),
    ).toBe(false);
    expect(
      service
        .findTemplate('tpl-1')!
        .rooms[0]!.widgets.some(w => w.binding?.deviceId === 'sensor-temp-01'),
    ).toBe(false);
    // The sibling relay card survives.
    expect(
      service
        .findTemplate('tpl-1')!
        .rooms[0]!.widgets.some(w => w.id === 'w-t2-b'),
    ).toBe(true);
  });

  it('removeWidgetsForBinding removes only the exact binding', async () => {
    const result = await service.removeWidgetsForBinding(
      'sensor-temp-01',
      'humidity',
    );
    expect(result.ok).toBe(true);
    // w-temp binds temperature, not humidity → untouched.
    expect(
      service
        .findTemplate('main')!
        .rooms[0]!.widgets.some(w => w.id === 'w-temp'),
    ).toBe(true);
  });

  it('migrateWidgetsFromRoom retargets references when devices move', async () => {
    const result = await service.migrateWidgetsFromRoom(
      'room-living',
      'room-bedroom',
    );
    expect(result.ok).toBe(true);
    const template = service.findTemplate('main')!;
    expect(template.rooms.map(r => r.roomId)).toEqual(['room-bedroom']);
    expect(template.rooms[0]!.widgets.map(w => w.id)).toEqual([
      'w-temp',
      'w-hum',
      'w-light',
      'w-fan',
    ]);
    expect(
      template.rooms[0]!.widgets.every(w => w.roomId === 'room-bedroom'),
    ).toBe(true);
    // tpl-1 also referenced room-living → retargeted (keeps its layout).
    expect(service.findTemplate('tpl-1')!.rooms[0]!.roomId).toBe(
      'room-bedroom',
    );
  });

  it('migrateWidgetsFromRoom merges into an existing target reference with relocation', async () => {
    // tpl-1 references room-living; give main a room-bedroom reference too,
    // then migrate living → bedroom: both templates merge into bedroom.
    await service.addRoomReference('main', 'room-bedroom');
    const result = await service.migrateWidgetsFromRoom(
      'room-living',
      'room-bedroom',
    );
    expect(result.ok).toBe(true);
    const template = service.findTemplate('main')!;
    expect(template.rooms.map(r => r.roomId)).toEqual(['room-bedroom']);
    // All six placements survive the merge (seed 4 + relocated).
    expect(template.rooms[0]!.widgets).toHaveLength(4);
  });

  it('migrateWidgetsFromRoom(null) removes the reference (physical room gone)', async () => {
    const result = await service.migrateWidgetsFromRoom('room-living', null);
    expect(result.ok).toBe(true);
    expect(service.findTemplate('main')!.rooms).toEqual([]);
    expect(service.findTemplate('tpl-1')!.rooms).toEqual([]);
  });
});

describe('History room-selection seam', () => {
  it('setActiveRoom validates, is idempotent and never touches updatedAt', async () => {
    const { service, clock } = makeService();
    await service.load();
    const before = service.getActiveTemplate().updatedAt;
    clock.advance(500);
    const invalid = await service.setActiveRoom('room-ghost');
    expect(invalid.ok).toBe(false);
    const valid = await service.setActiveRoom('room-bedroom');
    expect(valid.ok).toBe(true);
    expect(service.getActiveRoomId()).toBe('room-bedroom');
    expect(service.getActiveTemplate().updatedAt).toBe(before);
  });
});

describe('draft cross-room operations (duplicate/move atomicity)', () => {
  let context: ReturnType<typeof makeService>;
  let service: DashboardServiceImpl;
  let store: ReturnType<DashboardServiceImpl['getStore']>;
  let repository: FakeRepository;

  beforeEach(async () => {
    context = makeService();
    service = context.service;
    store = service.getStore();
    repository = context.repository;
    await service.load();
    await service.addRoomReference('main', 'room-bedroom');
    // The movable UNBOUND card (no binding — unknown custom type): the
    // established move fixture (unbound widgets are room-agnostic).
    const living = service.findTemplate('main')!.rooms[0]!.widgets;
    await service.applyLayout('main', 'room-living', [
      ...living,
      {
        ...widget('w-list', 'room-living'),
        type: 'vendor-camera-panel',
        binding: undefined,
        layout: { x: 0, y: 2, width: 2, height: 1 },
      } as WidgetConfig,
    ]);
    store.getState().enterEdit('main', 'room-living');
  });

  it('duplicate in draft mode: draft-only add, NO persistence before Save', async () => {
    const savesBefore = repository.savedPayloads.length;
    const result = await service.duplicateWidgetToRoom(
      'main',
      'room-living',
      'w-list',
      'room-bedroom',
    );
    expect(result.ok).toBe(true);
    // The draft captured the destination add (fresh id, room mirror).
    const draft = store.getState().draftWidgets!;
    const copy = draft.find(w => w.roomId === 'room-bedroom');
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe('w-list');
    expect(copy!.id.startsWith('w-')).toBe(true);
    // Nothing was persisted, and the source room's draft slice is intact.
    expect(repository.savedPayloads).toHaveLength(savesBefore);
    expect(
      service
        .findTemplate('main')!
        .rooms.find(r => r.roomId === 'room-living')!
        .widgets.some(w => w.id === 'w-list'),
    ).toBe(true);
    expect(
      service
        .findTemplate('main')!
        .rooms.find(r => r.roomId === 'room-bedroom')!.widgets,
    ).toHaveLength(0);
  });

  it('move in draft mode: source removal + destination add in the draft, NO persistence', async () => {
    const savesBefore = repository.savedPayloads.length;
    const result = await service.moveWidgetToRoom(
      'main',
      'room-living',
      'w-list',
      'room-bedroom',
    );
    expect(result.ok).toBe(true);
    const draft = store.getState().draftWidgets!;
    expect(draft.some(w => w.id === 'w-list')).toBe(true);
    expect(draft.find(w => w.id === 'w-list')!.roomId === 'room-bedroom').toBe(
      true,
    );
    // The source widget left the edited room's draft slice (a later Save
    // can never re-apply it as a duplicate).
    expect(
      draft.filter(w => w.roomId === 'room-living' && w.id === 'w-list'),
    ).toHaveLength(0);
    expect(repository.savedPayloads).toHaveLength(savesBefore);
  });

  it('Cancel discards the draft duplicate/move (nothing was ever persisted)', async () => {
    const savesBefore = repository.savedPayloads.length;
    await service.duplicateWidgetToRoom(
      'main',
      'room-living',
      'w-list',
      'room-bedroom',
    );
    await service.moveWidgetToRoom(
      'main',
      'room-living',
      'w-list',
      'room-bedroom',
    );
    store.getState().cancelEdit();
    expect(store.getState().editMode).toBe(false);
    expect(store.getState().draftWidgets).toBeNull();
    // The persisted Template never saw any of it.
    const template = service.findTemplate('main')!;
    expect(
      template.rooms.find(r => r.roomId === 'room-bedroom')!.widgets,
    ).toHaveLength(0);
    expect(
      template.rooms
        .find(r => r.roomId === 'room-living')!
        .widgets.some(w => w.id === 'w-list'),
    ).toBe(true);
    expect(repository.savedPayloads).toHaveLength(savesBefore);
  });

  it('Save (applyTemplateLayouts) commits the draft end-state atomically (move)', async () => {
    const before = service.findTemplate('main')!.updatedAt;
    context.clock.advance(300);
    await service.moveWidgetToRoom(
      'main',
      'room-living',
      'w-list',
      'room-bedroom',
    );
    // Save = the route's seam: group the FULL draft by room and commit once.
    const draft = store.getState().draftWidgets!;
    const layouts = service.findTemplate('main')!.rooms.map(room => ({
      roomId: room.roomId,
      widgets: draft.filter(w => w.roomId === room.roomId),
    }));
    const result = await service.applyTemplateLayouts('main', layouts);
    expect(result.ok).toBe(true);
    const template = service.findTemplate('main')!;
    // Source removed exactly once, destination holds the moved placement.
    expect(
      template.rooms
        .find(r => r.roomId === 'room-living')!
        .widgets.some(w => w.id === 'w-list'),
    ).toBe(false);
    const bedroom = template.rooms.find(
      r => r.roomId === 'room-bedroom',
    )!.widgets;
    expect(bedroom).toHaveLength(1);
    expect(bedroom[0]!.id).toBe('w-list');
    expect(bedroom[0]!.roomId).toBe('room-bedroom');
    expect(template.updatedAt).toBe(before + 300);
    store.getState().cancelEdit();
  });

  it('Save (applyTemplateLayouts) commits the draft end-state atomically (duplicate)', async () => {
    await service.duplicateWidgetToRoom(
      'main',
      'room-living',
      'w-list',
      'room-bedroom',
    );
    const draft = store.getState().draftWidgets!;
    const layouts = service.findTemplate('main')!.rooms.map(room => ({
      roomId: room.roomId,
      widgets: draft.filter(w => w.roomId === room.roomId),
    }));
    const result = await service.applyTemplateLayouts('main', layouts);
    expect(result.ok).toBe(true);
    const template = service.findTemplate('main')!;
    // The source stays; the destination holds only the FRESH copy.
    expect(
      template.rooms
        .find(r => r.roomId === 'room-living')!
        .widgets.some(w => w.id === 'w-list'),
    ).toBe(true);
    const bedroom = template.rooms.find(
      r => r.roomId === 'room-bedroom',
    )!.widgets;
    expect(bedroom).toHaveLength(1);
    expect(bedroom[0]!.id).not.toBe('w-list');
    expect(bedroom[0]!.type).toBe('vendor-camera-panel');
    store.getState().cancelEdit();
  });

  it('an invalid draft destination mutates neither draft nor persistence', async () => {
    const draftBefore = store.getState().draftWidgets!;
    const savesBefore = repository.savedPayloads.length;
    // A living-room-bound sensor can never live in the bedroom.
    const result = await service.moveWidgetToRoom(
      'main',
      'room-living',
      'w-temp',
      'room-bedroom',
    );
    expect(result.ok).toBe(false);
    expect(store.getState().draftWidgets).toEqual(draftBefore);
    expect(repository.savedPayloads).toHaveLength(savesBefore);
  });

  it('a stale draft (different Template scope) is rejected by the service draft seam', async () => {
    // The draft is scoped to 'main'; a call for another Template must take
    // the PERSISTED path semantics — not silently read the stale draft.
    await service.createTemplate('T2'); // tpl-1 (active)
    await service.addRoomReference('tpl-1', 'room-living');
    // The editor draft is still open for 'main' — a tpl-1 operation does
    // not see it (draftActive requires the same Template scope).
    const result = await service.duplicateWidgetToRoom(
      'tpl-1',
      'room-living',
      'w-none',
      'room-living',
    );
    expect(result.ok).toBe(false);
  });
});

describe('applyTemplateLayouts (atomic multi-room commit)', () => {
  let context: ReturnType<typeof makeService>;
  let service: DashboardServiceImpl;
  let repository: FakeRepository;

  beforeEach(async () => {
    context = makeService();
    service = context.service;
    repository = context.repository;
    await service.load();
    await service.addRoomReference('main', 'room-bedroom');
  });

  it('replaces several rooms in ONE commit with a single updatedAt touch', async () => {
    const before = service.findTemplate('main')!.updatedAt;
    context.clock.advance(400);
    const template = service.findTemplate('main')!;
    const living = template.rooms.find(
      r => r.roomId === 'room-living',
    )!.widgets;
    const result = await service.applyTemplateLayouts('main', [
      {
        roomId: 'room-living',
        widgets: living.filter(w => w.id !== 'w-temp'),
      },
      {
        roomId: 'room-bedroom',
        widgets: [
          widget('w-b1', 'room-bedroom', {
            binding: { deviceId: 'sensor-bedroom-1', capability: 'humidity' },
          }),
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    const after = service.findTemplate('main')!;
    expect(
      after.rooms
        .find(r => r.roomId === 'room-living')!
        .widgets.some(w => w.id === 'w-temp'),
    ).toBe(false);
    expect(
      after.rooms
        .find(r => r.roomId === 'room-bedroom')!
        .widgets.map(w => w.id),
    ).toEqual(['w-b1']);
    expect(after.updatedAt).toBe(before + 400);
    expect(repository.savedPayloads).toHaveLength(3); // seed + addRoom + commit
  });

  it('rejects unknown rooms, duplicate roomIds and invalid layouts (nothing persisted)', async () => {
    const before = service.findTemplate('main')!;
    const savesBefore = repository.savedPayloads.length;
    const living = before.rooms.find(r => r.roomId === 'room-living')!.widgets;
    expect(
      (
        await service.applyTemplateLayouts('main', [
          { roomId: 'room-ghost', widgets: [] },
        ])
      ).ok,
    ).toBe(false);
    expect(
      (
        await service.applyTemplateLayouts('main', [
          { roomId: 'room-living', widgets: living },
          { roomId: 'room-living', widgets: [] },
        ])
      ).ok,
    ).toBe(false);
    expect(
      (
        await service.applyTemplateLayouts('main', [
          {
            roomId: 'room-living',
            widgets: [
              ...living,
              widget('w-x', 'room-living', {
                layout: { x: 0, y: 0, width: 1, height: 1 },
              }),
            ],
          },
        ])
      ).ok,
    ).toBe(false); // overlaps w-temp at (0,0)
    expect(service.findTemplate('main')!).toEqual(before);
    expect(repository.savedPayloads).toHaveLength(savesBefore);
  });
});

describe('legacy migration finalization (registry-aware)', () => {
  it('replaces the all-roomless sentinel with the FIRST registry room (widgets visible)', async () => {
    const legacy: LegacyDashboardsFile = {
      dashboards: [
        {
          id: 'dash-free',
          name: 'Free',
          widgets: [{ ...widget('w-free'), roomId: undefined } as LegacyWidget],
        },
      ],
      activeId: 'dash-free',
      activeRoomId: null,
    };
    const { service, repository } = makeService({
      stored: JSON.stringify(legacy),
    });
    await service.load();
    const template = service.findTemplate('dash-free')!;
    // Registry order: room-living (order 0) wins; the sentinel is gone.
    expect(template.rooms.map(r => r.roomId)).toEqual(['room-living']);
    expect(template.rooms[0]!.widgets.map(w => w.id)).toEqual(['w-free']);
    expect(template.rooms[0]!.widgets[0]!.roomId).toBe('room-living');
    // The room strip of the view can resolve it (no dangling reference).
    expect(
      template.rooms.every(r => ROOMS.some(room => room.id === r.roomId)),
    ).toBe(true);
    // Persisted once, and the persisted snapshot has no sentinel.
    expect(repository.savedPayloads).toHaveLength(1);
    expect(repository.savedPayloads[0]).not.toContain('__global__');
  });

  it('merges the sentinel into the existing first-room reference', async () => {
    const legacy: LegacyDashboardsFile = {
      dashboards: [
        {
          id: 'dash-mix',
          name: 'Mix',
          widgets: [
            widget('w-roomed', 'room-living'),
            { ...widget('w-free'), roomId: undefined } as LegacyWidget,
          ],
        },
      ],
      activeId: 'dash-mix',
      activeRoomId: null,
    };
    const { service } = makeService({ stored: JSON.stringify(legacy) });
    await service.load();
    const template = service.findTemplate('dash-mix')!;
    expect(template.rooms.map(r => r.roomId)).toEqual(['room-living']);
    // The roomless placement joined the host reference (appended last,
    // mirror adopted) — one reference, both widgets, no duplicates.
    expect(template.rooms[0]!.widgets.map(w => w.id)).toEqual([
      'w-roomed',
      'w-free',
    ]);
    expect(template.rooms[0]!.widgets[1]!.roomId).toBe('room-living');
  });

  it('keeps the sentinel when NO physical room exists (never drops widgets)', async () => {
    const legacy: LegacyDashboardsFile = {
      dashboards: [
        {
          id: 'dash-orphan',
          name: 'Orphan',
          widgets: [{ ...widget('w-free'), roomId: undefined } as LegacyWidget],
        },
      ],
      activeId: 'dash-orphan',
      activeRoomId: null,
    };
    const { service } = makeService({
      stored: JSON.stringify(legacy),
      getRooms: () => [],
      roomExists: () => false,
    });
    await service.load();
    const template = service.findTemplate('dash-orphan')!;
    expect(template.rooms.map(r => r.roomId)).toEqual(['__global__']);
    expect(template.rooms[0]!.widgets.map(w => w.id)).toEqual(['w-free']);
  });

  it('retains the legacy active room as an EMPTY reference when it had no widgets', async () => {
    const legacy: LegacyDashboardsFile = {
      dashboards: [
        {
          id: 'dash-active',
          name: 'Active',
          widgets: [widget('w-l', 'room-living')],
        },
      ],
      activeId: 'dash-active',
      activeRoomId: 'room-bedroom',
    };
    const { service } = makeService({ stored: JSON.stringify(legacy) });
    await service.load();
    const template = service.findTemplate('dash-active')!;
    // Registry-ordered references + the retained empty active selection.
    expect(template.rooms.map(r => r.roomId)).toEqual([
      'room-living',
      'room-bedroom',
    ]);
    expect(
      template.rooms.find(r => r.roomId === 'room-bedroom')!.widgets,
    ).toEqual([]);
  });

  it('retained room lands at its REGISTRY position (before widget rooms) + idempotent reload', async () => {
    // Legacy widgets ONLY in room-kitchen (registry order 2); the old
    // active selection is room-living (registry order 0). The retained
    // empty reference must sort BEFORE the widget-bearing room — appending
    // it at the end produced [kitchen, living], contradicting AC9.
    const legacy: LegacyDashboardsFile = {
      dashboards: [
        {
          id: 'dash-order',
          name: 'Order',
          widgets: [widget('w-k', 'room-kitchen')],
        },
      ],
      activeId: 'dash-order',
      activeRoomId: 'room-living',
    };
    const { repository, service } = makeService({
      stored: JSON.stringify(legacy),
    });
    await service.load();
    const template = service.findTemplate('dash-order')!;
    // Registry order across ALL retained references: living (0) first.
    expect(template.rooms.map(r => r.roomId)).toEqual([
      'room-living',
      'room-kitchen',
    ]);
    expect(template.rooms.map(r => r.order)).toEqual([0, 1]);
    expect(template.rooms[0]!.widgets).toEqual([]);
    expect(template.rooms[1]!.widgets.map(w => w.id)).toEqual(['w-k']);
    // Persisted once; the reload writes nothing and the order is stable.
    expect(repository.savedPayloads).toHaveLength(1);
    await service.load();
    expect(repository.savedPayloads).toHaveLength(1);
    expect(
      service.findTemplate('dash-order')!.rooms.map(r => r.roomId),
    ).toEqual(['room-living', 'room-kitchen']);
  });

  it('write-through: in-memory cleanups of a CURRENT snapshot persist once, reload is a no-op', async () => {
    const file = defaultDashboardsFile();
    file.templates[0]!.rooms[0]!.widgets.push(
      widget('w-retired', 'room-living', {
        type: 'connection',
        binding: undefined,
      }),
    );
    file.templates[0]!.updatedAt = 55;
    const { repository, service } = makeService({
      stored: JSON.stringify(file),
    });
    await service.load();
    const widgets = service.getActiveTemplate().rooms[0]!.widgets;
    expect(widgets.some(w => w.type === 'connection')).toBe(false);
    // The cleanup wrote through exactly once…
    expect(repository.savedPayloads).toHaveLength(1);
    // …and the second load of the persisted snapshot writes nothing.
    await service.load();
    expect(repository.savedPayloads).toHaveLength(1);
  });

  it('unaffected Templates keep their updatedAt after a device cascade', async () => {
    const { service, clock } = makeService();
    await service.load();
    await service.createTemplate('T2'); // tpl-1 (active)
    await service.addRoomReference('tpl-1', 'room-living');
    await service.applyLayout('tpl-1', 'room-living', [
      widget('w-t2-a', 'room-living', {
        binding: { deviceId: 'sensor-temp-01', capability: 'temperature' },
        layout: { x: 0, y: 0, width: 1, height: 1 },
      }),
      widget('w-t2-b', 'room-living', {
        type: 'switch',
        binding: { deviceId: 'relay-living-1', capability: 'switch' },
        layout: { x: 1, y: 0, width: 1, height: 1 },
      }),
    ]);
    await service.createTemplate('T3'); // tpl-2 — UNAFFECTED device set
    await service.addRoomReference('tpl-2', 'room-bedroom');
    await service.applyLayout('tpl-2', 'room-bedroom', [
      widget('w-t3-a', 'room-bedroom', {
        binding: { deviceId: 'sensor-bedroom-1', capability: 'humidity' },
        layout: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ]);
    const mainBefore = service.findTemplate('main')!.updatedAt;
    const t2Before = service.findTemplate('tpl-1')!.updatedAt;
    const t3Before = service.findTemplate('tpl-2')!.updatedAt;
    clock.advance(700);
    await service.removeWidgetsForDevice('sensor-temp-01');
    // main + tpl-1 owned sensor-temp-01 widgets → touched; tpl-2 untouched.
    expect(service.findTemplate('main')!.updatedAt).toBe(mainBefore + 700);
    expect(service.findTemplate('tpl-1')!.updatedAt).toBe(t2Before + 700);
    expect(service.findTemplate('tpl-2')!.updatedAt).toBe(t3Before);
    // Same contract for the binding-level cascade: tpl-2 owns the removed
    // metric (touched), main does not.
    clock.advance(100);
    await service.removeWidgetsForBinding('sensor-bedroom-1', 'humidity');
    expect(service.findTemplate('tpl-2')!.updatedAt).toBe(t3Before + 800);
    expect(service.findTemplate('main')!.updatedAt).toBe(mainBefore + 700);
  });
});

describe('swapDraftBindings through the service store (registry+catalog guards)', () => {
  let context: ReturnType<typeof makeService>;
  let service: DashboardServiceImpl;
  let store: ReturnType<DashboardServiceImpl['getStore']>;

  beforeEach(async () => {
    context = makeService();
    service = context.service;
    store = service.getStore();
    await service.load();
    store.getState().enterEdit('main', 'room-living');
  });

  it('a same-kind swap works and the atomic Save still accepts the draft', async () => {
    // w-temp (temperature) ↔ w-hum (humidity): both sensor-value.
    expect(store.getState().swapDraftBindings('w-temp', 'w-hum')).toBe(true);
    const draft = store.getState().draftWidgets!;
    expect(draft.find(w => w.id === 'w-temp')!.binding).toEqual({
      deviceId: 'sensor-hum-01',
      capability: 'humidity',
    });
    expect(draft.find(w => w.id === 'w-hum')!.binding).toEqual({
      deviceId: 'sensor-temp-01',
      capability: 'temperature',
    });
    // Uniqueness stays authoritative and SATISFIED → Save succeeds.
    const layouts = service.findTemplate('main')!.rooms.map(room => ({
      roomId: room.roomId,
      widgets: draft.filter(w => w.roomId === room.roomId),
    }));
    const result = await service.applyTemplateLayouts('main', layouts);
    expect(result.ok).toBe(true);
  });

  it('a kind-INCOMPATIBLE swap is rejected by the registry+catalog guard', () => {
    // w-temp (sensor-value) ↔ w-light (switch): the sensor cannot receive
    // a switch source — rejected BEFORE the draft mutates.
    const before = store.getState().draftWidgets;
    expect(store.getState().swapDraftBindings('w-temp', 'w-light')).toBe(false);
    expect(store.getState().draftWidgets).toBe(before);
  });

  it('a cross-room swap is rejected by the room-scoped uniqueness class', async () => {
    await service.addRoomReference('main', 'room-bedroom');
    // Give the bedroom reference a sensor widget so BOTH ids exist in the
    // draft (the rejection must come from the ROOM check, not the id
    // lookup).
    const bedroomSource = widget('w-bed-temp', 'room-bedroom', {
      binding: { deviceId: 'sensor-bedroom-1', capability: 'temperature' },
      layout: { x: 0, y: 0, width: 1, height: 1 },
    });
    await service.applyLayout('main', 'room-bedroom', [bedroomSource]);
    store.getState().enterEdit('main', 'room-living');
    const before = store.getState().draftWidgets;
    expect(store.getState().swapDraftBindings('w-temp', 'w-bed-temp')).toBe(
      false,
    );
    expect(store.getState().draftWidgets).toBe(before);
  });
});
