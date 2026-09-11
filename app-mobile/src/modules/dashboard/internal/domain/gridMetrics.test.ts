/**
 * Grid metrics tests — the pure pixel math behind the dashboard grid.
 *
 * Only the formulas are tested (no render tests): cell width from the
 * measured canvas width, the responsive clamped row-height policy, cell
 * pixel rects (horizontal bounds included), drag snapping, the safe
 * initial/invalid fallback and the measured-vs-window width seam. The
 * view-mode per-TYPE row-height layer (D4) is tested separately: sensor
 * rows keep the 160–176 policy, switch rows render compact (~92), card
 * heights stay finite/positive, and the persisted absolute-grid math is
 * untouched. The smart-view mapping layer (`computeSmartViewMetrics`) is
 * tested for its symmetric screen padding (16/24), the 16pt card gap on
 * both axes, its totality and its token drift guard.
 */

import { LIGHT_TOKENS } from '@core/theme';

import {
  FALLBACK_GRID_CANVAS_WIDTH,
  GRID_ROW_HEIGHT,
  GRID_ROW_HEIGHT_MAX,
  SMART_VIEW_GAP,
  SMART_VIEW_INSET_NARROW,
  SMART_VIEW_INSET_WIDE,
  SMART_VIEW_MAX_CONTENT_WIDTH,
  SMART_VIEW_SENSOR_ROW_HEIGHT,
  STACKED_BREAKPOINT,
  VIEW_DEVICE_ROW_HEIGHT,
  computeGridMetrics,
  computeSmartViewMetrics,
  gridContentHeight,
  pixelRect,
  resolveCanvasWidth,
  resolvePresentationMode,
  snapToGrid,
  smartFlowLayout,
  stackedLayout,
  viewCardHeight,
  viewRowHeight,
} from './gridMetrics';

describe('computeGridMetrics', () => {
  it('computes the 2-column cell width from the screen width', () => {
    // (390 - 2*16 - 12) / 2 = (390 - 32 - 12) / 2 = 346 / 2 = 173
    // Row height policy: one row tracks the cell width 1:1, clamped to
    // [GRID_ROW_HEIGHT, GRID_ROW_HEIGHT_MAX] → round(173) = 173.
    const metrics = computeGridMetrics(390);
    expect(metrics).toEqual({
      padding: 16,
      gap: 12,
      rowHeight: 173,
      cellWidth: 173,
    });
  });

  it('cell width is positive for a narrow phone screen', () => {
    const metrics = computeGridMetrics(320);
    expect(metrics.cellWidth).toBe((320 - 32 - 12) / 2);
    expect(metrics.cellWidth).toBeGreaterThan(0);
  });

  it('clamps the responsive row height to the documented bounds', () => {
    // 240 → cellWidth 98 → below the floor → GRID_ROW_HEIGHT.
    expect(computeGridMetrics(240).rowHeight).toBe(GRID_ROW_HEIGHT);
    // 390 → cellWidth 173 → 1:1 inside the bounds.
    expect(computeGridMetrics(390).rowHeight).toBe(173);
    // 768 (tablet) → cellWidth 362 → capped at GRID_ROW_HEIGHT_MAX.
    expect(computeGridMetrics(768).rowHeight).toBe(GRID_ROW_HEIGHT_MAX);
    expect(GRID_ROW_HEIGHT).toBeLessThanOrEqual(GRID_ROW_HEIGHT_MAX);
  });
});

