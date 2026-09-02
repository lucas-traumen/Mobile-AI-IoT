/**
 * filterWidgetsForRoom tests — the pure room-filter helper.
 *
 * Verifies: null → all widgets; a room id → widgets of that room + widgets
 * without a roomId (global widgets). Order is preserved.
 */

import type { WidgetConfig } from '@modules/widgets/api';

import { filterWidgetsForRoom } from './roomFilter';

// roomFilter imports WidgetConfig from @modules/widgets/api → devices api,
// which pulls AsyncStorage transitively — pin the native module.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

function widget(id: string, roomId?: string): WidgetConfig {
  return {
    id,
    type: 'room-device-list',
    roomId,
    layout: { x: 0, y: 0, width: 2, height: 1 },
  };
}

const widgets = [
  widget('w-living', 'room-living'),
  widget('w-global'),
  widget('w-kitchen', 'room-kitchen'),
];

describe('filterWidgetsForRoom', () => {
  it('returns every widget when roomId is null (Tất cả)', () => {
    expect(filterWidgetsForRoom(widgets, null)).toHaveLength(3);
    expect(filterWidgetsForRoom(widgets, null).map(w => w.id)).toEqual([
      'w-living',
      'w-global',
      'w-kitchen',
    ]);
  });

  it('returns the room widgets + global widgets for a room id', () => {
    const result = filterWidgetsForRoom(widgets, 'room-living');
    expect(result.map(w => w.id)).toEqual(['w-living', 'w-global']);
  });

  it('returns only global widgets for a room with no widgets', () => {
    const result = filterWidgetsForRoom(widgets, 'room-bedroom');
    expect(result.map(w => w.id)).toEqual(['w-global']);
  });

  it('preserves the original order', () => {
    const result = filterWidgetsForRoom(
      [widget('b'), widget('a', 'room-living'), widget('c')],
      'room-living',
    );
    expect(result.map(w => w.id)).toEqual(['b', 'a', 'c']);
  });

  it('returns an empty array when there are no widgets', () => {
    expect(filterWidgetsForRoom([], 'room-living')).toEqual([]);
    expect(filterWidgetsForRoom([], null)).toEqual([]);
  });
});
