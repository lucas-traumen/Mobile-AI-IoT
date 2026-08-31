/**
 * DashboardGrid — absolute-positioned 2-column widget grid with edit mode.
 *
 * Pure rendering + gesture handling. Grid math comes from the pure
 * `gridMetrics` module (`computeGridMetrics` / `pixelRect` / `snapToGrid`).
 *
 * Edit mode per card:
 * - drag (PanResponder): the card translates by (dx, dy); on release the
 *   target grid cell is `orig + snapToGrid(...)` and `onMoveWidget` is called.
 *   On an error result the translation is dropped (the card snaps back to its
 *   persisted position — the store did not change).
 * - remove: `×` top-right → `onRemoveWidget`.
 * - resize: bottom-right button cycles the definition's `supportedSizes` in
 *   order → `onResizeWidget`.
 */

import React, { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@core/theme';

import type { CapabilityType } from '@modules/devices/api';
import type {
  WidgetConfig,
  WidgetRegistry,
  WidgetSize,
} from '@modules/widgets/api';

import { pixelRect, snapToGrid } from '../internal/domain/gridMetrics';
import { WidgetRenderer } from './WidgetRenderer';

/** Drag threshold (points) before the PanResponder claims the gesture. */
const DRAG_THRESHOLD = 8;

interface DashboardGridProps {
  /** Widgets of the active dashboard. */
  readonly widgets: readonly WidgetConfig[];
  /** Registry used to resolve widget components. */
  readonly registry: WidgetRegistry;
  /** True while the user is rearranging widgets. */
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
  onMoveWidget,
  onResizeWidget,
  onRemoveWidget,
  onRebindWidget,
}: DashboardGridProps) {
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
        />
      ))}
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
}: {
  widget: WidgetConfig;
  registry: WidgetRegistry;
  editMode: boolean;
  metrics: DashboardGridProps['metrics'];
  onMoveWidget: DashboardGridProps['onMoveWidget'];
  onResizeWidget: DashboardGridProps['onResizeWidget'];
  onRemoveWidget: DashboardGridProps['onRemoveWidget'];
  onRebindWidget: DashboardGridProps['onRebindWidget'];
}) {
  const { tokens } = useTheme();
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);

  const rect = useMemo(
    () =>
      pixelRect(
        widget.layout.x,
        widget.layout.y,
        widget.layout.width,
        widget.layout.height,
        metrics,
      ),
    [widget.layout, metrics],
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
        const nextX =
          widget.layout.x +
          snapToGrid(gesture.dx, metrics.cellWidth + metrics.gap);
        const nextY =
          widget.layout.y +
          snapToGrid(gesture.dy, metrics.rowHeight + metrics.gap);
        if (nextX === widget.layout.x && nextY === widget.layout.y) {
          return;
        }
        onMoveWidget(widget.id, nextX, nextY);
      },
      onPanResponderTerminate: () => {
        setDrag(null);
      },
      onPanResponderTerminationRequest: () => false,
    });
    // `rect`/`metrics` only change when the layout changes (never mid-gesture);
    // the responder reads the delta from `gesture` — no refs required.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, rect, widget.id, widget.layout.x, widget.layout.y, metrics]);

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
          ...tokens.cardShadow,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        drag
          ? {
              transform: [{ translateX: drag.dx }, { translateY: drag.dy }],
              zIndex: 10,
              opacity: 0.92,
            }
          : null,
      ]}
    >
      <View
        style={[
          styles.cardInner,
          { backgroundColor: tokens.surface, borderColor: tokens.border },
        ]}
      >
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
  // Outer card carries the elevation shadow; the inner view clips content
  // (overflow hidden on the outer would clip the iOS shadow).
  card: {
    position: 'absolute',
    borderRadius: 12,
  },
  cardInner: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
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
