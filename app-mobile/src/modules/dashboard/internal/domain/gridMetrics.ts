/**
 * Dashboard grid metrics — pure pixel math for the 2-column grid.
 *
 * The dashboard grid renders with absolute positioning: a widget at grid
 * `(x, y)` with size width x height cells is placed at
 *
 * - `left = PADDING + x * (cellW + GAP)`
 * - `top = PADDING + y * (rowH + GAP)`
 * - `width = cellW * w + GAP * (w - 1)`
 * - `height = rowH * h + GAP * (h - 1)`
 *
 * Responsive contract (measured canvas):
 *
 * - Callers measure the actual grid container width with `onLayout` and pass
 *   it through `resolveCanvasWidth` — the parent width is authoritative;
 *   `useWindowDimensions` is only the documented fallback until the first
 *   layout event (they coincide for the full-width grid).
 * - `computeGridMetrics` is total: invalid/unmeasured widths (`NaN`,
 *   `<= 0`, `Infinity`) fall back to `FALLBACK_GRID_CANVAS_WIDTH`; canvases
 *   below `MIN_GRID_CANVAS_WIDTH` (geometrically impossible for two positive
 *   columns) are clamped up to that documented degenerate floor. Cell widths
 *   and row heights are therefore always finite and positive, and every
 *   `pixelRect` stays within the canvas horizontally for supported widths.
 * - Row height policy: one row tracks the cell width 1:1, clamped to
 *   `[GRID_ROW_HEIGHT, GRID_ROW_HEIGHT_MAX]` — enough vertical space for
 *   the supported widgets (`sensor-value` 2x1 with sparkline, `switch`
 *   cards) at narrow and normal phone widths without making tablet cards
 *   unreasonably tall.
 *
 * Pure + platform-independent so Jest can test the formulas without mocking
 * `useWindowDimensions`.
 */

/** Outer padding around the grid (points). */
export const GRID_PADDING = 16;

/** Gap between cells (points). */
export const GRID_GAP = 12;

/** Minimum height of one grid row (points) — the responsive policy floor. */
export const GRID_ROW_HEIGHT = 160;

/** Maximum height of one grid row (points) — the responsive policy cap. */
export const GRID_ROW_HEIGHT_MAX = 176;

/**
 * Canvas width used until the first `onLayout` event / for invalid input
 * (points). Matches the narrowest supported phone class.
 */
export const FALLBACK_GRID_CANVAS_WIDTH = 320;

/**
 * Degenerate floor for the canvas (points): `2 * PADDING + GAP + 2` — the
 * smallest width that still yields positive cell widths. Real containers are
 * always far above this; clamping here only keeps the math total.
 */
export const MIN_GRID_CANVAS_WIDTH = 2 * GRID_PADDING + GRID_GAP + 2;

/**
 * Resolve the canvas width for the grid metrics from the measured parent
 * width.
 *
 * @param measuredWidth - the `onLayout` width of the grid container, or
 *   `null` before the first layout event.
 * @param fallbackWidth - the window width (documented fallback; the grid
 *   normally spans the full window width).
 * @returns the canvas width to feed {@link computeGridMetrics}.
 */
export function resolveCanvasWidth(
  measuredWidth: number | null,
  fallbackWidth: number,
): number {
  if (
    measuredWidth !== null &&
    Number.isFinite(measuredWidth) &&
    measuredWidth > 0
  ) {
    return measuredWidth;
  }
  return Number.isFinite(fallbackWidth) && fallbackWidth > 0
    ? fallbackWidth
    : FALLBACK_GRID_CANVAS_WIDTH;
}

/** Sanitize a canvas width: finite, positive, never below the degenerate floor. */
function sanitizeCanvasWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) {
    return FALLBACK_GRID_CANVAS_WIDTH;
  }
  return Math.max(width, MIN_GRID_CANVAS_WIDTH);
}

/**
 * Grid pixel metrics for a given canvas width.
 *
 * @param canvasWidth - the available container width (points); invalid or
 *   unmeasured values fall back per the responsive contract above.
 * @returns cell width, padding, gap, row height (all finite positive points).
 */
export function computeGridMetrics(canvasWidth: number): {
  readonly padding: number;
  readonly gap: number;
  readonly rowHeight: number;
  readonly cellWidth: number;
} {
  const canvas = sanitizeCanvasWidth(canvasWidth);
  const cellWidth = (canvas - 2 * GRID_PADDING - GRID_GAP) / 2;
  const rowHeight = Math.min(
    Math.max(Math.round(cellWidth), GRID_ROW_HEIGHT),
    GRID_ROW_HEIGHT_MAX,
  );
  return {
    padding: GRID_PADDING,
    gap: GRID_GAP,
    rowHeight,
    cellWidth,
  };
}

/** Position + size of a cell in pixels (absolute rendering). */
export interface GridPixelRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Pixel rect for one widget cell.
 *
 * @param x - grid column.
 * @param y - grid row.
 * @param width - cell width (1|2).
 * @param height - cell height (1|2).
 * @param metrics - grid metrics from {@link computeGridMetrics}.
 */
