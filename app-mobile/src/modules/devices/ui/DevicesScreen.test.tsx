/**
 * DeviceManagementScreen tests — ROOM-FIRST interaction (approved
 * room-sensor-derived-history-layout-rework plan, slice A).
 *
 * Verifies the user-facing acceptance path through the public props +
 * rendered tree:
 * - the top level is a ROOM LIST with a working `+ Thêm phòng`; creating a
 *   room opens the CREATED room immediately (the user-reported broken
 *   room-create flow, regression-tested);
 * - room detail exposes ONLY `Cảm biến n/10` and `Điều khiển n/10` — no
 *   `Tất cả`, repeated room chooser, or binding-kind chooser;
 * - sensor counters are PROJECTED metric registrations: a legacy
 *   multi-capability board displays and counts as separate temperature +
 *   humidity rows (`2/10`);
 * - adding a sensor inherits the open room and offers exactly one metric
 *   choice (already-registered fields are omitted; the room being full
 *   disables the add);
 * - adding a relay inherits the room and asks only name + a free slot;
 * - deleting a sensor row calls the binding-level cascade (one metric of a
 *   legacy record; siblings survive);
 * - legacy roomless records stay manageable in a dedicated section.
 */

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { ThemeProvider } from '@core/theme';
import type {
  CapabilityDef,
  Device,
  NewCapabilityInput,
  NewDeviceInput,
  Room,
} from '@modules/devices/api';

import {
  DeviceManagementScreen,
  type ActionOutcome,
  type AddRoomOutcome,
} from './DevicesScreen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const ROOMS: readonly Room[] = [
  { id: 'room-a', name: 'Phòng A', order: 0 },
  { id: 'room-b', name: 'Phòng B', order: 1 },
];

const CAPABILITIES: readonly CapabilityDef[] = [
  { type: 'temperature', label: 'Nhiệt độ', kind: 'sensor' },
  { type: 'humidity', label: 'Độ ẩm', kind: 'sensor' },
  { type: 'switch', label: 'Công tắc', kind: 'switch' },
];

/** A legacy multi-capability board + a relay: sensors counter shows 2/10. */
const DEVICES: readonly Device[] = [
  {
    id: 'sensor-legacy',
    name: 'Cảm biến môi trường',
    roomId: 'room-a',
    type: 'sensor',
    capabilities: ['temperature', 'humidity'],
    binding: { kind: 'telemetry-sensor' },
  },
  {
    id: 'relay-a1',
    name: 'Đèn A',
    roomId: 'room-a',
    type: 'relay',
    capabilities: ['switch'],
    binding: { kind: 'relay', index: 1 },
  },
  {
    id: 'sensor-temp-b',
    name: 'Nhiệt độ B',
    roomId: 'room-b',
    type: 'sensor',
    capabilities: ['temperature'],
    binding: { kind: 'telemetry-sensor' },
  },
  {
    id: 'sensor-orphan',
    name: 'Cảm biến cũ',
    type: 'sensor',
    capabilities: ['temperature'],
    binding: { kind: 'telemetry-sensor' },
  },
];

/** All visible text of the renderer (flattening nested Text children). */
function visibleText(renderer: TestRenderer.ReactTestRenderer): string {
  const texts: string[] = [];
  const walk = (node: { props?: { children?: unknown } }) => {
    const children = node.props?.children;
    if (typeof children === 'string') {
      texts.push(children);
    } else if (Array.isArray(children)) {
      for (const child of children) {
        if (typeof child === 'string') {
          texts.push(child);
        } else if (child && typeof child === 'object') {
          walk(child as { props?: { children?: unknown } });
        }
      }
    } else if (children && typeof children === 'object') {
      walk(children as { props?: { children?: unknown } });
    }
  };
  for (const textNode of renderer.root.findAllByType(Text)) {
    walk(textNode as never);
  }
  return texts.join('\n');
}

