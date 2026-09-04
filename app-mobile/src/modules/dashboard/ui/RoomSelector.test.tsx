/**
 * RoomSelector tests — the Dashboard's controlled room navigation strip.
 *
 * Verifies the Phase 1 room-selector contract:
 * - the quick strip never wraps (single horizontal scroll row),
 * - the expand (☰) action sits at the FAR LEFT of the strip row, before the
 *   chips (it is the first child of the row),
 * - one text-only chip per room (zero/one/many rooms), no `Tất cả` option,
 *   no icon inside chips or full-list rows (room name only),
 * - the active room is marked selected,
 * - chips emit `onSelectRoom` (controlled — no store/service access),
 * - the expand action opens a full-list modal whose rows also emit
 *   `onSelectRoom` and close, and the modal can be dismissed,
 * - the modal is a CENTERED dialog (scrim centers the sheet; fully rounded
 *   corners) so no row slides under the Android navigation bar,
 * - modal row text stays READABLE on the sheet: the active row's name never
 *   uses `onPrimary` (white-on-white made it invisible on device) — it uses
 *   the brand color; chips keep white-on-blue unchanged,
 * - the optional `renderRoomIndicator` seam renders custom per-room nodes
 *   (future per-room status extension point; unused in Phase 1).
 */

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Ionicons } from '@expo/vector-icons';

import { LIGHT_TOKENS, ThemeProvider, type ThemeMode } from '@core/theme';
import { STRINGS } from '@core/i18n';
import type { Room } from '@modules/devices/api';

import { RoomSelector } from './RoomSelector';

const ROOMS: readonly Room[] = [
  { id: 'room-a', name: 'Phòng A', order: 0, icon: 'home-outline' },
  { id: 'room-b', name: 'Phòng B', order: 1 },
  { id: 'room-c', name: 'Phòng C', order: 2, icon: 'bed-outline' },
];

/** Render the selector inside the required ThemeProvider. */
function renderSelector(props: {
  rooms?: readonly Room[];
  activeRoomId?: string | null;
  onSelectRoom?: (id: string) => void;
  renderRoomIndicator?: (room: Room, active: boolean) => React.ReactNode;
  mode?: ThemeMode;
}): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ThemeProvider mode={props.mode ?? 'light'}>
        <RoomSelector
          rooms={props.rooms ?? ROOMS}
          activeRoomId={props.activeRoomId ?? 'room-b'}
          onSelectRoom={props.onSelectRoom ?? (() => undefined)}
          renderRoomIndicator={props.renderRoomIndicator}
        />
      </ThemeProvider>,
    );
  });
  return renderer;
}

/** Deep-collect the text strings rendered under a node (RN nests Texts). */
function textOf(node: ReactTestInstance): string {
  return node.children
    .map(child =>
      typeof child === 'string' ? child : textOf(child as ReactTestInstance),
    )
    .join('');
}

function allText(renderer: TestRenderer.ReactTestRenderer): string {
  return textOf(renderer.root);
}