describe('canvas width matrix (responsive bounds)', () => {
  // Narrow phones, normal phones, wide phone and a tablet container.
  const CANVAS_WIDTHS = [240, 280, 320, 374, 390, 460, 768] as const;
  const PLACEMENTS = [
    { x: 0, y: 0, width: 1, height: 1 },
    { x: 1, y: 0, width: 1, height: 1 },
    { x: 0, y: 1, width: 2, height: 1 },
    { x: 0, y: 2, width: 1, height: 2 },
    { x: 1, y: 2, width: 1, height: 2 },
    { x: 0, y: 0, width: 2, height: 2 },
    { x: 0, y: 3, width: 2, height: 2 },
  ] as const;

  it.each(CANVAS_WIDTHS)('yields finite positive metrics at %ipx', width => {
    const metrics = computeGridMetrics(width);
    expect(Number.isFinite(metrics.cellWidth)).toBe(true);
    expect(metrics.cellWidth).toBeGreaterThan(0);
    expect(Number.isFinite(metrics.rowHeight)).toBe(true);
    expect(metrics.rowHeight).toBeGreaterThanOrEqual(GRID_ROW_HEIGHT);
    expect(metrics.rowHeight).toBeLessThanOrEqual(GRID_ROW_HEIGHT_MAX);
  });

  it.each(CANVAS_WIDTHS)(
    'keeps every card rect within the %ipx canvas horizontally',
    canvasWidth => {
      const metrics = computeGridMetrics(canvasWidth);
      for (const placement of PLACEMENTS) {
        const rect = pixelRect(
          placement.x,
          placement.y,
          placement.width,
          placement.height,
          metrics,
        );
        expect(Number.isFinite(rect.left)).toBe(true);
        expect(Number.isFinite(rect.width)).toBe(true);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.left + rect.width).toBeLessThanOrEqual(canvasWidth);
        expect(rect.top).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(rect.height)).toBe(true);
        expect(rect.height).toBeGreaterThan(0);
      }
    },
  );
});

describe('invalid / unmeasured canvas fallback', () => {
  it.each([NaN, 0, -40, Infinity])(
    'falls back to the documented default canvas for %p',
    invalid => {
      const metrics = computeGridMetrics(invalid);
      expect(metrics).toEqual(computeGridMetrics(FALLBACK_GRID_CANVAS_WIDTH));
      expect(metrics.cellWidth).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.cellWidth)).toBe(true);
      expect(Number.isFinite(metrics.rowHeight)).toBe(true);
    },
  );

  it('fallback metrics keep card rects within the fallback canvas', () => {
    const metrics = computeGridMetrics(NaN);
    const rect = pixelRect(0, 0, 2, 2, metrics);
    expect(rect.left + rect.width).toBeLessThanOrEqual(
      FALLBACK_GRID_CANVAS_WIDTH,
    );
  });
});

describe('resolveCanvasWidth (measured vs window seam)', () => {
  it('prefers the measured parent width over the window width', () => {
    expect(resolveCanvasWidth(250, 390)).toBe(250);
    expect(resolveCanvasWidth(768, 390)).toBe(768);
  });

  it('uses the window width until the first positive layout event', () => {
    expect(resolveCanvasWidth(null, 390)).toBe(390);
    expect(resolveCanvasWidth(NaN, 390)).toBe(390);
    expect(resolveCanvasWidth(0, 390)).toBe(390);
    expect(resolveCanvasWidth(-10, 390)).toBe(390);
  });

  it('falls back to the documented default when nothing is measurable', () => {
    expect(resolveCanvasWidth(null, NaN)).toBe(FALLBACK_GRID_CANVAS_WIDTH);
    expect(resolveCanvasWidth(null, 0)).toBe(FALLBACK_GRID_CANVAS_WIDTH);
  });
});

describe('pixelRect', () => {
  const metrics = computeGridMetrics(374);
  // cellW = (374 - 32 - 12) / 2 = 165

  it('positions the top-left 1x1 cell at (padding, padding)', () => {
    const rect = pixelRect(0, 0, 1, 1, metrics);
    expect(rect.left).toBe(metrics.padding);
    expect(rect.top).toBe(metrics.padding);
    expect(rect.width).toBe(metrics.cellWidth);
    expect(rect.height).toBe(metrics.rowHeight);
  });

  it('places a 2x1 widget across both columns', () => {
    const rect = pixelRect(0, 1, 2, 1, metrics);
    expect(rect.left).toBe(metrics.padding);
    expect(rect.top).toBe(metrics.padding + metrics.rowHeight + metrics.gap);
    expect(rect.width).toBe(2 * metrics.cellWidth + metrics.gap);
    expect(rect.height).toBe(metrics.rowHeight);
  });

  it('places a widget at column 1 with the horizontal offset', () => {
    const rect = pixelRect(1, 0, 1, 2, metrics);
    expect(rect.left).toBe(metrics.padding + metrics.cellWidth + metrics.gap);
    expect(rect.top).toBe(metrics.padding);
    expect(rect.height).toBe(2 * metrics.rowHeight + metrics.gap);
  });
});

