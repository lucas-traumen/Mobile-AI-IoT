/**
 * Device editor mapping tests (fix cycle 1) + DeviceCard form-sync
 * regression tests (fix cycle 2): the device form → service input mapping
 * must produce relay bindings with the switch capability + index, sensor
 * bindings with only sensor-kind catalog capabilities, and reject
 * incomplete forms; and after save → parent prop update → close/reopen,
 * the form must show the new persisted values (no stale state).
 */

import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import TestRenderer, { act } from 'react-test-renderer';

import { DARK_TOKENS, LIGHT_TOKENS, ThemeProvider } from '@core/theme';
import type { CapabilityDef, Device, Room } from '@modules/devices/api';
import { formToInput, DeviceManagementScreen } from './DevicesScreen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const catalog: readonly CapabilityDef[] = [
  { type: 'temperature', label: 'Nhiệt độ', kind: 'sensor', unit: '°C' },
  { type: 'humidity', label: 'Độ ẩm', kind: 'sensor', unit: '%' },
  { type: 'pressure', label: 'Áp suất', kind: 'sensor', unit: 'hPa' },
  { type: 'switch', label: 'Công tắc', kind: 'switch' },
];

const baseForm = {
  name: 'Cảm biến môi trường',
  roomId: 'room-living',
  bindingKind: 'telemetry-sensor' as const,
  relayIndex: 1 as const,
  capabilities: ['temperature', 'humidity'],
  error: null,
};

describe('formToInput (device editor mapping)', () => {
  it('maps a sensor device to the selected sensor-kind capabilities', () => {
    const input = formToInput(
      { ...baseForm, capabilities: ['temperature', 'pressure'] },
      catalog,
    );
    expect(input).toEqual({
      name: 'Cảm biến môi trường',
      type: 'sensor',
      roomId: 'room-living',
      capabilities: ['temperature', 'pressure'],
      binding: { kind: 'telemetry-sensor' },
    });
  });

  it('filters out non-sensor capabilities from a sensor device', () => {
    // A stale "switch" selection must never reach the service input.
    const input = formToInput(
      { ...baseForm, capabilities: ['temperature', 'switch'] },
      catalog,
    );
    expect(input?.capabilities).toEqual(['temperature']);
  });

  it('maps a relay device to exactly the switch capability + index', () => {
    const input = formToInput(
      {
        ...baseForm,
        name: 'Quạt',
        bindingKind: 'relay',
        relayIndex: 2,
        capabilities: ['temperature'],
      },
      catalog,
    );
    expect(input).toEqual({
      name: 'Quạt',
      type: 'relay',
      roomId: 'room-living',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: 2 },
    });
  });

  it('returns null when the name is missing', () => {
    expect(formToInput({ ...baseForm, name: '   ' }, catalog)).toBeNull();
  });

  it('returns null when a sensor device has no sensor-kind capability', () => {
    expect(formToInput({ ...baseForm, capabilities: [] }, catalog)).toBeNull();
  });
});

/** Rooms/fixtures shared by the component tests. */
const rooms: readonly Room[] = [
  { id: 'room-living', name: 'Phòng khách', order: 0, icon: 'home-outline' },
];

const sensorDevice: Device = {
  id: 'dev-1',
  name: 'Tên cũ',
  type: 'sensor',
  capabilities: ['temperature'],
  binding: { kind: 'telemetry-sensor' },
};

/**
 * State-owning wrapper: mirrors the real parent — `onUpdateDevice` applies
 * the patch to the devices state so DeviceCard receives an updated `device`
 * prop after a successful save (exactly the production flow).
 */
function DeviceManagementHarness({
  initialDevices,
  saveOutcome = { ok: true, message: '' },
  capabilities: catalogCapabilities = catalog,
}: {
  initialDevices: Device[];
  saveOutcome?: { ok: boolean; message: string };
  capabilities?: readonly CapabilityDef[];
}) {
  const [devices, setDevices] = useState(initialDevices);
  return (
    <ThemeProvider mode="light">
      <DeviceManagementScreen
        onBack={() => undefined}
        rooms={rooms}
        devices={devices}
        capabilities={catalogCapabilities}
        onAddRoom={async () => ({ ok: true, message: '' })}
        onRenameRoom={async () => ({ ok: true, message: '' })}
        onRemoveRoom={async () => ({ ok: true, message: '' })}
        onAddDevice={async () => ({ ok: true, message: '' })}
        onUpdateDevice={async (id, patch) => {
          if (saveOutcome.ok) {
            setDevices(previous =>
              previous.map(device =>
                device.id === id ? ({ ...device, ...patch } as Device) : device,
              ),
            );
          }
          return saveOutcome;
        }}
        onRemoveDevice={async () => ({ ok: true, message: '' })}
        onAddCapability={async () => ({ ok: true, message: '' })}
        onRemoveCapability={async () => ({ ok: true, message: '' })}
      />
    </ThemeProvider>
  );
}