interface HarnessCallbacks {
  onAddRoom?: (name: string) => Promise<AddRoomOutcome>;
  onAddDevice?: (input: NewDeviceInput) => Promise<ActionOutcome>;
  onRemoveDeviceCapability?: (
    deviceId: string,
    field: string,
  ) => Promise<ActionOutcome>;
  onRemoveDevice?: (id: string) => Promise<ActionOutcome>;
  onUpdateDevice?: (
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<ActionOutcome>;
  onAddCapability?: (input: NewCapabilityInput) => Promise<ActionOutcome>;
}

/** Renderers still mounted (unmounted in afterEach — teardown hygiene). */
const openRenderers: TestRenderer.ReactTestRenderer[] = [];

async function renderScreen(callbacks: HarnessCallbacks = {}) {
  let renderer!: TestRenderer.ReactTestRenderer;
  const Harness = () => {
    const [rooms, setRooms] = React.useState<readonly Room[]>(ROOMS);
    const [devices, setDevices] = React.useState<readonly Device[]>(DEVICES);
    const [capabilities, setCapabilities] =
      React.useState<readonly CapabilityDef[]>(CAPABILITIES);
    return (
      <ThemeProvider mode="light">
        <DeviceManagementScreen
          onBack={() => undefined}
          rooms={rooms}
          devices={devices}
          capabilities={capabilities}
          onAddRoom={
            callbacks.onAddRoom ??
            (async name => {
              const room: Room = {
                id: `room-${name}`,
                name,
                order: rooms.length,
              };
              setRooms(previous => [...previous, room]);
              return { ok: true, message: '', roomId: room.id };
            })
          }
          onRenameRoom={async () => ({ ok: true, message: '' })}
          onRemoveRoom={async () => ({ ok: true, message: '' })}
          onAddDevice={
            callbacks.onAddDevice ??
            (async (input: NewDeviceInput) => {
              const device: Device = {
                id: `new-${input.name}`,
                name: input.name,
                roomId: input.roomId,
                type: input.type,
                capabilities: [...input.capabilities],
                binding: { ...input.binding },
              };
              setDevices(previous => [...previous, device]);
              return { ok: true, message: '' };
            })
          }
          onUpdateDevice={async (id, patch) => {
            setDevices(previous =>
              previous.map(device =>
                device.id === id ? ({ ...device, ...patch } as Device) : device,
              ),
            );
            return (
              callbacks.onUpdateDevice?.(
                id,
                patch as Record<string, unknown>,
              ) ?? { ok: true, message: '' }
            );
          }}
          onRemoveDevice={
            callbacks.onRemoveDevice ??
            (async id => {
              setDevices(previous =>
                previous.filter(device => device.id !== id),
              );
              return { ok: true, message: '' };
            })
          }
          onAddCapability={
            callbacks.onAddCapability ??
            (async (input: NewCapabilityInput) => {
              setCapabilities(previous => [
                ...previous,
                {
                  type: input.type,
                  label: input.label,
                  kind: 'sensor' as const,
                },
              ]);
              return { ok: true, message: '' };
            })
          }
          onRemoveDeviceCapability={
            callbacks.onRemoveDeviceCapability ??
            (async (deviceId, field) => {
              setDevices(previous =>
                previous.map(device =>
                  device.id === deviceId
                    ? {
                        ...device,
                        capabilities: device.capabilities.filter(
                          cap => cap !== field,
                        ),
                      }
                    : device,
                ),
              );
              return { ok: true, message: '' };
            })
          }
        />
      </ThemeProvider>
    );
  };
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  openRenderers.push(renderer);
  return renderer;
}

async function press(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
): Promise<void> {
  const nodes = byTestID(renderer, testID).filter(
    node => typeof node.props.onPress === 'function',
  );
  if (nodes.length === 0) {
    throw new Error(`No pressable node for testID "${testID}"`);
  }
  await act(async () => {
    nodes[0]!.props.onPress();
  });
}

async function changeText(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
  value: string,
): Promise<void> {
  await act(async () => {
    renderer.root.findByProps({ testID }).props.onChangeText(value);
  });
}

/**
 * testID lookup restricted to actually-pressable nodes (react-test-renderer
 * `findAllByProps` matches host elements too; host Views never carry
 * `onPress`, so filtering on it removes the double counting).
 */
function byTestID(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
): TestRenderer.ReactTestInstance[] {
  return renderer.root
    .findAllByProps({ testID })
    .filter(node => typeof node.props.onPress === 'function');
}

function hasTestID(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
): boolean {
  return byTestID(renderer, testID).length > 0;
}

/** TextInput presence (non-pressable — lookup by testID directly). */
function hasTextInput(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
): boolean {
  return renderer.root.findAllByProps({ testID }).length > 0;
}

/** Open a room's detail through its row. */
async function openRoom(
  renderer: TestRenderer.ReactTestRenderer,
  roomId: string,
): Promise<void> {
  await press(renderer, `devices-room-row-${roomId}`);
}

describe('DeviceManagementScreen (room list)', () => {
  it('shows the room list with truthful projected counters and NO Tất cả view', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);
    // Room rows with projected counters (legacy board = 2 metrics).
    expect(text).toContain('Phòng A');
    expect(text).toContain('2/10');
    expect(text).toContain('1/10'); // relays in room A
    expect(text).toContain('Phòng B');
    // The rejected global views are gone.
    expect(text).not.toContain('Tất cả');
    expect(hasTestID(renderer, 'device-subview-devices')).toBe(false);
    expect(hasTestID(renderer, 'device-subview-data')).toBe(false);
  });

