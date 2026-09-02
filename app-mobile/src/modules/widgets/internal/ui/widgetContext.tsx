/**
 * Widget services context — the runtime services a widget may use.
 *
 * Widgets never import other modules or core services directly (D8): the app
 * composition root wraps the dashboard tree in a {@link WidgetServicesProvider}
 * with real implementations. A widget receives its services through
 * {@link useWidgetServices} so it stays decoupled and unit-testable.
 *
 * NOTE: only types are defined here for now — CP5 wires the real adapters in
 * the composition root. Widget components must tolerate `undefined` results
 * (no value yet, no history data, no connection).
 */

import React, {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { AppErrorCode, Result } from '@core/errors';
import type { AppError } from '@core/errors';
import type { ConnectionState } from '@core/events';
import type {
  CapabilityDef,
  CapabilityType,
  Device,
  DeviceCapabilityValue,
  Room,
  SeriesPoint,
} from '@modules/devices/api';
import type { HistoryQuery, HistorySeries } from '@modules/history/api';

/**
 * Connection snapshot (state + user-facing label + error cause).
 *
 * The built-in `connection` widget was retired (Phase 1): global MQTT status
 * is shown by the Dashboard header badge, so widgets no longer read it.
 * The type stays here because the dashboard screen maps its telemetry
 * snapshot to this shape.
 */
export interface WidgetConnectionState {
  readonly state: ConnectionState;
  readonly label: string;
  /**
   * Machine-readable cause of the last failed connection (CP5); present only
   * while offline. Widgets map it to a friendly sentence via `errorLabel`.
   */
  readonly errorCode?: AppErrorCode;
}

/** Runtime services exposed to widget components through React context. */
export interface WidgetServices {
  /** Live (or last-known) value for a device capability. */
  getState(
    deviceId: string,
    capability: CapabilityType,
  ): DeviceCapabilityValue | undefined;
  /**
   * Recent timestamped numeric series for a device capability (CP6 sparkline
   * + "so với 1 giờ trước" delta source).
   */
  getSeries(
    deviceId: string,
    capability: CapabilityType,
  ): readonly SeriesPoint[];
  /** Send a boolean command to a device capability (`switch` → relay). */
  sendCommand(
    deviceId: string,
    capability: CapabilityType,
    value: boolean,
  ): Result<void, AppError>;
  /**
   * Query historical series for a query value object (CP-R5): the widget
   * passes its exact `deviceId + field` so only its own series is fetched.
   */
  queryHistory(query: HistoryQuery): Promise<Result<HistorySeries[], AppError>>;
  /** All rooms (from the devices registry snapshot). */
  getRooms(): readonly Room[];
  /** All devices (from the devices registry snapshot). */
  getDevices(): readonly Device[];
  /** The capability catalog (labels/units/icons/colors per type). */
  getCapabilities(): readonly CapabilityDef[];
  /** The currently active room filter id (`null` = Tất cả). */
  getActiveRoomId(): string | null;
  /**
   * Subscribe to device state changes (CP-R1 reactive seam).
   * Returns an unsubscribe function. Listeners fire on any state change;
   * consumers must use snapshot getters to check identity stability.
   */
  subscribeDeviceState(listener: () => void): () => void;
}

const WidgetServicesContext = createContext<WidgetServices | null>(null);

/**
 * Provide {@link WidgetServices} to the widget tree.
 *
 * @param props.services - the service implementation (wired at the app root).
 */
export function WidgetServicesProvider({
  services,
  children,
}: {
  readonly services: WidgetServices;
  readonly children: ReactNode;
}) {
  return (
    <WidgetServicesContext.Provider value={services}>
      {children}
    </WidgetServicesContext.Provider>
  );
}

/**
 * Access the widget runtime services.
 *
 * @returns the {@link WidgetServices} object.
 * @throws when used outside a {@link WidgetServicesProvider}.
 */
export function useWidgetServices(): WidgetServices {
  const services = useContext(WidgetServicesContext);
  if (!services) {
    throw new Error(
      'useWidgetServices must be used inside a WidgetServicesProvider',
    );
  }
  return services;
}

/**
 * Access the widget runtime services without throwing.
 *
 * @returns the {@link WidgetServices} object, or `null` outside a provider
 *   (callers must tolerate the absence — e.g. edit-mode chrome that renders
 *   widget cards without live services).
 */
export function useOptionalWidgetServices(): WidgetServices | null {
  return useContext(WidgetServicesContext);
}

/** Stable empty series constant to avoid infinite rerenders when no data exists. */
const EMPTY_SERIES: readonly SeriesPoint[] = Object.freeze([]);

/**
 * Reactive hook for a single capability's live value (CP-R1).
 * Uses `useSyncExternalStore` so the component only rerenders when the
 * selected snapshot identity actually changes.
 *
 * @param deviceId - target device id (empty string = disabled/no-op).
 * @param capability - target capability type.
 * @param enabled - when false, returns undefined without subscribing.
 */
export function useCapabilityState(
  deviceId: string,
  capability: CapabilityType,
  enabled = true,
): DeviceCapabilityValue | undefined {
  const services = useWidgetServices();
  const subscribe = React.useCallback(
    (listener: () => void) => services.subscribeDeviceState(listener),
    [services],
  );
  const getSnapshot = React.useCallback(() => {
    if (!enabled || !deviceId) return undefined;
    return services.getState(deviceId, capability);
  }, [services, deviceId, capability, enabled]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Reactive hook for a single capability's recent numeric series (CP-R1).
 * Returns a stable empty array reference when no data exists.
 */
export function useCapabilitySeries(
  deviceId: string,
  capability: CapabilityType,
  enabled = true,
): readonly SeriesPoint[] {
  const services = useWidgetServices();
  const subscribe = React.useCallback(
    (listener: () => void) => services.subscribeDeviceState(listener),
    [services],
  );
  const getSnapshot = React.useCallback(() => {
    if (!enabled || !deviceId) return EMPTY_SERIES;
    const series = services.getSeries(deviceId, capability);
    return series.length === 0 ? EMPTY_SERIES : series;
  }, [services, deviceId, capability, enabled]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
