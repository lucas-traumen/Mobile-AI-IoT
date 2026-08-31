/**
 * Default widget registry — the five built-in widget types.
 *
 * Registered in a fixed order so `list()` and `suggestForCapabilities()` are
 * deterministic:
 * 1. `sensor-value`     — temperature/humidity, sizes 1x1 + 2x1 (sensor).
 * 2. `switch`           — switch, size 2x1 (control).
 * 3. `history-chart`    — temperature/humidity, size 2x2 (history).
 * 4. `room-device-list` — no binding, sizes 2x1 + 2x2 (control).
 * 5. `connection`       — no binding, size 2x1 (system).
 */

import { STRINGS } from '@core/i18n';

import { createWidgetRegistry, type WidgetRegistry } from './widgetRegistry';
import type { WidgetDefinition } from './widgetRegistry';
import { ConnectionWidget } from '../ui/widgets/ConnectionWidget';
import { HistoryChartWidget } from '../ui/widgets/HistoryChartWidget';
import { RoomDeviceListWidget } from '../ui/widgets/RoomDeviceListWidget';
import { SensorValueWidget } from '../ui/widgets/SensorValueWidget';
import { SwitchWidget } from '../ui/widgets/SwitchWidget';

/** The five built-in widget definitions (labels from {@link STRINGS}). */
export const BUILT_IN_WIDGET_DEFINITIONS: readonly WidgetDefinition[] = [
  {
    type: 'sensor-value',
    label: STRINGS.widgets.sensorValue,
    description: STRINGS.widgets.sensorValueDesc,
    icon: 'thermometer-outline',
    category: 'sensor',
    supportedCapabilities: ['temperature', 'humidity'],
    acceptsCatalogKinds: ['sensor'],
    supportedSizes: ['1x1', '2x1'],
    component: SensorValueWidget,
  },
  {
    type: 'switch',
    label: STRINGS.widgets.switch,
    description: STRINGS.widgets.switchDesc,
    icon: 'toggle-outline',
    category: 'control',
    supportedCapabilities: ['switch'],
    supportedSizes: ['2x1'],
    component: SwitchWidget,
  },
  {
    type: 'history-chart',
    label: STRINGS.widgets.historyChart,
    description: STRINGS.widgets.historyChartDesc,
    icon: 'stats-chart-outline',
    category: 'history',
    supportedCapabilities: ['temperature', 'humidity'],
    acceptsCatalogKinds: ['sensor'],
    supportedSizes: ['2x2'],
    component: HistoryChartWidget,
  },
  {
    type: 'room-device-list',
    label: STRINGS.widgets.roomDeviceList,
    description: STRINGS.widgets.roomDeviceListDesc,
    icon: 'list-outline',
    category: 'control',
    supportedCapabilities: [],
    supportedSizes: ['2x1', '2x2'],
    component: RoomDeviceListWidget,
  },
  {
    type: 'connection',
    label: STRINGS.widgets.connection,
    description: STRINGS.widgets.connectionDesc,
    icon: 'wifi-outline',
    category: 'system',
    supportedCapabilities: [],
    supportedSizes: ['2x1'],
    component: ConnectionWidget,
  },
];

/**
 * Create the default registry with the five built-in widget types.
 *
 * @returns a {@link WidgetRegistry} with `sensor-value`, `switch`,
 *   `history-chart`, `room-device-list` and `connection` registered.
 */
export function createDefaultRegistry(): WidgetRegistry {
  const registry = createWidgetRegistry();
  for (const def of BUILT_IN_WIDGET_DEFINITIONS) {
    registry.register(def);
  }
  return registry;
}
