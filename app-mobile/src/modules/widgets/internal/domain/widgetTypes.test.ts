/**
 * Widget types tests — size parsing + config schema.
 *
 * Verifies: parseWidgetSize valid/invalid sizes; WidgetConfigSchema accepts a
 * full config and rejects empty ids/types, non-integer coordinates and sizes
 * outside 1|2 per axis.
 */

import { WidgetConfigSchema, parseWidgetSize } from './widgetTypes';

// widgetTypes imports CapabilitySchema from @modules/devices/api, which pulls
// AsyncStorage transitively — pin the native module as the devices tests do.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

describe('parseWidgetSize', () => {
  it('parses every supported size', () => {
    expect(parseWidgetSize('1x1')).toEqual({ width: 1, height: 1 });
    expect(parseWidgetSize('2x1')).toEqual({ width: 2, height: 1 });
    expect(parseWidgetSize('1x2')).toEqual({ width: 1, height: 2 });
    expect(parseWidgetSize('2x2')).toEqual({ width: 2, height: 2 });
  });

  it('returns null for invalid sizes', () => {
    expect(parseWidgetSize('3x3')).toBeNull();
    expect(parseWidgetSize('0x1')).toBeNull();
    expect(parseWidgetSize('1x0')).toBeNull();
    expect(parseWidgetSize('1x')).toBeNull();
    expect(parseWidgetSize('x1')).toBeNull();
    expect(parseWidgetSize('')).toBeNull();
    expect(parseWidgetSize('11x1')).toBeNull();
    expect(parseWidgetSize('1y1')).toBeNull();
  });
});

describe('WidgetConfigSchema', () => {
  const valid = {
    id: 'w-1',
    type: 'sensor-value',
    title: 'Nhiệt độ',
    binding: { deviceId: 'sensor-01', capability: 'temperature' },
    layout: { x: 0, y: 0, width: 1, height: 1 },
  };

  it('accepts a full config', () => {
    expect(WidgetConfigSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a config without binding and title', () => {
    const result = WidgetConfigSchema.safeParse({
      id: 'w-conn',
      type: 'connection',
      layout: { x: 0, y: 4, width: 2, height: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty id and type', () => {
    expect(WidgetConfigSchema.safeParse({ ...valid, id: '' }).success).toBe(
      false,
    );
    expect(WidgetConfigSchema.safeParse({ ...valid, type: '' }).success).toBe(
      false,
    );
  });

  it('rejects empty binding capability', () => {
    expect(
      WidgetConfigSchema.safeParse({
        ...valid,
        binding: { deviceId: 'sensor-01', capability: '' },
      }).success,
    ).toBe(false);
  });

  it('accepts a custom (catalog) capability string in the binding', () => {
    expect(
      WidgetConfigSchema.safeParse({
        ...valid,
        binding: { deviceId: 'sensor-01', capability: 'pressure' },
      }).success,
    ).toBe(true);
  });

  it('accepts an optional roomId and rejects empty roomId', () => {
    expect(
      WidgetConfigSchema.safeParse({ ...valid, roomId: 'room-1' }).success,
    ).toBe(true);
    expect(WidgetConfigSchema.safeParse({ ...valid, roomId: '' }).success).toBe(
      false,
    );
  });

  it('rejects floats, negatives and non-1|2 sizes in layout', () => {
    const base = { ...valid, binding: undefined };
    expect(
      WidgetConfigSchema.safeParse({
        ...base,
        layout: { x: 1.5, y: 0, width: 1, height: 1 },
      }).success,
    ).toBe(false);
    expect(
      WidgetConfigSchema.safeParse({
        ...base,
        layout: { x: -1, y: 0, width: 1, height: 1 },
      }).success,
    ).toBe(false);
    expect(
      WidgetConfigSchema.safeParse({
        ...base,
        layout: { x: 0, y: 0, width: 3, height: 1 },
      }).success,
    ).toBe(false);
    expect(
      WidgetConfigSchema.safeParse({
        ...base,
        layout: { x: 0, y: 0, width: 1, height: 0 },
      }).success,
    ).toBe(false);
  });
});