describe('snapToGrid', () => {
  it('rounds to the nearest cell step', () => {
    const step = 173 + 12; // 185
    expect(snapToGrid(80, step)).toBe(0); // 80/185 = 0.43
    expect(snapToGrid(92, step)).toBe(0); // 92/185 = 0.497
    expect(snapToGrid(93, step)).toBe(1); // 93/185 = 0.503
    expect(snapToGrid(280, step)).toBe(2); // 280/185 = 1.51
    expect(snapToGrid(-190, step)).toBe(-1); // -190/185 = -1.03
  });

  it('guards a zero step', () => {
    expect(snapToGrid(50, 0)).toBe(0);
  });
});

describe('gridContentHeight', () => {
  const metrics = computeGridMetrics(390);

  it('reserves one row + padding for an empty grid', () => {
    expect(gridContentHeight([], metrics)).toBe(
      metrics.rowHeight + 2 * metrics.padding,
    );
  });

  it('reserves the exact row extent of the lowest widget', () => {
    const widgets = [
      { layout: { y: 0, height: 1 } },
      { layout: { y: 1, height: 2 } },
    ];
    // rows = max(0+1, 1+2) = 3 → 3*rowH + 2*gap + 2*padding.
    expect(gridContentHeight(widgets, metrics)).toBe(
      3 * metrics.rowHeight + 2 * metrics.gap + 2 * metrics.padding,
    );
  });

  it('stays finite and positive across the responsive widths', () => {
    for (const width of [240, 280, 320, 374, 390, 460, 768]) {
      const height = gridContentHeight(
        [{ layout: { y: 2, height: 2 } }],
        computeGridMetrics(width),
      );
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThan(0);
    }
  });
});

describe('resolvePresentationMode (responsive breakpoint)', () => {
  it('stacks below the documented breakpoint, absolute at/above it', () => {
    expect(STACKED_BREAKPOINT).toBe(560);
    expect(resolvePresentationMode(559)).toBe('stacked');
    expect(resolvePresentationMode(560)).toBe('absolute');
    expect(resolvePresentationMode(800)).toBe('absolute');
    expect(resolvePresentationMode(320)).toBe('stacked');
  });

  it('falls back to the absolute (safe default) for invalid widths', () => {
    expect(resolvePresentationMode(NaN)).toBe('absolute');
    expect(resolvePresentationMode(0)).toBe('absolute');
    expect(resolvePresentationMode(-40)).toBe('absolute');
    expect(resolvePresentationMode(Infinity)).toBe('absolute');
  });
});

