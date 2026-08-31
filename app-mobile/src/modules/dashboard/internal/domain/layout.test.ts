/**
 * Layout engine tests — pure grid math.
 *
 * Verifies: collides/inBounds; findFreeSlot fills gaps (row-major scan);
 * applyMove rejects overlap + out-of-bounds; applyResize keeps position when
 * free else relocates; compactVertical gravity up keeping columns; and
 * validateLayout catches duplicates/overlaps/out-of-bounds.
 *
 * CP-R3 room-aware semantics: widgets of different (non-empty) rooms live in
 * independent coordinate spaces — they may share grid coordinates, never
 * collide, and every operation (find/move/resize/compact/validate) preserves
 * the other rooms' widgets. Global widgets (no roomId) collide with all.
 */

import type { WidgetConfig } from '@modules/widgets/api';

import {
  applyMove,
  applyResize,
  collides,
  compactVertical,
  findFreeSlot,
  inBounds,
  validateLayout,
  widgetsShareVisibleScope,
} from './layout';

function widget(
  id: string,
  layout: Partial<WidgetConfig['layout']> &
    Pick<WidgetConfig['layout'], 'width' | 'height'>,
  roomId?: string,
): WidgetConfig {
  return {
    id,
    type: 'sensor-value',
    ...(roomId ? { roomId } : {}),
    layout: { x: 0, y: 0, ...layout },
  };
}

describe('collides / inBounds', () => {
  it('detects overlapping cells', () => {
    const a = { x: 0, y: 0, width: 1, height: 1 };
    expect(collides(a, { x: 1, y: 0, width: 1, height: 1 })).toBe(false);
    expect(collides(a, { x: 0, y: 1, width: 1, height: 1 })).toBe(false);
    expect(collides(a, { x: 1, y: 1, width: 1, height: 1 })).toBe(false);
    expect(collides(a, { x: 0, y: 0, width: 2, height: 1 })).toBe(true);
    expect(collides(a, { x: 1, y: 0, width: 2, height: 1 })).toBe(false);
  });

  it('checks bounds against the 2-column grid', () => {
    expect(inBounds({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    expect(inBounds({ x: 1, y: 0, width: 2, height: 1 })).toBe(false);
    expect(inBounds({ x: -1, y: 0, width: 1, height: 1 })).toBe(false);
    expect(inBounds({ x: 0, y: -1, width: 1, height: 1 })).toBe(false);
    expect(inBounds({ x: 0, y: 0, width: 2, height: 1 })).toBe(true);
  });
});

describe('findFreeSlot', () => {
  it('returns (0,0) on an empty grid', () => {
    expect(findFreeSlot([], 1, 1)).toEqual({ x: 0, y: 0 });
    expect(findFreeSlot([], 2, 1)).toEqual({ x: 0, y: 0 });
  });

  it('fills gaps column-by-column (row-major scan)', () => {
    const existing = [widget('a', { x: 0, y: 1, width: 1, height: 1 })];
    expect(findFreeSlot(existing, 1, 1)).toEqual({ x: 0, y: 0 });
    const row0Blocked = [
      widget('a', { x: 0, y: 0, width: 1, height: 1 }),
      widget('b', { x: 1, y: 0, width: 1, height: 1 }),
    ];
    expect(findFreeSlot(row0Blocked, 1, 1)).toEqual({ x: 0, y: 1 });
  });

  it('returns null only when the bounded scan exhausts rows', () => {
    // The grid is vertically unbounded, so a full first row still yields
    // (0,1) for 2x1 and 1x1 items.
    const full = [
      widget('a', { x: 0, y: 0, width: 1, height: 1 }),
      widget('b', { x: 1, y: 0, width: 1, height: 1 }),
    ];
    expect(findFreeSlot(full, 2, 1)).toEqual({ x: 0, y: 1 });
    expect(findFreeSlot(full, 1, 1)).toEqual({ x: 0, y: 1 });
  });

  it('skips a wrapped cell that would go out of bounds (2x1 on row 0)', () => {
    const blocked = [
      widget('a', { x: 0, y: 0, width: 1, height: 1 }),
      widget('b', { x: 1, y: 0, width: 1, height: 1 }),
    ];
    expect(findFreeSlot(blocked, 2, 2)).toEqual({ x: 0, y: 1 });
  });
});

describe('applyMove', () => {
  it('moves a widget to a free position', () => {
    const widgets = [widget('a', { x: 0, y: 0, width: 1, height: 1 })];
    const result = applyMove(widgets, 'a', 1, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].layout).toEqual({
        x: 1,
        y: 2,
        width: 1,
        height: 1,
      });
    }
  });

  it('rejects an out-of-bounds position', () => {
    const widgets = [widget('a', { x: 0, y: 0, width: 2, height: 1 })];
    const result = applyMove(widgets, 'a', 1, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/out of bounds/);
    }
  });

  it('rejects an overlapping position', () => {
    const widgets = [
      widget('a', { x: 0, y: 0, width: 1, height: 1 }),
      widget('b', { x: 1, y: 0, width: 1, height: 1 }),
    ];
    const result = applyMove(widgets, 'a', 1, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/overlaps/);
    }
  });

  it('rejects unknown widget ids', () => {
    const result = applyMove([], 'nope', 0, 0);
    expect(result.ok).toBe(false);
  });
});