describe('RoomSelector', () => {
  it('renders one chip per room in a single non-wrapping horizontal row', () => {
    const renderer = renderSelector({});
    for (const room of ROOMS) {
      expect(
        renderer.root.findByProps({ testID: `dashboard-room-chip-${room.id}` }),
      ).toBeTruthy();
    }
    const strip = renderer.root.findByProps({
      testID: 'dashboard-room-strip',
    });
    // Never wraps: the strip is a horizontal ScrollView whose content is a
    // single row without a flexWrap style.
    expect(strip.props.horizontal).toBe(true);
    const content = strip.props.contentContainerStyle as Record<
      string,
      unknown
    >;
    expect(content.flexDirection).toBe('row');
    expect(content.flexWrap).toBeUndefined();
  });

  it('places the expand button to the LEFT of the chip strip', () => {
    const renderer = renderSelector({});
    const expand = renderer.root.findByProps({
      testID: 'dashboard-room-expand',
    });
    // The expand button and the strip share the same row; the expand button
    // must be the first child (rendered before the scrollable chips).
    const stripRow = expand.parent;
    expect(stripRow).toBeTruthy();
    const childTestIds = stripRow!.children
      .filter((child): child is ReactTestInstance => typeof child !== 'string')
      .map(child => child.props.testID as string | undefined);
    expect(childTestIds[0]).toBe('dashboard-room-expand');
    expect(childTestIds).toContain('dashboard-room-strip');
    expect(childTestIds.indexOf('dashboard-room-expand')).toBeLessThan(
      childTestIds.indexOf('dashboard-room-strip'),
    );
  });

  it('renders chips as text-only (room name, no icon glyph)', () => {
    const renderer = renderSelector({});
    for (const room of ROOMS) {
      const chip = renderer.root.findByProps({
        testID: `dashboard-room-chip-${room.id}`,
      });
      // The chip's entire text content is exactly the room name — no icon
      // glyph text and no extra labels (rooms WITH an `icon` included).
      expect(textOf(chip)).toBe(room.name);
      expect(chip.findAllByType(Ionicons)).toHaveLength(0);
    }
    // The only icon left in the selector is the expand button's.
    expect(renderer.root.findAllByType(Ionicons)).toHaveLength(1);
  });

  it('emits onSelectRoom when a chip is pressed (controlled)', () => {
    const onSelectRoom = jest.fn();
    const renderer = renderSelector({ onSelectRoom });
    act(() => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-chip-room-c' })
        .props.onPress();
    });
    expect(onSelectRoom).toHaveBeenCalledTimes(1);
    expect(onSelectRoom).toHaveBeenCalledWith('room-c');
  });

  it('marks the active room as selected', () => {
    const renderer = renderSelector({ activeRoomId: 'room-b' });
    expect(
      renderer.root.findByProps({ testID: 'dashboard-room-chip-room-b' }).props
        .accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      renderer.root.findByProps({ testID: 'dashboard-room-chip-room-a' }).props
        .accessibilityState,
    ).toMatchObject({ selected: false });
  });

  it('styles the quick choices as rectangular tabs (approved redesign)', () => {
    const renderer = renderSelector({ activeRoomId: 'room-b', mode: 'light' });
    // Flatten an RN style (object or array of objects) into one object.
    const flat = (style: unknown): Record<string, unknown> =>
      Object.assign(
        {},
        ...((Array.isArray(style) ? style : [style]).filter(
          layer => layer !== null && typeof layer === 'object',
        ) as Record<string, unknown>[]),
      );
    // Active tab: primary blue surface (8–10px corners).
    const activeChip = flat(
      renderer.root.findByProps({ testID: 'dashboard-room-chip-room-b' }).props
        .style,
    );
    expect(activeChip.borderRadius).toBe(9);
    expect(activeChip.backgroundColor).toBe(LIGHT_TOKENS.primary);
    // Inactive tab: neutral elevated surface + border.
    const inactiveChip = flat(
      renderer.root.findByProps({ testID: 'dashboard-room-chip-room-a' }).props
        .style,
    );
    expect(inactiveChip.borderRadius).toBe(9);
    expect(inactiveChip.backgroundColor).toBe(LIGHT_TOKENS.surfaceElevated);
    expect(inactiveChip.borderColor).toBe(LIGHT_TOKENS.border);
  });

  it('opens the full room list from the expand action', () => {
    const renderer = renderSelector({});
    // Modal closed initially.
    expect(
      renderer.root.findByProps({ testID: 'dashboard-room-modal' }).props
        .visible,
    ).toBe(false);
    act(() => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-expand' })
        .props.onPress();
    });
    const modal = renderer.root.findByProps({
      testID: 'dashboard-room-modal',
    });
    expect(modal.props.visible).toBe(true);
    // Every room is listed (many rooms).
    for (const room of ROOMS) {
      expect(
        renderer.root.findByProps({ testID: `dashboard-room-row-${room.id}` }),
      ).toBeTruthy();
    }
  });

  it('keeps the active modal row readable (never onPrimary on the sheet)', () => {
    const renderer = renderSelector({ activeRoomId: 'room-b', mode: 'light' });
    act(() => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-expand' })
        .props.onPress();
    });
    // The ACTIVE row sits on the light sheet — its name must use the brand
    // color, never `onPrimary` (white), which vanished on the white sheet.
    const activeRow = renderer.root.findByProps({
      testID: 'dashboard-room-row-room-b',
    });
    const activeColor = activeRow.findByType(Text).props.style.color as string;
    expect(activeColor).toBe(LIGHT_TOKENS.primary);
    expect(activeColor).not.toBe(LIGHT_TOKENS.onPrimary);
    // Inactive rows keep the primary text color.
    const inactiveRow = renderer.root.findByProps({
      testID: 'dashboard-room-row-room-a',
    });
    expect(inactiveRow.findByType(Text).props.style.color).toBe(
      LIGHT_TOKENS.textPrimary,
    );
    // Chips are UNCHANGED: the active chip keeps white-on-blue.
    const activeChip = renderer.root.findByProps({
      testID: 'dashboard-room-chip-room-b',
    });
    expect(activeChip.findByType(Text).props.style.color).toBe(
      LIGHT_TOKENS.onPrimary,
    );
  });

  it('centers the dialog on screen with fully rounded corners', () => {
    const renderer = renderSelector({ activeRoomId: 'room-b' });
    act(() => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-expand' })
        .props.onPress();
    });
    // The scrim centers (not bottom-anchors) the dialog, so no row can slide
    // under the Android navigation bar.
    const scrim = renderer.root.findByProps({
      testID: 'dashboard-room-modal-scrim',
    });
    expect(scrim.props.style.justifyContent).toBe('center');
    expect(scrim.props.style.alignItems).toBe('center');
    const sheet = renderer.root.findByProps({
      testID: 'dashboard-room-modal-sheet',
    });
    expect(sheet.props.style.width).toBe('100%');
    expect(sheet.props.style.borderRadius).toBe(16);
    expect(sheet.props.style.maxHeight).toBe('70%');
  });

  it('renders full-list rows as text-only (room name, no icon glyph)', () => {
    const renderer = renderSelector({});
    act(() => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-expand' })
        .props.onPress();
    });
    for (const room of ROOMS) {
      const row = renderer.root.findByProps({
        testID: `dashboard-room-row-${room.id}`,
      });
      expect(textOf(row)).toBe(room.name);
      expect(row.findAllByType(Ionicons)).toHaveLength(0);
    }
  });

  it('selects a room from the full list and closes the modal', () => {
    const onSelectRoom = jest.fn();
    const renderer = renderSelector({ onSelectRoom });
    act(() => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-expand' })
        .props.onPress();
    });
    act(() => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-row-room-a' })
        .props.onPress();
    });
    expect(onSelectRoom).toHaveBeenCalledWith('room-a');
    expect(
      renderer.root.findByProps({ testID: 'dashboard-room-modal' }).props
        .visible,
    ).toBe(false);
  });

  it('closes the modal via the close action without selecting', () => {
    const onSelectRoom = jest.fn();
    const renderer = renderSelector({ onSelectRoom });
    act(() => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-expand' })
        .props.onPress();
    });
    act(() => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-close' })
        .props.onPress();
    });
    expect(onSelectRoom).not.toHaveBeenCalled();
    expect(
      renderer.root.findByProps({ testID: 'dashboard-room-modal' }).props
        .visible,
    ).toBe(false);
  });

  it('renders nothing when there are no rooms', () => {
    const renderer = renderSelector({ rooms: [] });
    expect(renderer.toJSON()).toBeNull();
  });

  it('works with a single room (chip + expand remain available)', () => {
    const renderer = renderSelector({ rooms: [ROOMS[0]] });
    expect(
      renderer.root.findByProps({ testID: 'dashboard-room-chip-room-a' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'dashboard-room-expand' }),
    ).toBeTruthy();
  });

  it('never offers a Tất cả option', () => {
    const renderer = renderSelector({});
    expect(allText(renderer)).not.toContain(STRINGS.dashboard.allRooms);
  });

  it('renders custom per-room indicators through the extension seam', () => {
    // Phase 1 seam: a caller MAY render a per-room node (future status
    // color/label) — the selector must place it inside each chip without
    // changing selection behavior.
    const renderer = renderSelector({
      renderRoomIndicator: (room, active) => (
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        <Text testID={`seam-${room.id}`}>{active ? '•' : ''}</Text>
      ),
    });
    for (const room of ROOMS) {
      expect(renderer.root.findByProps({ testID: `seam-${room.id}` }));
    }
  });

  it('the seam receives the room and active flag', () => {
    const seen: { id: string; active: boolean }[] = [];
    renderSelector({
      renderRoomIndicator: (room, active) => {
        seen.push({ id: room.id, active });
        return null;
      },
    });
    expect(seen).toEqual([
      { id: 'room-a', active: false },
      { id: 'room-b', active: true },
      { id: 'room-c', active: false },
    ]);
  });
});
