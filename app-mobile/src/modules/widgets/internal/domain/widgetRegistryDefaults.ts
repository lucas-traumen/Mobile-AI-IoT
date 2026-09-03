/**
 * Default widget registry — the four built-in widget types.
 *
 * Registered in a fixed order so `list()` and `suggestForCapabilities()` are
 * deterministic:
 * 1. `sensor-value`     — temperature/humidity, sizes 1x1 + 2x1 (sensor).
 * 2. `switch`           — switch, sizes 1x1 + 2x1 (control).
 * 3. `history-chart`    — temperature/humidity, size 2x2 (history).
 * 4. `room-device-list` — no binding, sizes 2x1 + 2x2 (control).
 *
 * The `connection` widget type was retired (Phase 1): it is not registered,
 * so it can never be newly added, and legacy persisted instances are removed
 * on dashboard load (see DashboardServiceImpl's load migration). Global MQTT
 * status remains available in the Dashboard header.
 */

import { STRINGS } from '@core/i18n';

import { createWidgetRegistry, type WidgetRegistry } from './widgetRegistry';
import type { WidgetDefinition } from './widgetRegistry';
import { HistoryChartWidget } from '../ui/widgets/HistoryChartWidget';
import { RoomDeviceListWidget } from '../ui/widgets/RoomDeviceListWidget';
import { SensorValueWidget } from '../ui/widgets/SensorValueWidget';
import { SwitchWidget } from '../ui/widgets/SwitchWidget';

/** The four built-in widget definitions (labels from {@link STRINGS}). */
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
    // 1x1 is the default (side-by-side device cards on the wide canvas);
    // 2x1 stays supported so a full-width control row remains a choice.
    supportedSizes: ['1x1', '2x1'],
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
];

/**
 * Create the default registry with the four built-in widget types.
 *
 * @returns a {@link WidgetRegistry} with `sensor-value`, `switch`,
 *   `history-chart` and `room-device-list` registered.
 */
export function createDefaultRegistry(): WidgetRegistry {
  const registry = createWidgetRegistry();
  for (const def of BUILT_IN_WIDGET_DEFINITIONS) {
    registry.register(def);
  }
  return registry;
}