describe('stackedLayout (presentation-only mobile reflow)', () => {
  const metrics = computeGridMetrics(320);
  // cellWidth = (320 - 32 - 12) / 2 = 138 → full width 288.

  it('renders one full-width card per row in the given order', () => {
    const { placements } = stackedLayout(
      [
        { id: 'a', layout: { height: 1 } },
        { id: 'b', layout: { height: 1 } },
        { id: 'c', layout: { height: 1 } },
      ],
      metrics,
    );
    expect(placements.map(p => p.widgetId)).toEqual(['a', 'b', 'c']);
    expect(placements[0].rect).toEqual({
      left: metrics.padding,
      top: metrics.padding,
      width: metrics.cellWidth * 2 + metrics.gap,
      height: metrics.rowHeight,
    });
    // Each next card starts one card + one gap lower (no overlaps).
    expect(placements[1].rect.top).toBe(
      placements[0].rect.top + metrics.rowHeight + metrics.gap,
    );
    expect(placements[2].rect.top).toBe(
      placements[1].rect.top + metrics.rowHeight + metrics.gap,
    );
  });

  it('keeps the widget persisted row HEIGHT (not its x/y) per card', () => {
    const { placements } = stackedLayout(
      [
        { id: 'a', layout: { height: 2 } },
        { id: 'b', layout: { height: 1 } },
      ],
      metrics,
    );
    expect(placements[0].rect.height).toBe(2 * metrics.rowHeight + metrics.gap);
    expect(placements[1].rect.height).toBe(metrics.rowHeight);
    // The 2-row card pushes the next card down accordingly.
    expect(placements[1].rect.top).toBe(
      placements[0].rect.top + 2 * metrics.rowHeight + 2 * metrics.gap,
    );
  });

  it('computes the exact total flow height', () => {
    const widgets = [
      { id: 'a', layout: { height: 1 } },
      { id: 'b', layout: { height: 2 } },
    ];
    const { height, placements } = stackedLayout(widgets, metrics);
    const last = placements[placements.length - 1].rect;
    expect(height).toBe(last.top + last.height + metrics.padding);
    expect(height).toBeGreaterThan(0);
  });

  it('falls back to one row + padding for an empty group', () => {
    const { placements, height } = stackedLayout([], metrics);
    expect(placements).toEqual([]);
    expect(height).toBe(metrics.rowHeight + 2 * metrics.padding);
  });

  it('stays finite and positive across the responsive widths', () => {
    for (const width of [240, 280, 320, 374, 390, 460, 768]) {
      const { height, placements } = stackedLayout(
        [
          { id: 'a', layout: { height: 1 } },
          { id: 'b', layout: { height: 2 } },
        ],
        computeGridMetrics(width),
      );
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThan(0);
      for (const placement of placements) {
        expect(Number.isFinite(placement.rect.width)).toBe(true);
        expect(placement.rect.width).toBeGreaterThan(0);
        expect(Number.isFinite(placement.rect.height)).toBe(true);
        expect(placement.rect.height).toBeGreaterThan(0);
      }
    }
  });

  it('never changes the absolute-grid math (both helpers coexist)', () => {
    // The stacked reflow is additive: the persisted two-column pixelRect
    // math is untouched by the new helpers.
    const rect = pixelRect(0, 1, 2, 1, metrics);
    expect(rect.left).toBe(metrics.padding);
    expect(rect.width).toBe(2 * metrics.cellWidth + metrics.gap);
  });
});

describe('viewRowHeight / viewCardHeight (D4 + amendment-2 view-mode floors)', () => {
  const metrics = computeGridMetrics(390); // rowHeight 173 (persisted policy)

  it('floors sensor rows at the amendment-2 compact smart height (~136)', () => {
    expect(SMART_VIEW_SENSOR_ROW_HEIGHT).toBe(136);
    expect(viewRowHeight('sensor-value')).toBe(SMART_VIEW_SENSOR_ROW_HEIGHT);
    // The floor is independent of the canvas — and well below the persisted
    // 160–176 policy (the editor keeps THAT policy untouched).
    expect(viewRowHeight('sensor-value')).toBeLessThan(GRID_ROW_HEIGHT);
    expect(viewRowHeight('sensor-value')).toBeLessThan(metrics.rowHeight);
  });

  it('renders switch rows compact (~92)', () => {
    expect(VIEW_DEVICE_ROW_HEIGHT).toBe(92);
    expect(viewRowHeight('switch')).toBe(VIEW_DEVICE_ROW_HEIGHT);
    expect(viewRowHeight('switch')).toBeLessThan(GRID_ROW_HEIGHT);
  });

  it('falls back to the sensor floor for unknown types', () => {
    expect(viewRowHeight('history-chart')).toBe(SMART_VIEW_SENSOR_ROW_HEIGHT);
    expect(viewRowHeight('')).toBe(SMART_VIEW_SENSOR_ROW_HEIGHT);
  });

  it('computes the card height from the type floor and the span', () => {
    // 1-row switch: exactly the compact device height.
    expect(viewCardHeight('switch', 1, metrics)).toBe(VIEW_DEVICE_ROW_HEIGHT);
    // 1-row sensor: exactly the amendment-2 smart floor.
    expect(viewCardHeight('sensor-value', 1, metrics)).toBe(
      SMART_VIEW_SENSOR_ROW_HEIGHT,
    );
    // Multi-row sensor: span × smart floor + inter-row gaps.
    expect(viewCardHeight('sensor-value', 2, metrics)).toBe(
      2 * SMART_VIEW_SENSOR_ROW_HEIGHT + metrics.gap,
    );
  });

  it('renders the compact device row inside one persisted slot', () => {
    expect(viewCardHeight('switch', 1, metrics)).toBeLessThanOrEqual(
      metrics.rowHeight,
    );
  });

  it.each([NaN, 0, -1, Infinity])(
    'stays total for a degenerate span %p',
    span => {
      const height = viewCardHeight('switch', span, metrics);
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThan(0);
      expect(height).toBe(VIEW_DEVICE_ROW_HEIGHT);
    },
  );

  it('stays finite and positive across the responsive widths', () => {
    for (const width of [240, 280, 320, 374, 390, 460, 768]) {
      const m = computeGridMetrics(width);
      for (const type of ['switch', 'sensor-value']) {
        for (const span of [1, 2]) {
          const height = viewCardHeight(type, span, m);
          expect(Number.isFinite(height)).toBe(true);
          expect(height).toBeGreaterThan(0);
        }
      }
    }
  });

  it('leaves the persisted pixelRect math untouched (presentation-only)', () => {
    // The persisted coordinates keep the uniform-row pitch; the per-type
    // heights are a separate render-time layer.
    const rect = pixelRect(0, 0, 1, 1, metrics);
    expect(rect.height).toBe(metrics.rowHeight);
  });
});