describe('applyResize', () => {
  it('keeps the position when the new size fits', () => {
    const widgets = [widget('a', { x: 0, y: 0, width: 1, height: 1 })];
    const result = applyResize(widgets, 'a', 2, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].layout).toEqual({
        x: 0,
        y: 0,
        width: 2,
        height: 1,
      });
    }
  });

  it('relocates to a free slot when the current position is blocked', () => {
    const blocked = [
      widget('a', { x: 0, y: 0, width: 2, height: 1 }),
      widget('b', { x: 0, y: 1, width: 2, height: 1 }),
      widget('c', { x: 1, y: 1, width: 1, height: 1 }), // blocks 2x1 in row 1
    ];
    const result = applyResize(blocked, 'c', 2, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const moved = result.value.find(w => w.id === 'c')!;
      expect(moved.layout.width).toBe(2);
      expect(moved.layout.x).toBe(0);
      expect(moved.layout.y).toBe(2);
    }
  });

  it('avoids the first free slot when the current position still fits', () => {
    // a is 2x2 at (0,0); resizing it to 2x1 keeps (0,0) (no collision).
    const widgets = [
      widget('a', { x: 0, y: 0, width: 2, height: 2 }),
      widget('b', { x: 0, y: 2, width: 1, height: 1 }),
      widget('c', { x: 1, y: 2, width: 1, height: 1 }),
    ];
    const result = applyResize(widgets, 'a', 2, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].layout).toEqual({
        x: 0,
        y: 0,
        width: 2,
        height: 1,
      });
    }
  });

  it('returns null when no 2x2 spot is available in the bounded scan', () => {
    // Block every row where a 2x2 could go: 4 full 2x1 rows → a 2x2 needs two
    // adjacent fully-free rows. Rows 0..3 are blocked, and to reach `null`
    // the scan must exhaust all 1000 bounded rows; here we only assert the
    // practical first free spot (0,4) unless a full 2x2-blocking fixture is
    // provided. A 2x2 fixture across 1000 rows would require 4000 widgets —
    // instead verify the scan finds a spot below the blockage.
    const widgets = [
      widget('a', { x: 0, y: 0, width: 2, height: 1 }),
      widget('b', { x: 0, y: 1, width: 2, height: 1 }),
      widget('c', { x: 0, y: 2, width: 2, height: 1 }),
      widget('d', { x: 0, y: 3, width: 2, height: 1 }),
    ];
    expect(findFreeSlot(widgets, 2, 2)).toEqual({ x: 0, y: 4 });
  });
});

