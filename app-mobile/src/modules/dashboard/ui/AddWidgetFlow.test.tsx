/**
 * AddWidgetFlow tests — one-tap, room-authoritative, duplicate-free
 * (approved room-sensor rework, dashboard slice E):
 *
 * - the flow renders ONLY the editor room's projected sensor registrations
 *   and relays — a room-A editor can never add a room-B
 *   source;
 * - ONE TAP sends a complete default-size input (roomId = editorRoomId
 *   always; no category/device/capability/size steps, no history option);
 * - choices already present in the current widget list are hidden
 *   immediately (UI-seam duplicate prevention);
 * - the retired `room-device-list` overview choice is never offered.
 */

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { ThemeProvider } from '@core/theme';
import type { CapabilityDef, Device, Room } from '@modules/devices/api';
import type { AddWidgetInput } from '@modules/dashboard/api';
import type { WidgetConfig } from '@modules/widgets/api';

import { AddWidgetFlow } from './AddWidgetFlow';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** Multi-room fixture: room A has sensors + relays, room B its own. */
const ROOMS: readonly Room[] = [
  { id: 'room-a', name: 'Phòng A', order: 0 },
  { id: 'room-b', name: 'Phòng B', order: 1 },
];

const CAPABILITIES: readonly CapabilityDef[] = [
  {
    type: 'temperature',
    label: 'Nhiệt độ',
    kind: 'sensor',
    icon: 'thermometer-outline',
  },
  { type: 'humidity', label: 'Độ ẩm', kind: 'sensor', icon: 'water-outline' },
];

const DEVICES: readonly Device[] = [
  {
    id: 'sensor-temp-a',
    name: 'Nhiệt độ',
    roomId: 'room-a',
    type: 'sensor',
    capabilities: ['temperature'],
    binding: { kind: 'telemetry-sensor' },
  },
  {
    id: 'sensor-hum-a',
    name: 'Độ ẩm',
    roomId: 'room-a',
    type: 'sensor',
    capabilities: ['humidity'],
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
];

function widget(
  overrides: Partial<WidgetConfig> & { id: string },
): WidgetConfig {
  return {
    type: 'sensor-value',
    roomId: 'room-a',
    binding: { deviceId: 'sensor-temp-a', capability: 'temperature' },
    layout: { x: 0, y: 0, width: 1, height: 1 },
    ...overrides,
  } as WidgetConfig;
}

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
  return texts.join('');
}

/** Renderers still mounted (unmounted in afterEach — teardown hygiene). */
const openRenderers: TestRenderer.ReactTestRenderer[] = [];

async function renderFlow(props: {
  editorRoomId: string;
  devices?: readonly Device[];
  widgets?: readonly WidgetConfig[];
  onAdd?: (input: AddWidgetInput) => void;
}) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider mode="light">
        <AddWidgetFlow
          editorRoomId={props.editorRoomId}
          editorRoomName={
            ROOMS.find(room => room.id === props.editorRoomId)?.name ?? ''
          }
          devices={props.devices ?? DEVICES}
          capabilities={CAPABILITIES}
          widgets={props.widgets ?? []}
          onAdd={props.onAdd ?? (() => undefined)}
          onCancel={() => undefined}
        />
      </ThemeProvider>,
    );
  });
  openRenderers.push(renderer);
  return renderer;
}

describe('AddWidgetFlow (one-tap, room-authoritative)', () => {
  it('lists ONLY the editor room sensor/relay choices — never another room', async () => {
    const renderer = await renderFlow({ editorRoomId: 'room-a' });
    const text = visibleText(renderer);
    // Room A choices offered…
    expect(text).toContain('Nhiệt độ');
    expect(text).toContain('Độ ẩm');
    expect(text).toContain('Đèn A');
    // …room B source NOT offered.
    expect(text).not.toContain('Nhiệt độ B');
    expect(
      renderer.root.findAllByProps({
        testID: 'add-widget-choice-sensor:sensor-temp-b:temperature',
      }).length,
    ).toBe(0);
  });

  it('sends a complete default-size input in ONE tap (roomId = editor room)', async () => {
    const added: AddWidgetInput[] = [];
    const renderer = await renderFlow({
      editorRoomId: 'room-a',
      onAdd: input => added.push(input),
    });
    await act(async () => {
      renderer.root
        .findByProps({
          testID: 'add-widget-choice-sensor:sensor-temp-a:temperature',
        })
        .props.onPress();
    });

    expect(added).toHaveLength(1);
    expect(added[0]).toEqual({
      type: 'sensor-value',
      binding: { deviceId: 'sensor-temp-a', capability: 'temperature' },
      roomId: 'room-a',
    });
    // There is no wizard left: no type/device/capability/size step UI.
    const text = visibleText(renderer);
    expect(text).not.toContain('Chọn thiết bị');
    expect(text).not.toContain('Chọn kích thước');
    expect(text).not.toContain('Chọn loại dữ liệu');
  });

  it('hides a choice once its binding is displayed (UI-seam duplicate prevention)', async () => {
    const renderer = await renderFlow({
      editorRoomId: 'room-a',
      widgets: [
        widget({ id: 'w1' }), // temperature already displayed
      ],
    });
    const text = visibleText(renderer);
    expect(text).not.toContain('Nhiệt độ');
    expect(
      renderer.root.findAllByProps({
        testID: 'add-widget-choice-sensor:sensor-temp-a:temperature',
      }).length,
    ).toBe(0);
    // Other choices remain.
    expect(
      renderer.root.findByProps({
        testID: 'add-widget-choice-sensor:sensor-hum-a:humidity',
      }),
    ).toBeDefined();
  });

  it('the RETIRED room-overview choice is never offered (any room state)', async () => {
    // The `room-device-list` widget is retired (device-acceptance rework):
    // even when the room has none, the add-flow must not offer it.
    const renderer = await renderFlow({ editorRoomId: 'room-b' });
    expect(
      renderer.root.findAllByProps({
        testID: 'add-widget-choice-room-overview',
      }).length,
    ).toBe(0);
  });

  it('shows the editor room in the header so the user keeps the context', async () => {
    const renderer = await renderFlow({ editorRoomId: 'room-b' });
    expect(visibleText(renderer)).toContain('Phòng đang chỉnh sửa: Phòng B');
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