describe('computeSmartViewMetrics content cap (scope amendment 2)', () => {
  it('caps the canvas at ~880 so cells stay ≲432 on large screens', () => {
    expect(SMART_VIEW_MAX_CONTENT_WIDTH).toBe(880);
    const wide = computeSmartViewMetrics(4000, 'absolute');
    expect(wide.cellWidth).toBeLessThanOrEqual(432);
    // (880 − 2×24 − 16) / 2 = 408.
    expect(wide.cellWidth).toBeCloseTo(408, 5);
    expect(wide.padding).toBe(SMART_VIEW_INSET_WIDE);
  });

  it('keeps narrow canvases untouched by the cap', () => {
    const phone = computeSmartViewMetrics(390, 'stacked');
    const wide = computeSmartViewMetrics(800, 'absolute');
    // Below the cap the geometry matches the uncapped math exactly.
    expect(phone.cellWidth).toBeCloseTo((390 - 2 * 16 - 16) / 2, 5);
    expect(wide.cellWidth).toBeCloseTo((800 - 2 * 24 - 16) / 2, 5);
  });

  it('stays total for invalid and oversized inputs', () => {
    expect(
      Number.isFinite(computeSmartViewMetrics(NaN, 'stacked').cellWidth),
    ).toBe(true);
    const huge = computeSmartViewMetrics(Number.MAX_SAFE_INTEGER, 'absolute');
    expect(huge.cellWidth).toBeLessThanOrEqual(432);
  });
});

