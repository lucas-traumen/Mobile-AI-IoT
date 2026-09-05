/**
 * DashboardGrid — the widget card grid with two presentation modes.
 *
 * DEFAULT `'absolute'` (the editor contract): absolute-positioned 2-column
 * grid driven by the persisted coordinates. Pure rendering + gesture
 * handling; grid math comes from the pure `gridMetrics` module
 * (`computeGridMetrics` / `pixelRect` / `snapToGrid`).
 *
 * Edit mode per card (absolute mode only):
 * - drag (PanResponder): the card translates by (dx, dy); on release the
 *   target grid cell is `orig + snapToGrid(...)` and `onMoveWidget` is
 *   called. On an error result the translation is dropped (the card snaps
 *   back to its persisted position — the store did not change). Dropping
 *   onto a cell OCCUPIED by another widget of the same grid swaps the two
 *   positions via the opt-in `onSwapWidgets` seam (fix cycle 8 L, the room
 *   editor) instead of the doomed move. Targets that would render the card
 *   above its section (negative section-local row, fix cycle 8 H) are
 *   rejected before any callback, AND the in-flight translation is clamped
 *   to the section so the dragged card can never be seen above its section
 *   container DURING the gesture either ({@link clampedDragTranslation},
 *   fix cycle 8 H completion).
 * - remove: `×` top-right → `onRemoveWidget`.
 * - resize: bottom-right button cycles the definition's `supportedSizes` in
 *   order → `onResizeWidget`.
 *
 * OPT-IN `'stacked'` (Dashboard narrow-canvas reflow, presentation-only):
 * cards render in flow — one full-width card per row in the given order,
 * each using the widget's PERSISTED row height while the persisted `x/y`
 * coordinates are never read or rewritten (no drag/resize/remove chrome:
 * the stacked mode is a view-only presentation; the editor never uses it).
 *
 * Card appearance seam (opt-in): `'default'` (the editor contract) renders
 * neutral theme surfaces (surface + border, no tint); `'gel'` — used ONLY
 * by the Dashboard screen — paints each card with the public
 * `resolveCardTint(widget, tokens)` pastel tint, the existing `cardShadow`
 * elevation and the translucent `cardInnerEdge` rim (the History card
 * recipe) in BOTH absolute and stacked presentations.
 */

