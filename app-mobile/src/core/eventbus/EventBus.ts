/**
 * Typed in-process event bus (Observer pattern).
 *
 * Modules communicate through this bus instead of importing each other's
 * internals: `settings` publishes `settings:changed`, `telemetry` publishes
 * `telemetry:received`, `relay` publishes `relay:command` / `relay:feedback`.
 * Event names + payload types are declared in the single {@link EventMap}
 * below so subscribers get compile-time safety.
 */

/** A handler for a specific event type. */
export type EventHandler<E> = (payload: E) => void;

/** Removes the subscription when called. */
export type Unsubscribe = () => void;

/**
 * Event bus contract. Implementations must be safe to call from any module
 * (no async semantics needed — all handlers run synchronously).
 */
export interface EventBus {
  /** Subscribe to an event; returns an unsubscribe function. */
  subscribe<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>,
  ): Unsubscribe;
  /** Publish an event payload to all current subscribers (sync). */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
}

/** The single event-name → payload-type map used by the whole app. */
export interface EventMap {
  /** Settings persisted and became active (payload: full settings snapshot). */
  'settings:changed': import('@core/events').SettingsSnapshot;
  /** A telemetry reading was parsed and accepted (payload: reading). */
  'telemetry:received': import('@core/events').TelemetryReading;
  /** MQTT connection state transitioned (payload: new state). */
  'telemetry:connectionState': import('@core/events').ConnectionState;
  /** A relay command was published (payload: the command). */
  'relay:command': import('@core/events').RelayCommand;
  /** Relay feedback state was received from the device (payload: state). */
  'relay:feedback': import('@core/events').RelayFeedback;
  /** Devices registry changed (payload: removed device ids). */
  'devices:changed': {
    readonly removedDeviceIds: readonly string[];
  };
  /** Dashboard layout changed (payload: id of the active dashboard). */
  'dashboards:changed': {
    readonly activeId: string;
  };
}