export function pixelRect(
  x: number,
  y: number,
  width: number,
  height: number,
  metrics: {
    readonly padding: number;
    readonly gap: number;
    readonly rowHeight: number;
    readonly cellWidth: number;
  },
): GridPixelRect {
  return {
    left: metrics.padding + x * (metrics.cellWidth + metrics.gap),
    top: metrics.padding + y * (metrics.rowHeight + metrics.gap),
    width: metrics.cellWidth * width + metrics.gap * (width - 1),
    height: metrics.rowHeight * height + metrics.gap * (height - 1),
  };
}

/**
 * Snap a dragged pixel delta to the nearest grid cell step.
 *
 * @param deltaPx - pixel offset accumulated during the gesture.
 * @param stepPx - one grid step in pixels (cellW + GAP for columns;
 *   rowH + GAP for rows).
 * @returns the nearest integer cell offset (positive or negative).
 */
export function snapToGrid(deltaPx: number, stepPx: number): number {
  if (stepPx <= 0) {
    return 0;
  }
  return Math.round(deltaPx / stepPx);
}

/**
 * Canvas width (points) below which the Dashboard screen switches to the
 * stacked mobile presentation (one full-width card per row). The Settings
 * editor ALWAYS uses the absolute two-column grid regardless of width.
 */
export const STACKED_BREAKPOINT = 560;

/**
 * Grid presentation mode: `'absolute'` renders the persisted two-column
 * pixel grid (default — the editor contract); `'stacked'` renders the
 * presentation-only mobile reflow (cards in flow, one full-width card per
 * row, persisted coordinates untouched).
 */
export type GridPresentation = 'absolute' | 'stacked';

/**
 * Resolve the Dashboard presentation mode from the canvas width.
 *
 * Invalid/unmeasured widths (`NaN`, `<= 0`) resolve to `'absolute'` — the
 * safe default that keeps the persisted grid math (and the editor contract)
 * intact until a real measurement arrives.
 *
 * @param canvasWidth - the resolved canvas width (see `resolveCanvasWidth`).
 */
export function resolvePresentationMode(canvasWidth: number): GridPresentation {
  if (!Number.isFinite(canvasWidth) || canvasWidth <= 0) {
    return 'absolute';
  }
  return canvasWidth < STACKED_BREAKPOINT ? 'stacked' : 'absolute';
}

/** One widget's placement in the stacked (presentation-only) layout. */
export interface StackedPlacement {
  /** The widget id (same order as the input widgets). */
  readonly widgetId: string;
  /** Full-width rect: stacked cards ignore persisted x and render in flow. */
  readonly rect: GridPixelRect;
}

/**
 * Pure stacked-layout math (presentation-only mobile reflow).
 *
 * Cards render in the given order, ONE full-width card per row, each using
 * the widget's PERSISTED row height (`height` rows → `rowHeight * h +
 * gap * (h - 1)`). Persisted `x/y` coordinates are never read or rewritten —
 * stacking is a render-time presentation.
 *
 * @param widgets - the section's widgets in render order.
 * @param metrics - grid metrics from `computeGridMetrics` (always finite
 *   positive, so the stacked math is finite too).
 * @returns the full-width placements (same order) + the total flow height
 *   (>= one row + padding).
 */
export function stackedLayout(
  widgets: readonly {
    readonly id: string;
    readonly layout: { readonly height: number };
  }[],
  metrics: {
    readonly padding: number;
    readonly gap: number;
    readonly rowHeight: number;
    readonly cellWidth: number;
  },
): {
  readonly placements: readonly StackedPlacement[];
  readonly height: number;
} {
  const fullWidth = metrics.cellWidth * 2 + metrics.gap;
  const placements: StackedPlacement[] = [];
  let top = metrics.padding;
  for (const widget of widgets) {
    const height =
      metrics.rowHeight * widget.layout.height +
      metrics.gap * (widget.layout.height - 1);
    placements.push({
      widgetId: widget.id,
      rect: { left: metrics.padding, top, width: fullWidth, height },
    });
    top += height + metrics.gap;
  }
  // Empty grid keeps the documented one-row fallback (same as
  // `gridContentHeight`); otherwise trim the trailing gap and close the
  // bottom padding.
  const height =
    placements.length === 0
      ? metrics.rowHeight + 2 * metrics.padding
      : top - metrics.gap + metrics.padding;
  return { placements, height };
}

/**
 * Height of the grid content (points) for a set of widgets.
 *
 * The grid renders absolutely-positioned cards inside a scroll view, so the
 * container must reserve the exact height or cards on lower rows would be
 * clipped (absolute children do not grow the scroll content).
 *
 * @param widgets - the widgets laid out on the grid (row positions only).
 * @param metrics - grid metrics from {@link computeGridMetrics}.
 * @returns content height in points (>= one row + padding).
 */
export function gridContentHeight(
  widgets: readonly {
    readonly layout: { readonly y: number; readonly height: number };
  }[],
  metrics: {
    readonly padding: number;
    readonly gap: number;
    readonly rowHeight: number;
  },
): number {
  if (widgets.length === 0) {
    return metrics.rowHeight + 2 * metrics.padding;
  }
  const rows = Math.max(
    ...widgets.map(widget => widget.layout.y + widget.layout.height),
  );
  return (
    rows * metrics.rowHeight + (rows - 1) * metrics.gap + 2 * metrics.padding
  );
}