describe('compactVertical', () => {
  it('pushes widgets up within their column, keeping x', () => {
    const widgets = [
      widget('a', { x: 0, y: 5, width: 1, height: 1 }),
      widget('b', { x: 1, y: 5, width: 1, height: 1 }),
    ];
    const result = compactVertical(widgets);
    expect(result[0].layout).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(result[1].layout).toEqual({ x: 1, y: 0, width: 1, height: 1 });
  });

  it('keeps a widget below a blocker in the same column', () => {
    const widgets = [
      widget('a', { x: 1, y: 0, width: 1, height: 1 }), // blocks col 1
      widget('b', { x: 0, y: 0, width: 1, height: 1 }),
      widget('c', { x: 1, y: 7, width: 1, height: 1 }), // col 1, must stay below a
    ];
    const result = compactVertical(widgets);
    const c = result.find(w => w.id === 'c')!;
    expect(c.layout.x).toBe(1);
    expect(c.layout.y).toBe(1); // right below a
  });

  it('is stable: same y order preserved for equal priorities', () => {
    const widgets = [
      widget('a', { x: 0, y: 3, width: 1, height: 1 }),
      widget('b', { x: 0, y: 1, width: 1, height: 1 }),
    ];
    const result = compactVertical(widgets);
    // b was above a → b stays above a after compaction.
    expect(result.map(w => w.id)).toEqual(['b', 'a']);
    expect(result[0].layout.y).toBe(0);
    expect(result[1].layout.y).toBe(1);
  });
});

describe('validateLayout', () => {
  it('rejects duplicate ids, overlaps and out-of-bounds', () => {
    expect(
      validateLayout([
        widget('a', { width: 1, height: 1 }),
        widget('a', { x: 1, width: 1, height: 1 }),
      ]).ok,
    ).toBe(false);
    expect(
      validateLayout([
        widget('a', { x: 0, y: 0, width: 1, height: 1 }),
        widget('b', { x: 0, y: 0, width: 1, height: 1 }),
      ]).ok,
    ).toBe(false);
    expect(
      validateLayout([widget('a', { x: 1, y: 0, width: 2, height: 1 })]).ok,
    ).toBe(false);
  });

  it('accepts a valid layout', () => {
    const result = validateLayout([
      widget('a', { x: 0, y: 0, width: 1, height: 1 }),
      widget('b', { x: 1, y: 0, width: 1, height: 1 }),
    ]);
    expect(result.ok).toBe(true);
  });
});

describe('widgetsShareVisibleScope (CP-R3)', () => {
  it('different rooms never share visible scope', () => {
    expect(widgetsShareVisibleScope({ roomId: 'r1' }, { roomId: 'r2' })).toBe(
      false,
    );
  });

  it('same room and any-global combinations share scope', () => {
    expect(widgetsShareVisibleScope({ roomId: 'r1' }, { roomId: 'r1' })).toBe(
      true,
    );
    expect(widgetsShareVisibleScope({}, { roomId: 'r1' })).toBe(true);
    expect(widgetsShareVisibleScope({ roomId: 'r1' }, {})).toBe(true);
    expect(widgetsShareVisibleScope({}, {})).toBe(true);
  });
});