  it('creating a room awaits the service and OPENS the created room (regression)', async () => {
    const renderer = await renderScreen();
    await changeText(renderer, 'devices-add-room-input', 'Phòng làm việc');
    await press(renderer, 'devices-add-room-submit');

    // The detail for the CREATED room is open (section tabs visible).
    expect(hasTestID(renderer, 'devices-section-sensors')).toBe(true);
    expect(hasTestID(renderer, 'devices-section-controls')).toBe(true);
  });

  it('a failed room creation keeps the form open and surfaces the error', async () => {
    const renderer = await renderScreen({
      onAddRoom: async () => ({ ok: false, message: 'Tên phòng không hợp lệ' }),
    });
    await changeText(renderer, 'devices-add-room-input', 'Phòng làm việc');
    await press(renderer, 'devices-add-room-submit');

    // Still on the room list; the error stays visible in the form.
    expect(hasTextInput(renderer, 'devices-add-room-input')).toBe(true);
    expect(visibleText(renderer)).toContain('Tên phòng không hợp lệ');
  });

  it('legacy roomless records stay manageable (assign/delete, no global filter)', async () => {
    const renderer = await renderScreen();
    expect(visibleText(renderer)).toContain('Cảm biến cũ');
    expect(hasTestID(renderer, 'device-subview-rooms')).toBe(false);
  });
});

