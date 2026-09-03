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
 *   back to its persisted position — the store did not change).
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

import { resolveCardTint } from '@modules/widgets/api';
import type { CapabilityType } from '@modules/devices/api';
import type {
  WidgetConfig,
  WidgetRegistry,
  WidgetSize,
} from '@modules/widgets/api';

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
 * @returns the move target, or `null` when the gesture snapped back to the
 *   card's current cell (nothing changed → no callback).
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
  return { widgetId: widget.id, x, y: localY + layoutYOffset };
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
  onResizeWidget,
  onRemoveWidget,
  onRebindWidget,
  layoutYOffset = 0,
  cardAppearance = 'default',
}: DashboardGridProps) {
  const stacked = presentation === 'stacked';
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
      {widgets.map(widget => (
        <WidgetCard
          key={widget.id}
          widget={widget}
          registry={registry}
          editMode={editMode}
          metrics={metrics}
          onMoveWidget={onMoveWidget}
          onResizeWidget={onResizeWidget}
          onRemoveWidget={onRemoveWidget}
          onRebindWidget={onRebindWidget}
          layoutYOffset={layoutYOffset}
          cardAppearance={cardAppearance}
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
  registry,
  editMode,
  metrics,
  onMoveWidget,
  onResizeWidget,
  onRemoveWidget,
  onRebindWidget,
  layoutYOffset,
  cardAppearance,
}: {
  widget: WidgetConfig;
  registry: WidgetRegistry;
  editMode: boolean;
  metrics: DashboardGridProps['metrics'];
  onMoveWidget: DashboardGridProps['onMoveWidget'];
  onResizeWidget: DashboardGridProps['onResizeWidget'];
  onRemoveWidget: DashboardGridProps['onRemoveWidget'];
  onRebindWidget: DashboardGridProps['onRebindWidget'];
  layoutYOffset: number;
  cardAppearance: DashboardCardAppearance;
}) {
  const { tokens } = useTheme();
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  // Opt-in card surface: neutral editor default or Dashboard gel recipe.
  const { outer, inner, gelEdge } = cardSurfaceLayers(
    widget,
    tokens,
    cardAppearance,
  );

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
      },
      onPanResponderMove: (_, gesture) =>
        setDrag({ dx: gesture.dx, dy: gesture.dy }),
      onPanResponderRelease: (_, gesture) => {
        // Reset gesture state first — when the draft store rejects the move
        // the card snaps back (the source list did not change).
        setDrag(null);
        // Section-aware move math: re-bases the section-local drag target
        // back to the absolute persisted row before the callback.
        const target = moveTarget(
          widget,
          gesture.dx,
          gesture.dy,
          metrics,
          layoutYOffset,
        );
        if (target) {
          onMoveWidget(target.widgetId, target.x, target.y);
        }
      },
      onPanResponderTerminate: () => {
        setDrag(null);
      },
      onPanResponderTerminationRequest: () => false,
    });
    // `rect`/`metrics` only change when the layout changes (never mid-gesture);
    // the responder reads the delta from `gesture` — no refs required.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editMode,
    rect,
    widget.id,
    widget.layout.x,
    widget.layout.y,
    metrics,
    layoutYOffset,
  ]);

  const definition = registry.get(widget.type);
  const nextSize = definition
    ? nextCycledSize(widget, definition.supportedSizes)
    : null;

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
        <View
          style={styles.widgetContent}
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
        {editMode ? (
          <>
            <View
              style={[styles.dragHandle, { backgroundColor: tokens.border }]}
            >
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
              <Text
                style={[styles.overlayButtonText, { color: tokens.onPrimary }]}
              >
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
                  style={[
                    styles.overlayButtonText,
                    { color: tokens.onPrimary },
                  ]}
                >
                  {nextSize}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
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