describe('smartFlowLayout (growth-safe two-column smart view, fix cycle 2)', () => {
  // Representative wide canvas (the 2x2 projection seam): cellWidth 368,
  // inset 24, gap 16. The per-TYPE card floors come from viewCardHeight
  // (amendment 2: sensor 136, switch 92) — `rowHeight` is not a floor
  // source in the smart view.
  const metrics = computeSmartViewMetrics(800, 'absolute');

  /** A minimal layout widget for the flow mapping. */
  const lw = (
    id: string,
    type: string,
    x: number,
    y: number,
    width = 1,
    height = 1,
  ) => ({ id, type, layout: { x, y, width, height } });

  it('projects a persisted 2x2 grid into two flow rows of two columns', () => {
    // The seed-like section: 4 1-wide cards at (0,0),(1,0),(0,1),(1,1).
    const flow = smartFlowLayout(
      [
        lw('tl', 'sensor-value', 0, 0),
        lw('tr', 'sensor-value', 1, 0),
        lw('bl', 'switch', 0, 1),
        lw('br', 'switch', 1, 1),
      ],
      metrics,
    );
    expect(flow.rows).toEqual([
      { left: 'tl', right: 'tr', full: null },
      { left: 'bl', right: 'br', full: null },
    ]);
    // Floor-based minimum flow height: 2*24 + 136 + 16 + 92 — the row
    // floors are the MAX of the row's cards (both sensors at the
    // amendment-2 136 floor; both switches 92). The real flow height is
    // content-driven and can only be taller (grown cards push the
    // following rows down).
    expect(flow.minHeight).toBe(
      2 * 24 +
        SMART_VIEW_SENSOR_ROW_HEIGHT +
        SMART_VIEW_GAP +
        VIEW_DEVICE_ROW_HEIGHT,
    );
  });

  it('keeps the persisted COLUMN alignment when one column is empty', () => {
    // A card persisted at x=1 stays in the right flow column (a spacer
    // renders on the left) — WYSIWYG with the editor's columns.
    const flow = smartFlowLayout([lw('r', 'switch', 1, 0)], metrics);
    expect(flow.rows).toEqual([{ left: null, right: 'r', full: null }]);
  });

  it('gives a 2-wide card its OWN full row', () => {
    const flow = smartFlowLayout(
      [lw('wide', 'sensor-value', 0, 0, 2, 1), lw('s', 'switch', 0, 1)],
      metrics,
    );
    expect(flow.rows).toEqual([
      { left: null, right: null, full: 'wide' },
      { left: 's', right: null, full: null },
    ]);
    // The full row's floor honors the 2-column sensor's amendment-2 smart
    // floor (136).
    expect(flow.minHeight).toBe(
      2 * 24 +
        SMART_VIEW_SENSOR_ROW_HEIGHT +
        SMART_VIEW_GAP +
        VIEW_DEVICE_ROW_HEIGHT,
    );
  });

  it('starts a NEW flow row at every persisted-row bucket boundary', () => {
    // Even when the previous row still has a free slot, a new persisted
    // row never shares a flow row (the mapping stays WYSIWYG-ordered).
    const flow = smartFlowLayout(
      [
        lw('a', 'switch', 0, 0),
        lw('b', 'switch', 1, 1),
        lw('c', 'switch', 0, 2),
      ],
      metrics,
    );
    expect(flow.rows).toEqual([
      { left: 'a', right: null, full: null },
      { left: null, right: 'b', full: null },
      { left: 'c', right: null, full: null },
    ]);
  });

  it('row floor is the MAX of the row cards (a grown row raises its floor)', () => {
    // A sensor (136 amendment-2 floor) and a switch (92 floor) share
    // persisted row 0.
    const flow = smartFlowLayout(
      [lw('sensor', 'sensor-value', 0, 0), lw('sw', 'switch', 1, 0)],
      metrics,
    );
    expect(flow.rows).toEqual([{ left: 'sensor', right: 'sw', full: null }]);
    expect(flow.minHeight).toBe(2 * 24 + SMART_VIEW_SENSOR_ROW_HEIGHT);
  });

  it('is total: degenerate coordinates never break the structure', () => {
    const flow = smartFlowLayout(
      [
        lw('nan', 'switch', NaN, NaN),
        lw('neg', 'switch', -3, -2),
        lw('huge', 'switch', 0, Number.MAX_SAFE_INTEGER),
      ],
      metrics,
    );
    // Every card lands in exactly one slot; no slot holds two cards.
    const slots = flow.rows.flatMap(row =>
      [row.left, row.right, row.full].filter(id => id !== null),
    );
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).toHaveLength(3);
    expect(Number.isFinite(flow.minHeight)).toBe(true);
    expect(flow.minHeight).toBeGreaterThan(0);
  });

  it('empty section → no rows and the container-padding floor', () => {
    const flow = smartFlowLayout([], metrics);
    expect(flow.rows).toEqual([]);
    expect(flow.minHeight).toBe(2 * metrics.padding);
  });

  it('stays finite and positive across the responsive widths', () => {
    for (const width of [560, 600, 768, 800, 1024, NaN, 0, 10]) {
      const wide = computeSmartViewMetrics(width, 'absolute');
      const flow = smartFlowLayout(
        [
          lw('a', 'switch', 0, 0),
          lw('b', 'switch', 1, 0),
          lw('c', 'switch', 0, 1),
        ],
        wide,
      );
      expect(Number.isFinite(flow.minHeight)).toBe(true);
      expect(flow.minHeight).toBeGreaterThan(0);
      expect(flow.rows.length).toBeGreaterThan(0);
    }
  });

  it('never touches the persisted math (coexists with pixelRect)', () => {
    const rect = pixelRect(0, 0, 1, 1, metrics);
    expect(rect.left).toBe(metrics.padding);
    expect(rect.height).toBe(metrics.rowHeight);
  });
});

