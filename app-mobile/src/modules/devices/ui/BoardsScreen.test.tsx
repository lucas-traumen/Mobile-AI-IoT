/**
 * BoardsScreen tests (board-discovery-binding plan, acceptance 4).
 *
 * Verifies the render contract through the public props + rendered tree:
 * - one gel card per discovered board with the mono board code, the status
 *   chip (online/seen/offline), the observed fields (catalog labels) and
 *   the relay slot count;
 * - the footer shows `Phòng: {tên}` for a bound board and `Chưa gán phòng`
 *   for a free one, driven by the pure `boardAssignment` selector;
 * - the assign action opens the confirm dialog listing candidate rooms and
 *   confirms through `onAssignBoard`; failure keeps it open with the error;
 * - the unassign action confirms through `onUnassignBoard`;
 * - the empty state guides the user when no board was discovered.
 */

import React from 'react';
import { Modal, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { ThemeProvider } from '@core/theme';
import type {
  BoardInventoryEntry,
  CapabilityDef,
  Room,
} from '@modules/devices/api';

import {
  BoardsScreen,
  sortBoardsOnlineFirst,
  type BoardActionOutcome,
} from './BoardsScreen';

describe('sortBoardsOnlineFirst (pick-list order, fix cycle 2 pin)', () => {
  it('orders online → seen → offline, stable within groups', () => {
    const input: readonly BoardInventoryEntry[] = [
      { code: 'z-off', status: 'offline', fields: [], relaySlots: [] },
      { code: 'b-seen', status: 'seen', fields: [], relaySlots: [] },
      { code: 'm-on', status: 'online', fields: [], relaySlots: [] },
      { code: 'a-on', status: 'online', fields: [], relaySlots: [] },
      { code: 'a-seen', status: 'seen', fields: [], relaySlots: [] },
      { code: 'k-off', status: 'offline', fields: [], relaySlots: [] },
    ];

    expect(sortBoardsOnlineFirst(input).map(board => board.code)).toEqual([
      // Online first (code order within the group).
      'a-on',
      'm-on',
      // Then seen.
      'a-seen',
      'b-seen',
      // Offline last.
      'k-off',
      'z-off',
    ]);
    // Pure: the input array is not mutated.
    expect(input.map(board => board.code)).toEqual([
      'z-off',
      'b-seen',
      'm-on',
      'a-on',
      'a-seen',
      'k-off',
    ]);
  });
});

const ROOMS: readonly Room[] = [
  { id: 'room-a', name: 'Phòng khách', order: 0, code: 'board-1' },
  { id: 'room-b', name: 'Phòng ngủ', order: 1 },
];

const CAPABILITIES: readonly CapabilityDef[] = [
  { type: 'temperature', label: 'Nhiệt độ', kind: 'sensor' },
  { type: 'humidity', label: 'Độ ẩm', kind: 'sensor' },
];

const BOARDS: readonly BoardInventoryEntry[] = [
  {
    code: 'board-1',
    status: 'online',
    fields: ['temperature', 'humidity'],
    relaySlots: [1, 2],
  },
  { code: 'board-2', status: 'seen', fields: [], relaySlots: [] },
  { code: 'board-3', status: 'offline', fields: [], relaySlots: [] },
];

/** Renderers still mounted (unmounted in afterEach — teardown hygiene). */
const openRenderers: TestRenderer.ReactTestRenderer[] = [];

async function renderScreen(
  props: {
    boards?: readonly BoardInventoryEntry[];
    rooms?: readonly Room[];
    onAssignBoard?: (
      code: string,
      roomId: string,
    ) => Promise<BoardActionOutcome>;
    onUnassignBoard?: (code: string) => Promise<BoardActionOutcome>;
  } = {},
  mode: 'light' | 'dark' = 'light',
): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <BoardsScreen
          onBack={() => undefined}
          boards={props.boards ?? BOARDS}
          rooms={props.rooms ?? ROOMS}
          capabilities={CAPABILITIES}
          onAssignBoard={
            props.onAssignBoard ?? (async () => ({ ok: true, message: '' }))
          }
          onUnassignBoard={
            props.onUnassignBoard ?? (async () => ({ ok: true, message: '' }))
          }
        />
      </ThemeProvider>,
    );
  });
  openRenderers.push(renderer);
  return renderer;
}

afterEach(() => {
  for (const renderer of openRenderers) {
    act(() => {
      renderer.unmount();
    });
  }
  openRenderers.length = 0;
});

async function press(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
): Promise<void> {
  const nodes = renderer.root
    .findAllByProps({ testID })
    .filter(node => typeof node.props.onPress === 'function');
  if (nodes.length === 0) {
    throw new Error(`No pressable node for testID "${testID}"`);
  }
  await act(async () => {
    nodes[0]!.props.onPress();
  });
}

function exists(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
): boolean {
  return renderer.root.findAllByProps({ testID }).length > 0;
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
  return texts.join('\n');
}