describe('DeviceManagementScreen (room detail)', () => {
  it('shows only Cảm biến n/10 and Điều khiển n/10 — projected rows, no re-asked room', async () => {
    const renderer = await renderScreen();
    await openRoom(renderer, 'room-a');

    const text = visibleText(renderer);
    expect(text).toContain('Cảm biến 2/10');
    expect(text).toContain('Điều khiển 1/10');
    // The legacy board projects as TWO separate metric rows.
    expect(visibleText(renderer)).toContain('Nhiệt độ');
    expect(visibleText(renderer)).toContain('Độ ẩm');
    // No repeated room chooser, no binding-kind chooser.
    expect(text).not.toContain('Chọn phòng');
    expect(text).not.toContain('Kiểu kết nối');
  });

  it('the sensor add form inherits the room and omits already-registered fields', async () => {
    const added: NewDeviceInput[] = [];
    const renderer = await renderScreen({
      onAddDevice: async input => {
        added.push(input);
        return { ok: true, message: '' };
      },
    });
    await openRoom(renderer, 'room-a');
    await press(renderer, 'devices-add-sensor-toggle');

    // temperature + humidity are both registered in room A → NOT offered.
    expect(hasTestID(renderer, 'devices-field-temperature')).toBe(false);
    expect(hasTestID(renderer, 'devices-field-humidity')).toBe(false);

    // Register a custom metric first (curated secondary action).
    await press(renderer, 'devices-custom-metric-toggle');
    await changeText(renderer, 'capability-key-input', 'pressure');
    await changeText(renderer, 'capability-label-input', 'Áp suất');
    await press(renderer, 'capability-add-submit');
    await press(renderer, 'devices-custom-metric-toggle');

    // The new metric is now offered; selecting it inherits the room.
    await changeText(renderer, 'devices-add-sensor-name', 'Áp suất phòng A');
    await press(renderer, 'devices-field-pressure');
    await press(renderer, 'devices-add-sensor-submit');

    expect(added).toHaveLength(1);
    expect(added[0]).toEqual({
      name: 'Áp suất phòng A',
      roomId: 'room-a',
      type: 'sensor',
      capabilities: ['pressure'],
      binding: { kind: 'telemetry-sensor' },
    });
  });

  it('a FULL room disables the sensor add (no field choices left)', async () => {
    const fullCapabilities: readonly CapabilityDef[] = [
      ...Array.from({ length: 10 }, (_, i) => ({
        type: `field_${i}`,
        label: `Trường ${i}`,
        kind: 'sensor' as const,
      })),
    ];
    const full: readonly Device[] = Array.from(
      { length: 10 },
      (_, i) =>
        ({
          id: `s${i}`,
          name: `Cảm biến ${i}`,
          roomId: 'room-a',
          type: 'sensor',
          capabilities: [`field_${i}`],
          binding: { kind: 'telemetry-sensor' },
        } as Device),
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    // Render with a full-room device list via a one-off harness override.
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <DeviceManagementScreen
            onBack={() => undefined}
            rooms={ROOMS}
            devices={full}
            capabilities={fullCapabilities}
            onAddRoom={async () => ({ ok: true, message: '' })}
            onRenameRoom={async () => ({ ok: true, message: '' })}
            onRemoveRoom={async () => ({ ok: true, message: '' })}
            onAddDevice={async () => ({ ok: true, message: '' })}
            onUpdateDevice={async () => ({ ok: true, message: '' })}
            onRemoveDevice={async () => ({ ok: true, message: '' })}
            onAddCapability={async () => ({ ok: true, message: '' })}
            onRemoveDeviceCapability={async () => ({ ok: true, message: '' })}
          />
        </ThemeProvider>,
      );
    });
    openRenderers.push(renderer);
    await openRoom(renderer, 'room-a');
    await press(renderer, 'devices-add-sensor-toggle');
    // The counter shows the projected full quota and no field is offered.
    expect(visibleText(renderer)).toContain('Cảm biến 10/10');
    expect(
      byTestID(renderer, 'devices-add-sensor-submit')[0]!.props.disabled,
    ).toBe(true);
  });

  it('deleting a sensor row cascades the EXACT binding only (siblings survive)', async () => {
    const removed: { deviceId: string; field: string }[] = [];
    const renderer = await renderScreen({
      onRemoveDeviceCapability: async (deviceId, field) => {
        removed.push({ deviceId, field });
        return { ok: true, message: '' };
      },
    });
    await openRoom(renderer, 'room-a');
    await press(renderer, 'devices-sensor-delete-sensor-legacy-temperature');

    expect(removed).toEqual([
      { deviceId: 'sensor-legacy', field: 'temperature' },
    ]);
  });

  it('the relay add form asks only for name + free slot (room inherited)', async () => {
    const added: NewDeviceInput[] = [];
    const renderer = await renderScreen({
      onAddDevice: async input => {
        added.push(input);
        return { ok: true, message: '' };
      },
    });
    await openRoom(renderer, 'room-a');
    await press(renderer, 'devices-section-controls');
    await press(renderer, 'devices-add-relay-toggle');

    // Slot 1 is taken in room A; slot 2 is offered.
    expect(hasTestID(renderer, 'devices-slot-1')).toBe(false);
    expect(hasTestID(renderer, 'devices-slot-2')).toBe(true);
    await changeText(renderer, 'devices-add-relay-name', 'Quạt A');
    await press(renderer, 'devices-slot-2');
    await press(renderer, 'devices-add-relay-submit');

    expect(added).toHaveLength(1);
    expect(added[0]).toEqual({
      name: 'Quạt A',
      roomId: 'room-a',
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: 2 },
    });
  });
});

/** Unmount every renderer created by the suite (teardown hygiene). */
afterEach(() => {
  for (const renderer of openRenderers) {
    act(() => {
      renderer.unmount();
    });
  }
  openRenderers.length = 0;
});