describe('computeSmartViewMetrics (presentation-only smart-view mapping)', () => {
  it('maps the wide measured canvas to symmetric 24pt padding + 16pt gap', () => {
    // cellWidth = (800 - 2*24 - 16) / 2 = 368 → rowHeight capped at 176.
    const metrics = computeSmartViewMetrics(800, 'absolute');
    expect(metrics).toEqual({
      padding: 24,
      gap: 16,
      rowHeight: 176,
      cellWidth: 368,
    });

    // The persisted cells project to SYMMETRIC view rects: the col-0 card
    // sits 24 from the left edge and the col-1 card's right edge mirrors
    // it (24 from the right edge) — the reviewer's blocker geometry.
    const left = pixelRect(0, 0, 1, 1, metrics);
    const right = pixelRect(1, 0, 1, 1, metrics);
    expect(left.left).toBe(24);
    expect(right.left + right.width).toBe(800 - 24);
    // The ABSOLUTE inter-card gap is the smart 16 (never the persisted
    // GRID_GAP 12).
    expect(right.left - (left.left + left.width)).toBe(SMART_VIEW_GAP);
    expect(right.left - (left.left + left.width)).toBe(16);
  });

  it('maps the narrow stacked canvas to 16pt padding + 16pt flow gap', () => {
    const metrics = computeSmartViewMetrics(360, 'stacked');
    expect(metrics.padding).toBe(16);
    expect(metrics.gap).toBe(16);
    const { placements } = stackedLayout(
      [{ id: 'a', layout: { height: 1 } }],
      metrics,
    );
    expect(placements[0]!.rect.left).toBe(16);
    expect(placements[0]!.rect.width).toBe(360 - 32);
  });

  it('keeps the row heights on the documented 160–176 policy', () => {
    for (const width of [560, 600, 768, 800, 1024]) {
      const metrics = computeSmartViewMetrics(width, 'absolute');
      expect(metrics.rowHeight).toBeGreaterThanOrEqual(GRID_ROW_HEIGHT);
      expect(metrics.rowHeight).toBeLessThanOrEqual(GRID_ROW_HEIGHT_MAX);
    }
    // A narrow phone stacks: cellWidth 156 → the row floor applies.
    expect(computeSmartViewMetrics(360, 'stacked').rowHeight).toBe(
      GRID_ROW_HEIGHT,
    );
  });

  it('is total: invalid/degenerate widths stay finite and positive', () => {
    for (const width of [NaN, 0, -40, Infinity, 10, 46, 50]) {
      for (const presentation of ['absolute', 'stacked'] as const) {
        const metrics = computeSmartViewMetrics(width, presentation);
        expect(Number.isFinite(metrics.cellWidth)).toBe(true);
        expect(metrics.cellWidth).toBeGreaterThan(0);
        expect(Number.isFinite(metrics.rowHeight)).toBe(true);
        expect(metrics.rowHeight).toBeGreaterThan(0);
        const rect = pixelRect(1, 0, 1, 1, metrics);
        expect(Number.isFinite(rect.left + rect.width)).toBe(true);
      }
    }
  });

  it('never touches the persisted math (both layers coexist)', () => {
    // The editor/persisted-slot contract keeps the uniform padding 16 +
    // gap 12 grid.
    expect(computeGridMetrics(800)).toEqual({
      padding: 16,
      gap: 12,
      rowHeight: 176,
      cellWidth: 378,
    });
    // And the fallback contract is shared: unmeasured input falls back to
    // the documented default canvas.
    expect(computeSmartViewMetrics(NaN, 'absolute')).toEqual(
      computeSmartViewMetrics(FALLBACK_GRID_CANVAS_WIDTH, 'absolute'),
    );
  });

  it('mirrors the smart spacing tokens (drift guard)', () => {
    expect(SMART_VIEW_GAP).toBe(LIGHT_TOKENS.smart.spacing.cardGap);
    expect(SMART_VIEW_INSET_NARROW).toBe(LIGHT_TOKENS.smart.spacing.screenH);
    expect(SMART_VIEW_INSET_WIDE).toBe(LIGHT_TOKENS.smart.spacing.screenHWide);
  });
});
