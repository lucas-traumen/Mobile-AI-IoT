/**
 * Grid metrics tests — the pure pixel math behind the dashboard grid.
 *
 * Only the formulas are tested (no render tests): cell width from the
 * measured canvas width, the responsive clamped row-height policy, cell
 * pixel rects (horizontal bounds included), drag snapping, the safe
 * initial/invalid fallback and the measured-vs-window width seam.
 */

import {
  FALLBACK_GRID_CANVAS_WIDTH,
  GRID_ROW_HEIGHT,
  GRID_ROW_HEIGHT_MAX,
  STACKED_BREAKPOINT,
  computeGridMetrics,
  gridContentHeight,
  pixelRect,
  resolveCanvasWidth,
  resolvePresentationMode,
  snapToGrid,
  stackedLayout,
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