describe('DeviceCard form sync (fix cycle 2)', () => {
  async function openEditor(
    renderer: TestRenderer.ReactTestRenderer,
    deviceId: string,
  ) {
    await act(async () => {
      renderer.root
        .findByProps({ testID: `device-edit-${deviceId}` })
        .props.onPress();
    });
  }

  it('save → prop update → reopen shows the persisted values (no stale form)', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DeviceManagementHarness initialDevices={[sensorDevice]} />,
      );
    });

    // Open the editor and change the name.
    await openEditor(renderer, 'dev-1');
    const nameInput = renderer.root.findByProps({
      testID: 'device-name-input',
    });
    expect(nameInput.props.value).toBe('Tên cũ');
    await act(async () => {
      nameInput.props.onChangeText('Tên mới');
    });

    // Save → parent applies the patch → the device prop updates.
    await act(async () => {
      renderer.root.findByProps({ testID: 'device-save' }).props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The editor closed after a successful save…
    expect(
      renderer.root.findAllByProps({ testID: 'device-save' }),
    ).toHaveLength(0);

    // …and reopening shows the NEW persisted name, not the stale one.
    await openEditor(renderer, 'dev-1');
    const reopened = renderer.root.findByProps({ testID: 'device-name-input' });
    expect(reopened.props.value).toBe('Tên mới');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the form open and shows the error when save fails', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DeviceManagementHarness
          initialDevices={[sensorDevice]}
          saveOutcome={{ ok: false, message: 'Không thể lưu thiết bị' }}
        />,
      );
    });

    await openEditor(renderer, 'dev-1');
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'device-name-input' })
        .props.onChangeText('Tên sửa');
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'device-save' }).props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Failure: the form stays open with the typed value + the error.
    expect(renderer.root.findByProps({ testID: 'device-save' })).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'device-name-input' }).props.value,
    ).toBe('Tên sửa');
    const texts: string[] = [];
    const walk = (node: TestRenderer.ReactTestInstance) => {
      if (typeof node.props.children === 'string') {
        texts.push(node.props.children);
      }
      for (const child of node.children) {
        if (typeof child === 'object') {
          walk(child as TestRenderer.ReactTestInstance);
        }
      }
    };
    walk(renderer.root);
    expect(texts.join('\n')).toContain('Không thể lưu thiết bị');
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('Capability catalog row icon accent (Qwen blocker 2)', () => {
  /** Planted catalog color must NOT override the themed built-in. */
  const accentCatalog: readonly CapabilityDef[] = [
    {
      type: 'temperature',
      label: 'Nhiệt độ',
      kind: 'sensor',
      unit: '°C',
      color: '#ff0000',
    },
    {
      type: 'humidity',
      label: 'Độ ẩm',
      kind: 'sensor',
      unit: '%',
    },
    {
      type: 'soil',
      label: 'Đất',
      kind: 'sensor',
      unit: '%',
      color: '#123456',
    },
  ];

  async function renderRowColors(mode: 'light' | 'dark'): Promise<string[]> {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode={mode}>
          <DeviceManagementScreen
            onBack={() => undefined}
            rooms={rooms}
            devices={[]}
            capabilities={accentCatalog}
            onAddRoom={async () => ({ ok: true, message: '' })}
            onRenameRoom={async () => ({ ok: true, message: '' })}
            onRemoveRoom={async () => ({ ok: true, message: '' })}
            onAddDevice={async () => ({ ok: true, message: '' })}
            onUpdateDevice={async () => ({ ok: true, message: '' })}
            onRemoveDevice={async () => ({ ok: true, message: '' })}
            onAddCapability={async () => ({ ok: true, message: '' })}
            onRemoveCapability={async () => ({ ok: true, message: '' })}
          />
        </ThemeProvider>,
      );
    });
    const colors = renderer.root
      .findAllByType(Ionicons)
      .map(icon => icon.props.color as string);
    await act(async () => {
      renderer.unmount();
    });
    return colors;
  }

  it('temperature row icon follows the light token, not the catalog color', async () => {
    const colors = await renderRowColors('light');
    expect(colors).toContain(LIGHT_TOKENS.temperature);
    expect(colors).not.toContain('#ff0000');
  });

  it('custom capability row icon uses its catalog color', async () => {
    const colors = await renderRowColors('light');
    expect(colors).toContain('#123456');
  });

  it('humidity row icon follows the dark token', async () => {
    const colors = await renderRowColors('dark');
    expect(colors).toContain(DARK_TOKENS.humidity);
  });
});