describe('BoardsScreen (board cards)', () => {
  it('renders one card per board with status chip, fields and slots', async () => {
    const renderer = await renderScreen();

    expect(exists(renderer, 'boards-card-board-1')).toBe(true);
    expect(exists(renderer, 'boards-card-board-2')).toBe(true);
    expect(exists(renderer, 'boards-card-board-3')).toBe(true);
    expect(exists(renderer, 'boards-status-board-1')).toBe(true);
    expect(exists(renderer, 'boards-status-board-2')).toBe(true);
    expect(exists(renderer, 'boards-status-board-3')).toBe(true);

    const text = visibleText(renderer);
    // Fields resolve to catalog labels; relay slot count is rendered.
    expect(text).toContain('Nhiệt độ, Độ ẩm');
    expect(text).toContain('Rơ le: 2 kênh');
    // Status chips use the STRINGS labels (no hardcoded text).
    expect(text).toContain('Online');
    expect(text).toContain('Đã thấy dữ liệu');
    expect(text).toContain('Offline');
  });

  it('shows the bound room for a bound board and Chưa gán phòng otherwise', async () => {
    const renderer = await renderScreen();
    const text = visibleText(renderer);

    expect(text).toContain('Phòng: Phòng khách');
    expect(text).toContain('Chưa gán phòng');
    // The bound board offers BOTH actions; a free one only assign.
    expect(exists(renderer, 'boards-unassign-board-1')).toBe(true);
    expect(exists(renderer, 'boards-unassign-board-2')).toBe(false);
  });

  it('renders the empty state when no board was discovered', async () => {
    const renderer = await renderScreen({ boards: [] });

    expect(exists(renderer, 'boards-empty')).toBe(true);
    expect(exists(renderer, 'boards-card-board-1')).toBe(false);
  });

  it('renders the smart wash in light AND dark (token discipline)', async () => {
    for (const mode of ['light', 'dark'] as const) {
      const renderer = await renderScreen({}, mode);
      expect(exists(renderer, 'boards-card-board-1')).toBe(true);
    }
  });
});

describe('BoardsScreen (binding actions, ConfirmDialog pattern)', () => {
  it('assign flow: pick a room, confirm through onAssignBoard', async () => {
    const assignments: { code: string; roomId: string }[] = [];
    const renderer = await renderScreen({
      rooms: [
        { id: 'room-b', name: 'Phòng ngủ', order: 1 },
        { id: 'room-c', name: 'Nhà bếp', order: 2 },
      ],
      boards: [
        { code: 'board-2', status: 'online', fields: [], relaySlots: [] },
      ],
      onAssignBoard: async (code, roomId) => {
        assignments.push({ code, roomId });
        return { ok: true, message: '' };
      },
    });

    await press(renderer, 'boards-assign-board-2');
    // The confirm dialog is open with both candidate rooms.
    expect(exists(renderer, 'boards-assign-target-room-b')).toBe(true);
    expect(exists(renderer, 'boards-assign-target-room-c')).toBe(true);
    await press(renderer, 'boards-assign-target-room-b');
    await press(renderer, 'boards-assign-confirm');

    expect(assignments).toEqual([{ code: 'board-2', roomId: 'room-b' }]);
    // Success closes the dialog.
    expect(
      renderer.root
        .findAllByType(Modal)
        .find(node => node.props.visible === true),
    ).toBeUndefined();
  });

  it('a FAILED assign keeps the dialog open and surfaces the error', async () => {
    const renderer = await renderScreen({
      rooms: [{ id: 'room-b', name: 'Phòng ngủ', order: 1 }],
      boards: [
        { code: 'board-2', status: 'online', fields: [], relaySlots: [] },
      ],
      onAssignBoard: async () => ({
        ok: false,
        message: 'Mã này đã được gán cho phòng khác.',
      }),
    });

    await press(renderer, 'boards-assign-board-2');
    await press(renderer, 'boards-assign-target-room-b');
    await press(renderer, 'boards-assign-confirm');

    // The dialog stays open (modal still visible) with the error inside.
    const openModal = renderer.root
      .findAllByType(Modal)
      .find(node => node.props.visible === true);
    expect(openModal).toBeDefined();
    expect(visibleText(renderer)).toContain(
      'Mã này đã được gán cho phòng khác.',
    );
  });

  it('unassign flow confirms through onUnassignBoard', async () => {
    const unassigned: string[] = [];
    const renderer = await renderScreen({
      onUnassignBoard: async code => {
        unassigned.push(code);
        return { ok: true, message: '' };
      },
    });

    await press(renderer, 'boards-unassign-board-1');
    await press(renderer, 'boards-unassign-confirm');

    expect(unassigned).toEqual(['board-1']);
  });

  it('assigning an ALREADY-BOUND board to another room SUCCEEDS (fix cycle 2 — atomic transfer)', async () => {
    // board-1 is bound to Phòng khách (ROOMS fixture). The transfer flow
    // previously died in the registry's uniqueness check; it must now
    // complete: the confirm dialog closes and the callback carries the
    // transfer to the registry's atomic rebind.
    const assignments: { code: string; roomId: string }[] = [];
    const renderer = await renderScreen({
      rooms: [
        { id: 'room-a', name: 'Phòng khách', order: 0, code: 'board-1' },
        { id: 'room-b', name: 'Phòng ngủ', order: 1 },
        { id: 'room-c', name: 'Nhà bếp', order: 2 },
      ],
      boards: [
        { code: 'board-1', status: 'online', fields: [], relaySlots: [] },
      ],
      onAssignBoard: async (code, roomId) => {
        // The registry's rebindRoomBoard semantics (tested at the service
        // level): transfer succeeds — model it truthfully.
        assignments.push({ code, roomId });
        return { ok: true, message: '' };
      },
    });

    // The bound board's action label is the REASSIGN variant.
    expect(visibleText(renderer)).toContain('Gán vào phòng khác');
    await press(renderer, 'boards-assign-board-1');
    // The board's CURRENT room is NOT a pick candidate (no self-transfer);
    // the other rooms are.
    expect(exists(renderer, 'boards-assign-target-room-a')).toBe(false);
    expect(exists(renderer, 'boards-assign-target-room-b')).toBe(true);
    await press(renderer, 'boards-assign-target-room-b');
    await press(renderer, 'boards-assign-confirm');

    expect(assignments).toEqual([{ code: 'board-1', roomId: 'room-b' }]);
    expect(
      renderer.root
        .findAllByType(Modal)
        .find(node => node.props.visible === true),
    ).toBeUndefined();
  });
});