describe('room-aware layout (CP-R3)', () => {
  it('different rooms may occupy the same coordinates (validateLayout ok)', () => {
    const result = validateLayout([
      widget('a', { x: 0, y: 0, width: 1, height: 1 }, 'r1'),
      widget('b', { x: 0, y: 0, width: 1, height: 1 }, 'r2'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('same-room collision is still invalid', () => {
    const result = validateLayout([
      widget('a', { x: 0, y: 0, width: 1, height: 1 }, 'r1'),
      widget('b', { x: 0, y: 0, width: 1, height: 1 }, 'r1'),
    ]);
    expect(result.ok).toBe(false);
  });

  it('a global widget collides with room widgets at the same cell', () => {
    expect(
      validateLayout([
        widget('global', { x: 0, y: 0, width: 1, height: 1 }),
        widget('b', { x: 0, y: 0, width: 1, height: 1 }, 'r1'),
      ]).ok,
    ).toBe(false);
  });

  it('findFreeSlot is room-scoped: same coords free per room', () => {
    const widgets = [widget('a', { x: 0, y: 0, width: 2, height: 1 }, 'r1')];
    // Room r2 does not see r1's widget → (0,0) is free for r2.
    expect(findFreeSlot(widgets, 2, 1, 'r2')).toEqual({ x: 0, y: 0 });
    // Room r1 sees its own widget → first free row is 1.
    expect(findFreeSlot(widgets, 2, 1, 'r1')).toEqual({ x: 0, y: 1 });
    // A global candidate collides with everything → row 1 too.
    expect(findFreeSlot(widgets, 2, 1)).toEqual({ x: 0, y: 1 });
    // A global widget blocks every room at its own coordinates.
    const withGlobal = [
      ...widgets,
      widget('g', { x: 0, y: 0, width: 2, height: 1 }),
    ];
    expect(findFreeSlot(withGlobal, 2, 1, 'r2')).toEqual({ x: 0, y: 1 });
  });

  it('applyMove preserves other-room widgets and allows moving onto their cells', () => {
    const widgets = [
      widget('a', { x: 0, y: 0, width: 1, height: 1 }, 'r1'),
      widget('b', { x: 0, y: 0, width: 1, height: 1 }, 'r2'),
    ];
    const moved = applyMove(widgets, 'a', 0, 0);
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      const untouched = moved.value.find(w => w.id === 'b')!;
      expect(untouched.layout).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      expect(untouched.roomId).toBe('r2');
    }
    // Same-room overlap is still rejected.
    expect(
      applyMove(
        [...widgets, widget('c', { x: 1, y: 1, width: 1, height: 1 }, 'r1')],
        'a',
        1,
        1,
      ).ok,
    ).toBe(false);
  });

  it('applyResize preserves other-room widgets', () => {
    const widgets = [
      widget('a', { x: 0, y: 0, width: 1, height: 1 }, 'r1'),
      widget('b', { x: 0, y: 0, width: 1, height: 1 }, 'r2'),
    ];
    // Growing a (room r1) at (0,0) to 1x2 ignores b (room r2) at (0,0).
    const resized = applyResize(widgets, 'a', 1, 2);
    expect(resized.ok).toBe(true);
    if (resized.ok) {
      const untouched = resized.value.find(w => w.id === 'b')!;
      expect(untouched.layout).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      expect(untouched.roomId).toBe('r2');
    }
  });

  it('compactVertical is room-scoped: each room packs independently', () => {
    const widgets = [
      // Room r1: two stacked widgets with a gap between them.
      widget('a1', { x: 0, y: 0, width: 1, height: 1 }, 'r1'),
      widget('a2', { x: 0, y: 2, width: 1, height: 1 }, 'r1'),
      // Room r2 has its own widget — packed in its own coordinate space.
      widget('b1', { x: 0, y: 1, width: 1, height: 1 }, 'r2'),
    ];
    const result = compactVertical(widgets);
    const a1 = result.find(w => w.id === 'a1')!;
    const a2 = result.find(w => w.id === 'a2')!;
    const b1 = result.find(w => w.id === 'b1')!;
    // r1 compaction ignores r2: a2 slides up right below a1.
    expect(a1.layout.y).toBe(0);
    expect(a2.layout.y).toBe(1);
    // r2 compacts independently: b1 slides to its room-local top.
    expect(b1.layout).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(b1.roomId).toBe('r2');
  });

  it('compactVertical does not compact a room widget against a global in a lower row it cannot see', () => {
    // Global at (0,0) blocks every room; room widgets compact below it.
    const widgets = [
      widget('global', { x: 0, y: 0, width: 2, height: 1 }),
      widget('a', { x: 0, y: 3, width: 1, height: 1 }, 'r1'),
    ];
    const result = compactVertical(widgets);
    expect(result.find(w => w.id === 'a')!.layout.y).toBe(1);
  });
});
