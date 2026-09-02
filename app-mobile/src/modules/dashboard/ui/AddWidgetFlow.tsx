/**
 * AddWidgetFlow — full-screen modal for adding a widget (CP3 mock restyle).
 *
 * Step 1 (type): category chips (Tất cả / Cảm biến / Điều khiển / Lịch sử)
 * filter the registry list; each definition renders as a row with its icon,
 * label, description and a "+ Thêm" button that starts the binding steps.
 *
 * Following steps (each advanced by tapping an option):
 * 2. Choose device — devices filtered to those whose capabilities intersect
 *    the definition's `supportedCapabilities`. Skipped entirely when the
 *    definition needs no binding (e.g. room-device-list).
 * 3. Choose capability — intersection of the selected device's capabilities
 *    and the definition's supported capabilities.
 * 4. Choose room — chips per room with a checkmark for the selected one.
 *    CP-R2: rooms are created only in Settings room management and there is
 *    no room-level "Tất cả" option — a concrete room is required (the
 *    editor/dashboard's active room is the default).
 * 5. Choose size — the definition's `supportedSizes` (CP-R3: the selected
 *    size is sent through `AddWidgetInput.size` and honored by the service).
 *
 * Footer: Thêm (enabled when the flow is complete) / Hủy (abort). The flow is
 * purely presentational: it calls `onAdd` with the assembled input and the
 * parent closes it.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { overlayFooterBottomPadding, safeInset } from '@core/safeArea';
import { STRINGS } from '@core/i18n';
import { useTheme } from '@core/theme';

import type {
  CapabilityDef,
  CapabilityType,
  Device,
  Room,
} from '@modules/devices/api';
import type { AddWidgetInput } from '@modules/dashboard/api';
import type {
  WidgetCategory,
  WidgetDefinition,
  WidgetRegistry,
  WidgetSize,
} from '@modules/widgets/api';
import { effectiveCapabilities } from '@modules/widgets/api';

interface AddWidgetFlowProps {
  /** All rooms (the room step lists them; creation lives in Settings). */
  readonly rooms: readonly Room[];
  /** All devices (filtered per capability intersection). */
  readonly devices: readonly Device[];
  /** Capability catalog (custom capability labels + binding candidates). */
  readonly capabilities?: readonly CapabilityDef[];
  /** Registry listing widget types + their capability/size rules. */
  readonly registry: WidgetRegistry;
  /** Build + persist the widget (parent owns the service call + close). */
  readonly onAdd: (input: AddWidgetInput) => void;
  /** Abort + close the flow. */
  readonly onCancel: () => void;
  /** Initial room selection (the editor/dashboard's active room). */
  readonly defaultRoomId?: string;
}

type Step = 'type' | 'device' | 'capability' | 'room' | 'size';

/** Category chip model: filter key + Vietnamese label. */
const CATEGORY_CHIPS: readonly {
  key: 'all' | WidgetCategory;
  label: string;
}[] = [
  { key: 'all', label: STRINGS.widgets.categoryAll },
  { key: 'sensor', label: STRINGS.widgets.categorySensor },
  { key: 'control', label: STRINGS.widgets.categoryControl },
  { key: 'history', label: STRINGS.widgets.categoryHistory },
];

/** Label for a capability chip (catalog label first, known fallbacks). */
function capabilityLabel(
  capability: CapabilityType,
  catalog: readonly CapabilityDef[],
): string {
  const def = catalog.find(candidate => candidate.type === capability);
  if (def) {
    return def.label;
  }
  switch (capability) {
    case 'temperature':
      return STRINGS.devices.temperature;
    case 'humidity':
      return STRINGS.devices.humidity;
    case 'switch':
      return STRINGS.devices.switch;
    default:
      return capability;
  }
}

function roomName(rooms: readonly Room[], roomId: string | undefined): string {
  if (!roomId) {
    return STRINGS.devices.noRoom;
  }
  const room = rooms.find(candidate => candidate.id === roomId);
  return room ? room.name : STRINGS.devices.noRoom;
}

/**
 * The add-widget full-screen flow.
 *
 * @param props - see {@link AddWidgetFlowProps}.
 */