import React, { useMemo, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { useTheme, type ThemeTokens } from '@core/theme';
import { STRINGS } from '@core/i18n';

import { resolveCardTint } from '@modules/widgets/api';
import type { CapabilityType } from '@modules/devices/api';
import type {
  WidgetConfig,
  WidgetRegistry,
  WidgetSize,
} from '@modules/widgets/api';

import { collides, inBounds, type GridCell } from '../internal/domain/layout';
import {
  pixelRect,
  snapToGrid,
  stackedLayout,
  type GridPresentation,
} from '../internal/domain/gridMetrics';
import { WidgetRenderer } from './WidgetRenderer';

/** Drag threshold (points) before the PanResponder claims the gesture. */
const DRAG_THRESHOLD = 8;

/**
 * Card surface appearance:
 * - `'default'` — neutral theme surface + hairline border (the Settings
 *   editor contract; also the default for every existing caller),
 * - `'gel'` — Dashboard-only pastel tint (resolveCardTint) + card shadow +
 *   translucent gel inner edge (the History card recipe).
 */
export type DashboardCardAppearance = 'default' | 'gel';

/**
 * Pure drag-release target for one widget card (section-aware).
 *
 * The card visually lives at row `layout.y - layoutYOffset` (section-local),
 * so the release target is computed in section-local rows and then REBASED
 * to the absolute persisted row (`+ layoutYOffset`) before handing it to
 * `onMoveWidget` — the store keeps dashboard-absolute coords. With the
 * default offset 0 this is exactly the legacy math (`y + snap`).
 *
 * Section-local containment (fix cycle 8 H): the rebase can keep the
 * PERSISTED row valid (≥ 0) while the SECTION-LOCAL row went negative —
 * the card would render above its section container, overlapping the
 * previous section. Such targets are REJECTED (`null` → no move, no
 * highlight, the card snaps back) at this validation level — the target is
 * never clamped to a different row and nothing is hidden by clipping, so
 * the invalid release cannot happen instead of merely not being drawn.
 * (The in-flight VISUAL containment is a separate, active constraint — see
 * {@link clampedDragTranslation}.)
 *
 * @returns the move target, or `null` when the gesture snapped back to the
 *   card's current cell (nothing changed → no callback) or the target
 *   escapes the section (negative section-local row).
 */
export function moveTarget(
  widget: WidgetConfig,
  dx: number,
  dy: number,
  metrics: {
    readonly padding: number;
    readonly gap: number;
    readonly rowHeight: number;
    readonly cellWidth: number;
  },
  layoutYOffset: number,
): {
  readonly widgetId: string;
  readonly x: number;
  readonly y: number;
} | null {
  const x = widget.layout.x + snapToGrid(dx, metrics.cellWidth + metrics.gap);
  const localY =
    widget.layout.y -
    layoutYOffset +
    snapToGrid(dy, metrics.rowHeight + metrics.gap);
  if (x === widget.layout.x && localY === widget.layout.y - layoutYOffset) {
    return null;
  }
  if (localY < 0) {
    return null;
  }
  return { widgetId: widget.id, x, y: localY + layoutYOffset };
}

/**
 * The dragged card's IN-FLIGHT translation, clamped to its section (fix
 * cycle 8 H completion — reviewer major): while the finger moves, the card
 * follows the gesture, and the raw `dy` stored during a drag previously
 * let a section's base-row card visibly rise ABOVE its own grid. The
 * card's visual top inside the grid
 * is `rect.top` — the SAME section-local pixel rect the card renders with
 * (`pixelRect(x, y - layoutYOffset, …)`, derived from the widget's own
 * layout) — so an upward `dy` is clamped to `-rect.top`: the translated
 * top stops at the section container's top edge and can never rise above
 * it. Downward and horizontal deltas pass through untouched, and a drag
 * that stays inside the section feels exactly as before.
 *
 * This is an ACTIVE transform constraint on the gesture translation — not
 * a clipping/overflow workaround — so the invalid position never exists
 * on screen at all. It completes (does not replace) the validation-level
 * rejection in {@link moveTarget}: the raw gesture still feeds the
 * highlight/release math, a section-escaping release still yields `null`
 * → no highlight, no move callback, snap back.
 */
export function clampedDragTranslation(
  widget: WidgetConfig,
  dx: number,
  dy: number,
  metrics: {
    readonly padding: number;
    readonly gap: number;
    readonly rowHeight: number;
    readonly cellWidth: number;
  },
  layoutYOffset: number,
): { readonly dx: number; readonly dy: number } {
  const top = pixelRect(
    widget.layout.x,
    widget.layout.y - layoutYOffset,
    widget.layout.width,
    widget.layout.height,
    metrics,
  ).top;
  return { dx, dy: Math.max(dy, -top) };
}

/**
 * Pure drag-HIGHLIGHT target for one widget card (user-requested drag
 * feedback): the prospective destination cell (with the widget's span)
 * while the card is held — or `null` when there is NO highlight:
 * - the gesture has not left the card's current cell (snap-back, no move),
 * - or the computed target is OUT OF BOUNDS (the release would be rejected
 *   by the store — no false promise),
 * - or the target would escape the section (negative section-local row —
 *   fix cycle 8 H, via the same rejection as {@link moveTarget}).
 * Section-aware: the same rebase as {@link moveTarget} (the highlight
 * renders section-locally, like the cards). Presentation-only — nothing
 * here reads or writes persisted coordinates.
 */
export function dragTargetCell(
  widget: WidgetConfig,
  dx: number,
  dy: number,
  metrics: {
    readonly padding: number;
    readonly gap: number;
    readonly rowHeight: number;
    readonly cellWidth: number;
  },
  layoutYOffset: number,
): GridCell | null {
  const target = moveTarget(widget, dx, dy, metrics, layoutYOffset);
  if (!target) {
    return null;
  }
  const cell: GridCell = {
    x: target.x,
    y: target.y,
    width: widget.layout.width,
    height: widget.layout.height,
  };
  return inBounds(cell) ? cell : null;
}

/**
 * Pure drop OCCUPANT for one widget card (fix cycle 8 L — drag-to-swap):
 * the FIRST other widget of the grid whose layout overlaps the drop target
 * cell — the swap partner (array order = section order, deterministic).
 * `null` when the drop lands on free space (a plain `onMoveWidget` move).
 *
 * Section-scope note: this grid receives exactly ONE section group, so an
 * occupant of the OTHER section is invisible here — such a drop keeps the
 * plain-move path and is rejected by the store's overlap rule exactly as
 * today (the store's swap guard re-checks the section authority anyway).
 *
 * @param target - the rebased (persisted-coordinates) drop cell, with the
 *   dragged widget's span.
 * @param widgets - the grid's own widgets (one section group).
 * @param draggedId - the dragged widget (never its own occupant).
 */
export function dropOccupant(
  target: GridCell,
  widgets: readonly WidgetConfig[],
  draggedId: string,
): WidgetConfig | null {
  return (
    widgets.find(
      widget => widget.id !== draggedId && collides(widget.layout, target),
    ) ?? null
  );
}

interface DashboardGridProps {
  /** Widgets of the active dashboard. */
  readonly widgets: readonly WidgetConfig[];
  /** Registry used to resolve widget components. */
  readonly registry: WidgetRegistry;
  /** True while the user is rearranging widgets (absolute mode only). */
  readonly editMode: boolean;
  /**
   * Grid pixel metrics — computed from the MEASURED canvas width upstream
   * (`onLayout` on the grid shell → `resolveCanvasWidth` →
   * `computeGridMetrics`). The same metrics instance drives the rendered
   * rects and the drag snapping.
   */
  readonly metrics: {
    readonly padding: number;
    readonly gap: number;
    readonly rowHeight: number;
    readonly cellWidth: number;
  };
  /**
   * Presentation mode. `'absolute'` (default) renders the persisted
   * two-column pixel grid — the Settings editor path, unchanged.
   * `'stacked'` renders the view-only mobile reflow (one full-width card
   * per row, persisted coords untouched).
   */
  readonly presentation?: GridPresentation;
  /**
   * Move a widget to a grid cell. Returns `false` when rejected (the card
   * snaps back to its last position because the source list did not change).
   */
  readonly onMoveWidget: (widgetId: string, x: number, y: number) => boolean;
  /**
   * Swap TWO widgets' positions (fix cycle 8 L — editor drag-to-swap):
   * called INSTEAD of `onMoveWidget` when the release target cell is
   * occupied by ANOTHER widget of this grid. `false` → the swap was
   * rejected (both cards snap back — the source list did not change).
   * Omitted on view surfaces (no edit mode there): an occupied-cell drop
   * then issues no callback and snaps back — the same visible outcome as
   * the legacy rejected move.
   */
  readonly onSwapWidgets?: (widgetIdA: string, widgetIdB: string) => boolean;
  /** Cycle a widget to a new size (`false` → keep the current size). */
  readonly onResizeWidget: (widgetId: string, size: WidgetSize) => boolean;
  /** Remove a widget. */
  readonly onRemoveWidget: (widgetId: string) => void;
  /** Repair a lost binding (device + capability picker result). */
  readonly onRebindWidget?: (
    widgetId: string,
    deviceId: string,
    capability: CapabilityType,
  ) => void;
  /**
   * Row offset for SECTION rendering (M2 label fix): when the screen renders
   * one section group (e.g. the devices group seeded at persisted rows 1..2)
   * in its own grid, it passes the group's minimum persisted row here so the
   * group renders compactly at the top of its own grid — cards draw at
   * `y - layoutYOffset` — while move gestures re-base the section-local
   * target back to the absolute persisted row (`y + layoutYOffset`).
   * Default 0: the full-layout editor passes nothing and behaves unchanged.
   * Ignored in stacked mode (cards render in flow).
   */
  readonly layoutYOffset?: number;
  /**
   * Card surface appearance (opt-in seam). `'default'` (omitted) keeps the
   * neutral editor-safe surface; `'gel'` applies the Dashboard-only pastel
   * tint + card shadow + gel inner edge. The Settings editor never passes
   * this, so its contract is unchanged.
   */
  readonly cardAppearance?: DashboardCardAppearance;
  /**
   * Non-overlapping editor chrome (opt-in seam, approved layout repair).
   * When `editMode` is true AND this is set, the move/delete/resize
   * controls render in a dedicated chrome BAR at the top of each card and
   * the widget content shifts down — controls can never cover widget
   * icons, titles, values or switches. Without it (default), edit mode
   * keeps the legacy overlay controls (unchanged behavior for any caller
   * that does not opt in). View mode is unaffected either way.
   */
  readonly editorChrome?: boolean;
  /**
   * Per-card overflow menu (opt-in seam, Template-room editor): when set,
   * the chrome bar renders a "⋯" button calling `onWidgetMenu(widget.id)`
   * (rename/configure/duplicate/move/delete live in the editor's menu).
   * Ignored in stacked mode and view mode.
   */
  readonly onWidgetMenu?: (widgetId: string) => void;
}

/**
 * The widget grid container.
 *
 * @param props - see {@link DashboardGridProps}.
 */
export function DashboardGrid({
  widgets,
  registry,
  editMode,
  metrics,
  presentation = 'absolute',
  onMoveWidget,
  onSwapWidgets,
  onResizeWidget,
  onRemoveWidget,
  onRebindWidget,
  layoutYOffset = 0,
  cardAppearance = 'default',
  editorChrome = false,
  onWidgetMenu,
}: DashboardGridProps) {
  const stacked = presentation === 'stacked';
  const { tokens } = useTheme();
  // Stacked placements (view-only reflow): computed once per layout change.
  // Order matches `widgets` — the caller passes the section group order.
  const stackedRects = useMemo(
    () =>
      stacked
        ? stackedLayout(widgets, metrics).placements.map(
            placement => placement.rect,
          )
        : null,
    [stacked, widgets, metrics],
  );

  /**
   * The grid is the highlight's owner (one highlight per grid): while a
   * card drag is active, the card reports its prospective destination cell
   * (or `null` to clear) through this stable setter — see
   * {@link dragTargetCell}. Declared before any early return so the hook
   * order is unconditional.
   */
  const [dragHighlight, setDragHighlight] = useState<GridCell | null>(null);
  // Section-local pixel rect (same rebase the cards use: `y - offsetY`).
  const highlightRect = dragHighlight
    ? pixelRect(
        dragHighlight.x,
        dragHighlight.y - layoutYOffset,
        dragHighlight.width,
        dragHighlight.height,
        metrics,
      )
    : null;

  if (stacked && stackedRects) {
    // Flow rendering of the pure placement math: the container carries the
    // helper's leading/trailing inset (`padding`) and inter-card gap
    // (`rowGap`), so Yoga resolves card i's flow top to padding +
    // Σ(height_j + gap) — exactly `rect.top` — and places the row at
    // `rect.left`. No absolute positioning, no persisted-coordinate reads.
    return (
      <View
        style={[
          styles.gridStacked,
          { padding: metrics.padding, rowGap: metrics.gap },
        ]}
      >
        {widgets.map((widget, index) => (
          <StackedCard
            key={widget.id}
            widget={widget}
            rect={stackedRects[index]}
            registry={registry}
            cardAppearance={cardAppearance}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {highlightRect ? (
        <View
          pointerEvents="none"
          testID="drag-highlight"
          style={[
            styles.dragHighlight,
            {
              left: highlightRect.left,
              top: highlightRect.top,
              width: highlightRect.width,
              height: highlightRect.height,
              // Translucent primary tint + border (gel-aesthetic, subtle).
              backgroundColor: tokens.primary,
              borderColor: tokens.primary,
              opacity: 0.18,
            },
          ]}
        />
      ) : null}
      {widgets.map(widget => (
        <WidgetCard
          key={widget.id}
          widget={widget}
          sectionWidgets={widgets}
          registry={registry}
          editMode={editMode}
          metrics={metrics}
          onMoveWidget={onMoveWidget}
          onSwapWidgets={onSwapWidgets}
          onResizeWidget={onResizeWidget}
          onRemoveWidget={onRemoveWidget}
          onRebindWidget={onRebindWidget}
          layoutYOffset={layoutYOffset}
          cardAppearance={cardAppearance}
          editorChrome={editorChrome}
          onWidgetMenu={onWidgetMenu}
          onDragTarget={setDragHighlight}
        />
      ))}
    </View>
  );
}

/**
 * Pure card-surface layers for the opt-in appearance seam (see
 * {@link DashboardCardAppearance}): `'gel'` paints the public
 * `resolveCardTint` pastel tint + existing card shadow on the OUTER card
 * view and drops the neutral inner border (the translucent gel rim renders
 * instead — the History card recipe); `'default'` keeps the neutral theme
 * surface + border and adds nothing.
 */
function cardSurfaceLayers(
  widget: WidgetConfig,
  tokens: ThemeTokens,
  cardAppearance: DashboardCardAppearance,
): { outer: ViewStyle[]; inner: ViewStyle[]; gelEdge: boolean } {
  if (cardAppearance === 'gel') {
    return {
      outer: [
        { backgroundColor: resolveCardTint(widget, tokens) },
        tokens.cardShadow,
      ],
      inner: [{ borderWidth: 0 }],
      gelEdge: true,
    };
  }
  return {
    outer: [],
    inner: [{ backgroundColor: tokens.surface, borderColor: tokens.border }],
    gelEdge: false,
  };
}

/**
 * One stacked (view-only) card: full-width rect from the pure placement
 * math, no drag/resize chrome. The rect's `left`/`top` insets are
 * represented by the CONTAINER (padding + rowGap — see the stacked branch
 * above), so this card carries only its rect size: spacing is owned by the
 * container alone and nothing double-counts the padding/gap. Persisted
 * coordinates are untouched. Surface follows the opt-in appearance seam.
 */
function StackedCard({
  widget,
  rect,
  registry,
  cardAppearance,
}: {
  widget: WidgetConfig;
  rect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  registry: WidgetRegistry;
  cardAppearance: DashboardCardAppearance;
}) {
  const { tokens } = useTheme();
  const { outer, inner, gelEdge } = cardSurfaceLayers(
    widget,
    tokens,
    cardAppearance,
  );
  return (
    <View
      testID={`dashboard-stacked-card-${widget.id}`}
      style={[
        styles.cardSurface,
        { width: rect.width, height: rect.height },
        ...outer,
      ]}
    >
      <View style={[styles.cardInner, ...inner]}>
        {gelEdge ? (
          <View
            style={[styles.cardGelEdge, { borderColor: tokens.cardInnerEdge }]}
            pointerEvents="none"
          />
        ) : null}
        <View style={styles.widgetContent}>
          <WidgetRenderer registry={registry} config={widget} />
        </View>
      </View>
    </View>
  );
}

/** The next size in the definition's supportedSizes order (wrapping). */
function nextCycledSize(
  widget: WidgetConfig,
  supportedSizes: readonly WidgetSize[],
): WidgetSize | null {
  if (supportedSizes.length === 0) {
    return null;
  }
  if (supportedSizes.length === 1) {
    return supportedSizes[0] ===
      `${widget.layout.width}x${widget.layout.height}`
      ? null
      : supportedSizes[0];
  }
  const current =
    `${widget.layout.width}x${widget.layout.height}` as WidgetSize;
  const index = supportedSizes.indexOf(current);
  if (index === -1) {
    return supportedSizes[0];
  }
  return supportedSizes[(index + 1) % supportedSizes.length];
}

function WidgetCard({
  widget,
  sectionWidgets,
  registry,
  editMode,
  metrics,
  onMoveWidget,
  onSwapWidgets,
  onResizeWidget,
  onRemoveWidget,
  onRebindWidget,
  layoutYOffset,
  cardAppearance,
  editorChrome,
  onWidgetMenu,
  onDragTarget,
}: {
  widget: WidgetConfig;
  /** The grid's own widget list (one section group — the swap search space). */
  sectionWidgets: readonly WidgetConfig[];
  registry: WidgetRegistry;
  editMode: boolean;
  metrics: DashboardGridProps['metrics'];
  onMoveWidget: DashboardGridProps['onMoveWidget'];
  onSwapWidgets?: DashboardGridProps['onSwapWidgets'];
  onResizeWidget: DashboardGridProps['onResizeWidget'];
  onRemoveWidget: DashboardGridProps['onRemoveWidget'];
  onRebindWidget: DashboardGridProps['onRebindWidget'];
  layoutYOffset: number;
  cardAppearance: DashboardCardAppearance;
  editorChrome: boolean;
  onWidgetMenu?: DashboardGridProps['onWidgetMenu'];
  /** Report the prospective destination cell while dragging (null clears). */
  onDragTarget?: (cell: GridCell | null) => void;
}) {
  const { tokens } = useTheme();
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  // Opt-in card surface: neutral editor default or Dashboard gel recipe.
  const { outer, inner, gelEdge } = cardSurfaceLayers(
    widget,
    tokens,
    cardAppearance,
  );

  // Non-overlapping chrome layout (opt-in): a dedicated bar owns the
  // move/delete/resize controls and the widget content shifts below it.
  const chromeBar = editMode && editorChrome;

  // Section rebase: draw the card at its section-local row (`y -
  // layoutYOffset`) — persisted coords stay dashboard-absolute.
  const rect = useMemo(
    () =>
      pixelRect(
        widget.layout.x,
        widget.layout.y - layoutYOffset,
        widget.layout.width,
        widget.layout.height,
        metrics,
      ),
    [widget.layout, layoutYOffset, metrics],
  );

  const panResponder = useMemo(() => {
    if (!editMode) {
      return null;
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) + Math.abs(gesture.dy) > DRAG_THRESHOLD,
      onPanResponderGrant: () => {
        setDrag({ dx: 0, dy: 0 });
        onDragTarget?.(dragTargetCell(widget, 0, 0, metrics, layoutYOffset));
      },
      onPanResponderMove: (_, gesture) => {
        // In-flight visual containment (fix cycle 8 H completion): the
        // STORED translation is clamped to the section, so the dragged
        // card can never render above its section container while it
        // follows the finger. The RAW gesture still feeds the destination
        // feedback below — the validation-level rejection (moveTarget
        // null → no highlight, no release callback, snap back) is
        // unchanged.
        setDrag(
          clampedDragTranslation(
            widget,
            gesture.dx,
            gesture.dy,
            metrics,
            layoutYOffset,
          ),
        );
        // Live destination feedback (null when unchanged/out of bounds).
        onDragTarget?.(
          dragTargetCell(
            widget,
            gesture.dx,
            gesture.dy,
            metrics,
            layoutYOffset,
          ),
        );
      },
      onPanResponderRelease: (_, gesture) => {
        // Reset gesture state first — when the draft store rejects the move
        // the card snaps back (the source list did not change).
        setDrag(null);
        onDragTarget?.(null);
        // Section-aware move math: re-bases the section-local drag target
        // back to the absolute persisted row before the callback (a
        // section-escaping target is already rejected inside).
        const target = moveTarget(
          widget,
          gesture.dx,
          gesture.dy,
          metrics,
          layoutYOffset,
        );
        if (!target) {
          return;
        }
        // Drag-to-swap resolution (fix cycle 8 L): an OCCUPIED drop cell
        // (another widget of this section overlaps the target) exchanges
        // the two positions via the swap seam; a free cell keeps the plain
        // move. A rejected swap (`false`) leaves the draft untouched → the
        // cards snap back, the same UX as a rejected move. A cross-section
        // occupant is invisible to this grid → the plain move runs and the
        // store rejects it exactly as today.
        const cell: GridCell = {
          x: target.x,
          y: target.y,
          width: widget.layout.width,
          height: widget.layout.height,
        };
        const occupant = dropOccupant(cell, sectionWidgets, widget.id);
        if (occupant) {
          onSwapWidgets?.(widget.id, occupant.id);
          return;
        }
        onMoveWidget(target.widgetId, target.x, target.y);
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        onDragTarget?.(null);
      },
      onPanResponderTerminationRequest: () => false,
    });
    // `rect`/`metrics` only change when the layout changes (never mid-gesture);
    // the responder reads the delta from `gesture` — no refs required.
    // `onDragTarget` is the grid's stable setState. The drag/occupant math
    // is computed per-move by the PURE `dragTargetCell`/`dropOccupant`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editMode,
    rect,
    widget.id,
    widget.layout.x,
    widget.layout.y,
    metrics,
    layoutYOffset,
    sectionWidgets,
    onSwapWidgets,
  ]);

  const definition = registry.get(widget.type);
  const nextSize = definition
    ? nextCycledSize(widget, definition.supportedSizes)
    : null;

  const chromeControls = editMode ? (
    chromeBar ? (
      // Editor chrome BAR: controls live in their own row, never on top of
      // the widget content.
      <View
        style={[styles.chromeBar, { backgroundColor: tokens.surfaceElevated }]}
        pointerEvents="box-none"
      >
        <View
          style={[styles.dragHandleInline, { backgroundColor: tokens.border }]}
        >
          <Text
            style={[styles.dragHandleText, { color: tokens.textSecondary }]}
          >
            {'\u22ee\u22ee'}
          </Text>
        </View>
        <View style={styles.chromeSpacer} />
        {onWidgetMenu ? (
          <Pressable
            style={[
              styles.chromeButton,
              { backgroundColor: tokens.surfaceElevated },
            ]}
            onPress={() => {
              onWidgetMenu(widget.id);
            }}
            accessibilityLabel={`${STRINGS.templates.widgetMenu} ${
              widget.title ?? widget.type
            }`}
            testID={`widget-chrome-menu-${widget.id}`}
          >
            <Text
              style={[styles.overlayButtonText, { color: tokens.textPrimary }]}
            >
              {'\u22ef'}
            </Text>
          </Pressable>
        ) : null}
        {nextSize ? (
          <Pressable
            style={[styles.chromeButton, { backgroundColor: tokens.primary }]}
            onPress={() => {
              onResizeWidget(widget.id, nextSize);
            }}
            accessibilityLabel={`${STRINGS.dashboard.resize} ${nextSize}`}
          >
            <Text
              style={[styles.overlayButtonText, { color: tokens.onPrimary }]}
            >
              {nextSize}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.chromeButton, { backgroundColor: tokens.danger }]}
          onPress={() => {
            onRemoveWidget(widget.id);
          }}
          accessibilityLabel={STRINGS.dashboard.deleteWidget}
        >
          <Text style={[styles.overlayButtonText, { color: tokens.onPrimary }]}>
            {'−'}
          </Text>
        </Pressable>
      </View>
    ) : (
      // Legacy overlay controls (default, unchanged for existing callers).
      <>
        <View style={[styles.dragHandle, { backgroundColor: tokens.border }]}>
          <Text
            style={[styles.dragHandleText, { color: tokens.textSecondary }]}
          >
            {'\u22ee\u22ee'}
          </Text>
        </View>
        <Pressable
          style={[
            styles.overlayButton,
            styles.removeButton,
            { backgroundColor: tokens.danger },
          ]}
          onPress={() => {
            onRemoveWidget(widget.id);
          }}
        >
          <Text style={[styles.overlayButtonText, { color: tokens.onPrimary }]}>
            {'−'}
          </Text>
        </Pressable>
        {nextSize ? (
          <Pressable
            style={[
              styles.overlayButton,
              styles.resizeButton,
              { backgroundColor: tokens.primary },
            ]}
            onPress={() => {
              onResizeWidget(widget.id, nextSize);
            }}
          >
            <Text
              style={[styles.overlayButtonText, { color: tokens.onPrimary }]}
            >
              {nextSize}
            </Text>
          </Pressable>
        ) : null}
      </>
    )
  ) : null;

  return (
    <View
      {...(panResponder?.panHandlers ?? {})}
      style={[
        styles.card,
        {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        ...outer,
        drag
          ? {
              // The stored translation is already section-clamped
              // (clampedDragTranslation) — the card can never render above
              // its section container mid-gesture.
              transform: [{ translateX: drag.dx }, { translateY: drag.dy }],
              zIndex: 10,
              opacity: 0.92,
            }
          : null,
      ]}
    >
      <View style={[styles.cardInner, ...inner]}>
        {gelEdge ? (
          <View
            style={[styles.cardGelEdge, { borderColor: tokens.cardInnerEdge }]}
            pointerEvents="none"
          />
        ) : null}
        {/* Chrome bar (opt-in): in flow ABOVE the content — no overlap. */}
        {chromeBar ? chromeControls : null}
        <View
          style={chromeBar ? styles.widgetContentChrome : styles.widgetContent}
          pointerEvents={editMode ? 'none' : 'auto'}
        >
          <WidgetRenderer
            registry={registry}
            config={widget}
            onRebind={
              onRebindWidget
                ? (deviceId, capability) =>
                    onRebindWidget(widget.id, deviceId, capability)
                : undefined
            }
          />
        </View>
        {/* Legacy overlay controls (absolute, default callers unchanged). */}
        {!chromeBar ? chromeControls : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1 },
  // Stacked flow container: cards stack in document order (no absolute
  // positioning). The metrics-derived inset/gap are applied inline by the
  // stacked branch (`padding` + `rowGap` from the placement math); this
  // static style only opts out of the absolute grid's `flex: 1`.
  gridStacked: {},
  // Absolute-mode card: positioned inline per the pixel math.
  card: {
    position: 'absolute',
    borderRadius: 14,
  },
  // Drag destination feedback (editor only — view mode has no responder):
  // a translucent primary tint + border over the prospective cells, above
  // sibling cards (zIndex 5) but below the dragged card (zIndex 10).
  // Presentation-only: cleared on drop/cancel, never persisted.
  dragHighlight: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2,
    zIndex: 5,
  },
  // Shared card surface recipe: the colors come from the active tokens via
  // the inline layers (`cardSurfaceLayers` — neutral default or gel opt-in).
  cardSurface: { borderRadius: 14 },
  cardInner: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  // Translucent gel rim just inside the card edge (History card recipe);
  // rendered only in the opt-in gel appearance, clipped by `cardInner`.
  cardGelEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    borderWidth: 1,
  },
  widgetContent: { flex: 1 },
  // Non-overlapping editor chrome (opt-in `editorChrome`): the bar occupies
  // its own flow row above the widget content, so the content area (flex:1
  // below) can never be covered by the move/delete/resize controls.
  widgetContentChrome: { flex: 1, paddingTop: 6 },
  chromeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  dragHandleInline: {
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  chromeSpacer: { flex: 1 },
  chromeButton: {
    minWidth: 30,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dragHandleText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  overlayButton: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: { top: 6, right: 6 },
  resizeButton: { bottom: 6, right: 6 },
  overlayButtonText: { fontWeight: '700', fontSize: 13 },
});