export function AddWidgetFlow({
  rooms,
  devices,
  capabilities = [],
  registry,
  onAdd,
  onCancel,
  defaultRoomId,
}: AddWidgetFlowProps) {
  const { tokens } = useTheme();
  // Safe-area seam: the overlay is absolutely positioned inside the shell's
  // content container (which is already padded by the runtime TOP inset), so
  // the flow offsets itself up by that inset to cover the status-bar strip
  // and pads its own header. The footer keeps the actions tappable above the
  // bottom system area (the shell's tab bar reserves the BOTTOM inset below
  // the overlay; the footer never shrinks below the runtime inset either).
  const insets = useSafeAreaInsets();
  const topInset = safeInset(insets.top);
  const [category, setCategory] = useState<'all' | WidgetCategory>('all');
  const [type, setType] = useState<WidgetDefinition | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [capability, setCapability] = useState<CapabilityType | null>(null);
  // CP-R2: a concrete room is required (no "Tất cả", no inline creation).
  // The editor's active room is preselected so one tap confirms it.
  const [roomId, setRoomId] = useState<string | undefined>(defaultRoomId);
  const [size, setSize] = useState<WidgetSize | null>(null);
  // The room step must be confirmed by tapping a room chip; the default
  // (active room) shows pre-checked so the user can keep it with one tap.
  const [roomStepConfirmed, setRoomStepConfirmed] = useState(false);

  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  // Catalog-aware capability rules (CP5/CP6): sensor-value / history-chart
  // additionally accept every user-defined sensor capability.
  const supportedFor = (definition: WidgetDefinition) =>
    effectiveCapabilities(definition, capabilities);

  const step: Step = !type
    ? 'type'
    : supportedFor(type).length === 0
    ? !roomStepConfirmed
      ? 'room' // no binding needed → go straight to the room step
      : 'size'
    : !device
    ? 'device'
    : !capability
    ? 'capability'
    : !roomStepConfirmed
    ? 'room'
    : 'size';

  // Registry list filtered by the active category chip.
  const definitions = useMemo(
    () =>
      registry
        .list()
        .filter(def => category === 'all' || def.category === category),
    [registry, category],
  );

  // Device candidates: those exposing at least one supported capability.
  const deviceCandidates = useMemo(() => {
    if (!type) {
      return [];
    }
    const supported = supportedFor(type);
    return devices.filter(candidate =>
      candidate.capabilities.some(cap => supported.includes(cap)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, type, capabilities]);

  // Capability candidates: intersection of device + definition.
  const capabilityCandidates = useMemo(() => {
    if (!type || !device) {
      return [];
    }
    const supported = supportedFor(type);
    return device.capabilities.filter(cap => supported.includes(cap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, device, capabilities]);

  const canAdd =
    type !== null &&
    roomId !== undefined &&
    roomStepConfirmed &&
    (supportedFor(type).length === 0
      ? size !== null
      : device !== null && capability !== null && size !== null);

  const submit = () => {
    if (!type || !canAdd || roomId === undefined) {
      return;
    }
    const binding =
      supportedFor(type).length > 0 && device && capability
        ? { deviceId: device.id, capability }
        : undefined;
    // CP-R3: the selected size travels with the input and is honored by
    // the service (findFreeSlot runs in the selected room's scope).
    onAdd({ type: type.type, binding, roomId, size: size ?? undefined });
  };

  const selectType = (definition: WidgetDefinition) => {
    setType(definition);
    setDevice(null);
    setCapability(null);
    setSize(null);
    setRoomStepConfirmed(false);
    // When the definition needs no binding, jump to the room step
    // (state handles it: `step` becomes 'room').
  };

  return (
    <View
      style={[
        styles.overlay,
        { backgroundColor: tokens.background, top: -topInset },
      ]}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: tokens.border, paddingTop: 12 + topInset },
        ]}
      >
        <Text style={styles.headerTitle}>{STRINGS.dashboard.addWidget}</Text>
        <Pressable onPress={onCancel}>
          <Text style={styles.cancelHeader}>{STRINGS.widgets.cancel}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {step === 'type' ? (
          <>
            <View style={styles.categoryRow}>
              {CATEGORY_CHIPS.map(chip => {
                const active = category === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    style={[
                      styles.categoryChip,
                      {
                        borderColor: active ? tokens.primary : tokens.border,
                        backgroundColor: active
                          ? tokens.primary
                          : tokens.surface,
                      },
                    ]}
                    onPress={() => setCategory(chip.key)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        {
                          color: active ? tokens.onPrimary : tokens.textPrimary,
                        },
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {definitions.map(definition => (
              <View
                key={definition.type}
                style={[
                  styles.defRow,
                  {
                    backgroundColor: tokens.surface,
                    borderColor: tokens.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.defIcon,
                    { backgroundColor: tokens.surfaceElevated },
                  ]}
                >
                  <Ionicons
                    name={definition.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={tokens.primary}
                  />
                </View>
                <View style={styles.defText}>
                  <Text style={styles.defLabel}>{definition.label}</Text>
                  <Text style={styles.defDesc}>{definition.description}</Text>
                </View>
                <Pressable
                  style={[
                    styles.defAddButton,
                    { backgroundColor: tokens.primary },
                  ]}
                  onPress={() => selectType(definition)}
                >
                  <Text style={styles.defAddButtonText}>
                    + {STRINGS.widgets.add}
                  </Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : null}

        {step === 'device' ? (
          <>
            <Text style={styles.stepTitle}>{STRINGS.widgets.chooseDevice}</Text>
            {deviceCandidates.length === 0 ? (
              <Text style={styles.hint}>{STRINGS.widgets.disabled}</Text>
            ) : (
              deviceCandidates.map(candidate => (
                <Pressable
                  key={candidate.id}
                  style={styles.option}
                  onPress={() => {
                    setDevice(candidate);
                    setCapability(null);
                    setSize(null);
                  }}
                >
                  <Text style={styles.optionText}>{candidate.name}</Text>
                  <Text style={styles.optionMeta}>
                    {candidate.type} · {roomName(rooms, candidate.roomId)}
                  </Text>
                </Pressable>
              ))
            )}
          </>
        ) : null}

        {step === 'capability' ? (
          <>
            <Text style={styles.stepTitle}>
              {STRINGS.widgets.chooseCapability}
            </Text>
            <View style={styles.chipRow}>
              {capabilityCandidates.map(cap => (
                <Pressable
                  key={cap}
                  style={styles.chip}
                  onPress={() => {
                    setCapability(cap);
                    setSize(null);
                  }}
                >
                  <Text style={styles.chipText}>
                    {capabilityLabel(cap, capabilities)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {step === 'room' ? (
          <>
            <Text style={styles.stepTitle}>{STRINGS.widgets.chooseRoom}</Text>
            {rooms.length === 0 ? (
              <Text style={styles.hint}>{STRINGS.dashboard.noRooms}</Text>
            ) : (
              rooms.map(room => {
                const selected = roomId === room.id;
                return (
                  <Pressable
                    key={room.id}
                    style={styles.option}
                    onPress={() => {
                      setRoomId(room.id);
                      setRoomStepConfirmed(true);
                      setSize(null);
                    }}
                  >
                    <Text style={styles.optionText}>
                      {selected ? '\u2713 ' : ''}
                      {room.name}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </>
        ) : null}

        {step === 'size' ? (
          <>
            <Text style={styles.stepTitle}>{STRINGS.widgets.chooseSize}</Text>
            {type ? (
              <View style={styles.chipRow}>
                {type.supportedSizes.map(candidate => (
                  <Pressable
                    key={candidate}
                    style={styles.chip}
                    onPress={() => setSize(candidate)}
                  >
                    <Text style={styles.chipText}>{candidate}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            borderTopColor: tokens.border,
            paddingBottom: overlayFooterBottomPadding(12, insets.bottom),
          },
        ]}
      >
        <Pressable style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>{STRINGS.widgets.cancel}</Text>
        </Pressable>
        <Pressable
          style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
          onPress={submit}
          disabled={!canAdd}
        >
          <Text style={styles.addButtonText}>{STRINGS.widgets.add}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(tokens: {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  danger: string;
  border: string;
}) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: tokens.textPrimary,
    },
    cancelHeader: { fontSize: 14, color: tokens.danger, fontWeight: '600' },
    content: { padding: 16 },
    categoryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    categoryChip: {
      borderWidth: 1,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    categoryChipText: { fontSize: 13, fontWeight: '500' },
    defRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    defIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    defText: { flex: 1 },
    defLabel: { fontSize: 15, fontWeight: '600', color: tokens.textPrimary },
    defDesc: { fontSize: 12, color: tokens.textSecondary, marginTop: 2 },
    defAddButton: {
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    defAddButtonText: {
      color: tokens.onPrimary,
      fontWeight: '700',
      fontSize: 12,
    },
    stepTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: tokens.textSecondary,
      marginBottom: 8,
    },
    option: {
      backgroundColor: tokens.surfaceElevated,
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
    },
    optionText: { fontSize: 15, fontWeight: '600', color: tokens.textPrimary },
    optionMeta: { fontSize: 12, color: tokens.textSecondary, marginTop: 2 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      backgroundColor: tokens.surfaceElevated,
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    chipText: { fontSize: 14, color: tokens.textPrimary, fontWeight: '500' },
    hint: { fontSize: 13, color: tokens.textSecondary },
    footer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
    },
    cancelButton: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    cancelButtonText: { color: tokens.textSecondary, fontWeight: '600' },
    addButton: {
      backgroundColor: tokens.primary,
      borderRadius: 8,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    addButtonDisabled: { opacity: 0.5 },
    addButtonText: { color: tokens.onPrimary, fontWeight: '700' },
  });
}
