/**
 * Add-device / add-room centered dialogs (devices-add-device-dialog plan).
 *
 * The `Phòng & thiết bị` screen no longer hosts inline add-form cards at the
 * bottom of its lists: creating a sensor, a relay, or a room happens inside a
 * small centered dialog (RN `Modal` + fade) over a scrim covering the content
 * behind.
 *
 * - `AddDeviceDialog`: segmented `[ Cảm biến | Rơ le ]` kind switch; the
 *   sensor body keeps the metric-chip picker; the curated custom-metric
 *   creation (`CustomMetricForm`) is a dedicated STEP inside the same
 *   dialog — entering it hides the main form (segmented, Tên, chips,
 *   footer), switches the title and offers a `‹ Quay lại` affordance that
 *   returns WITHOUT losing the main form's state. The relay body keeps the
 *   free room-scoped slot picker. The availability math (taken fields /
 *   free slots / room-full) moved here from the old section components —
 *   same inputs, same results.
 * - `AddRoomDialog`: name input only; the submit semantics (await the
 *   service → open the created room on success, banner + truthful error)
 *   stay owned by the screen via `onSubmitRoom`.
 *
 * Both dialogs share one shell recipe (scrim + centered smart card + header
 * ✕ + footer buttons) — the same recipe as the room-delete dialog in
 * `DevicesScreen`, deliberately duplicated instead of importing the
 * dashboard module's `ConfirmDialog` (module boundary law).
 *
 * Behavior contract (unchanged from the inline forms):
 * - submit callbacks flow down unchanged (`onAddDevice`, `onAddCapability`,
 *   the screen-owned room submit); success closes the dialog + banner,
 *   failure keeps it open with the truthful error inline.
 * - the parent mounts a dialog only while open → its state is fresh on
 *   every open; ✕ / scrim press / Android back close it with no side
 *   effects.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { STRINGS } from '@core/i18n';
import { useTheme } from '@core/theme';
import type {
  CapabilityDef,
  CapabilityType,
  Device,
  NewCapabilityInput,
  NewDeviceInput,
  Room,
} from '@modules/devices/api';
import {
  CAPABILITY_COLORS,
  CAPABILITY_ICON_GROUPS,
  type CapabilityPreset,
} from '../internal/domain/capabilityPresets';
import {
  CAPABILITY_KEY_REGEX,
  MAX_SENSORS_PER_ROOM,
  RELAY_CHANNELS,
  projectSensorRegistrations,
  relaySlotTakenInRoom,
  type RelayChannel,
} from '../internal/domain/devices';
import type {
  ActionOutcome,
  AddRoomOutcome,
  DevicesStyles,
} from './DevicesScreen';

function capabilityLabel(
  capability: CapabilityType,
  catalog: readonly CapabilityDef[],
): string {
  const def = catalog.find(candidate => candidate.type === capability);
  return def ? def.label : capability;
}

interface DialogShellProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly closeTestID: string;
  readonly scrimTestID: string;
  readonly children: React.ReactNode;
  readonly footer: React.ReactNode;
  readonly styles: DevicesStyles;
}

/**
 * Shared centered-dialog shell (same recipe as the room-delete dialog in
 * `DevicesScreen`): Modal + fade over a scrim, centered smart card with a
 * header (title + ✕), a bounded scrollable body (the custom-metric
 * expansion can exceed small screens) and a fixed footer row. Android back
 * requests close it; the scrim Pressable sits UNDER the card so card taps
 * never close the dialog.
 */
function DialogShell({
  title,
  onClose,
  closeTestID,
  scrimTestID,
  children,
  footer,
  styles,
}: DialogShellProps) {
  const { tokens } = useTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalBackdrop}>
          {/* Scrim press closes; it sits UNDER the card (absolute fill), so
              taps on the card never close the dialog. Exposed to assistive
              tech as a labelled dismiss button (same label as the ✕). */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={STRINGS.devices.close}
            testID={scrimTestID}
          />
          <View
            style={[
              styles.modalCard,
              styles.dialogCard,
              {
                backgroundColor: tokens.smart.colors.card,
                borderColor: tokens.smart.colors.cardBorder,
              },
              tokens.smart.cardShadow,
            ]}
          >
            <View style={styles.dialogHeader}>
              <Text
                style={[
                  styles.modalTitle,
                  { color: tokens.smart.colors.textPrimary },
                ]}
              >
                {title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={STRINGS.devices.close}
                hitSlop={10}
                testID={closeTestID}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={tokens.smart.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.dialogScroll}
              contentContainerStyle={styles.dialogBody}
            >
              {children}
            </ScrollView>
            {/* The custom-metric step has no footer — the form owns its
                action (and the step's back affordance owns navigation). */}
            {footer ? <View style={styles.dialogFooter}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface DialogFooterButtonProps {
  readonly label: string;
  /** Teal fill (Lưu) vs outline (Hủy). */
  readonly filled: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly styles: DevicesStyles;
}

/** Footer action: outline `Hủy` / teal-filled `Lưu`, side by side. */
function DialogFooterButton({
  label,
  filled,
  disabled = false,
  onPress,
  testID,
  styles,
}: DialogFooterButtonProps) {
  const { tokens } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.dialogFooterButton,
        filled
          ? {
              backgroundColor: tokens.primary,
              borderColor: tokens.primary,
            }
          : { borderColor: tokens.smart.colors.cardBorder },
        disabled && { opacity: 0.5 },
      ]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      <Text
        style={{
          color: filled ? tokens.onPrimary : tokens.smart.colors.textSecondary,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface AddDeviceDialogProps {
  readonly room: Room;
  readonly devices: readonly Device[];
  readonly capabilities: readonly CapabilityDef[];
  /** Add a device (validated by the registry service) — unchanged. */
  readonly onAddDevice: (input: NewDeviceInput) => Promise<ActionOutcome>;
  /** Add a curated custom metric to the catalog — unchanged. */
  readonly onAddCapability: (
    input: NewCapabilityInput,
  ) => Promise<ActionOutcome>;
  readonly notifyOutcome: (outcome: ActionOutcome) => ActionOutcome;
  /** ✕ / scrim / Android back / successful submit. */
  readonly onClose: () => void;
  readonly styles: DevicesStyles;
}

/**
 * The `＋ Thêm thiết bị` dialog: segmented kind switch + the (moved) sensor
 * and relay add bodies. All add-form state lives HERE — the parent mounts
 * the dialog only while open, so every open starts fresh.
 */
export function AddDeviceDialog({
  room,
  devices,
  capabilities,
  onAddDevice,
  onAddCapability,
  notifyOutcome,
  onClose,
  styles,
}: AddDeviceDialogProps) {
  const { tokens } = useTheme();
  const [kind, setKind] = useState<'sensor' | 'relay'>('sensor');

  // Sensor body state (moved from SensorsSection).
  const [name, setName] = useState('');
  const [field, setField] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showCustomMetric, setShowCustomMetric] = useState(false);

  // Relay body state (moved from ControlsSection). The slot is a typed
  // hardware channel (1..10) — no numeric assertions needed downstream.
  const [relayName, setRelayName] = useState('');
  const [slot, setSlot] = useState<RelayChannel | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);

  // Available metric choices: sensor-kind catalog fields not yet registered
  // in this room (duplicate/full choices are omitted with truthful copy).
  const registrations = projectSensorRegistrations(
    devices,
    capabilities,
  ).filter(registration => registration.roomId === room.id);
  const takenFields = new Set(registrations.map(entry => entry.field));
  const availableFields = capabilities
    .filter(def => def.kind === 'sensor')
    .filter(def => !takenFields.has(def.type));
  const roomFull = registrations.length >= MAX_SENSORS_PER_ROOM;

  // Free room-scoped relay channels (in-room take + global collision).
  const relays = devices.filter(
    device => device.roomId === room.id && device.binding.kind === 'relay',
  );
  const takenSlots = new Set<RelayChannel>(
    relays.flatMap(device =>
      device.binding.kind === 'relay' ? [device.binding.index] : [],
    ),
  );
  const freeSlots: readonly RelayChannel[] = RELAY_CHANNELS.filter(
    candidate => !takenSlots.has(candidate),
  ).filter(candidate => !relaySlotTakenInRoom(devices, room.id, candidate));

  const submitSensor = async () => {
    if (!field) {
      setFormError(STRINGS.devices.requiredField);
      return;
    }
    setFormError(null);
    const result = await onAddDevice({
      name: name.trim() || capabilityLabel(field, capabilities),
      roomId: room.id,
      type: 'sensor',
      capabilities: [field],
      binding: { kind: 'telemetry-sensor' },
    });
    if (!result.ok) {
      // Keep the dialog open; surface the truthful error inside it.
      setFormError(result.message || 'Lỗi');
      notifyOutcome(result);
      return;
    }
    notifyOutcome({ ok: true, message: STRINGS.devices.addSensor });
    onClose();
  };

  const submitRelay = async () => {
    if (slot === null) {
      setRelayError(STRINGS.devices.requiredField);
      return;
    }
    setRelayError(null);
    const result = await onAddDevice({
      name: relayName.trim() || `Rơ le ${slot}`,
      roomId: room.id,
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: slot },
    });
    if (!result.ok) {
      setRelayError(result.message || 'Lỗi');
      notifyOutcome(result);
      return;
    }
    notifyOutcome({ ok: true, message: STRINGS.devices.addRelay });
    onClose();
  };

  return (
    <DialogShell
      title={
        showCustomMetric
          ? STRINGS.devices.customMetric
          : STRINGS.devices.addDevice
      }
      onClose={onClose}
      closeTestID="devices-add-device-close"
      scrimTestID="devices-add-device-scrim"
      styles={styles}
      footer={
        showCustomMetric ? null : kind === 'sensor' ? (
          <>
            <DialogFooterButton
              label={STRINGS.devices.cancel}
              filled={false}
              onPress={onClose}
              styles={styles}
            />
            <DialogFooterButton
              label={STRINGS.devices.save}
              filled
              disabled={roomFull || !field}
              onPress={() => {
                void submitSensor();
              }}
              testID="devices-add-sensor-submit"
              styles={styles}
            />
          </>
        ) : (
          <>
            <DialogFooterButton
              label={STRINGS.devices.cancel}
              filled={false}
              onPress={onClose}
              styles={styles}
            />
            <DialogFooterButton
              label={STRINGS.devices.save}
              filled
              disabled={slot === null}
              onPress={() => {
                void submitRelay();
              }}
              testID="devices-add-relay-submit"
              styles={styles}
            />
          </>
        )
      }
    >
      {showCustomMetric ? (
        <>
          {/* The curated creation is a STEP, not an inline expansion: the
              main add-device form (segmented, Tên, chips, footer) is hidden
              and the title switches (approved user-acceptance mockup). */}
          <TouchableOpacity
            onPress={() => setShowCustomMetric(false)}
            testID="devices-custom-metric-back"
          >
            <Text style={{ color: tokens.primary, marginBottom: 8 }}>
              {`‹ ${STRINGS.settings.back}`}
            </Text>
          </TouchableOpacity>
          <CustomMetricForm
            capabilities={capabilities}
            styles={styles}
            onAdd={onAddCapability}
            onCreated={() => setShowCustomMetric(false)}
          />
        </>
      ) : (
        <>
          {/* Segmented kind switch: switches the dialog BODY only — the
              visible section behind never changes. */}
          <View style={styles.segmentRow}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: tokens.smart.colors.cardBorder },
                kind === 'sensor' && {
                  backgroundColor: tokens.smart.colors.tealTint,
                  borderColor: tokens.primary,
                },
              ]}
              onPress={() => setKind('sensor')}
              testID="devices-add-device-kind-sensor"
            >
              <Text
                style={{
                  color:
                    kind === 'sensor'
                      ? tokens.primary
                      : tokens.smart.colors.textPrimary,
                }}
              >
                {STRINGS.devices.sensor}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: tokens.smart.colors.cardBorder },
                kind === 'relay' && {
                  backgroundColor: tokens.smart.colors.tealTint,
                  borderColor: tokens.primary,
                },
              ]}
              onPress={() => setKind('relay')}
              testID="devices-add-device-kind-relay"
            >
              <Text
                style={{
                  color:
                    kind === 'relay'
                      ? tokens.primary
                      : tokens.smart.colors.textPrimary,
                }}
              >
                {STRINGS.devices.relay}
              </Text>
            </TouchableOpacity>
          </View>

          {kind === 'sensor' ? (
            <>
              <Text
                style={[
                  styles.label,
                  { color: tokens.smart.colors.textSecondary },
                ]}
              >
                {STRINGS.devices.name}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: tokens.smart.colors.card,
                    borderColor: tokens.smart.colors.cardBorder,
                    color: tokens.smart.colors.textPrimary,
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder={
                  capabilityLabel(field ?? '', capabilities) || 'Nhiệt độ'
                }
                placeholderTextColor={tokens.smart.colors.textSecondary}
                testID="devices-add-sensor-name"
              />
              <Text
                style={[
                  styles.label,
                  { color: tokens.smart.colors.textSecondary },
                ]}
              >
                {STRINGS.devices.selectField}
              </Text>
              {roomFull || availableFields.length === 0 ? (
                <Text
                  style={[
                    styles.hint,
                    { color: tokens.smart.colors.textSecondary },
                  ]}
                >
                  {STRINGS.devices.noFieldAvailable}
                </Text>
              ) : (
                <View style={styles.pickerRow}>
                  {availableFields.map(def => (
                    <TouchableOpacity
                      key={def.type}
                      style={[
                        styles.pickerChip,
                        {
                          borderColor:
                            field === def.type
                              ? tokens.primary
                              : tokens.smart.colors.cardBorder,
                        },
                        field === def.type
                          ? { backgroundColor: tokens.smart.colors.tealTint }
                          : // Unselected chips dim (consistent with the
                            // custom-metric step's chips).
                            { opacity: 0.4 },
                      ]}
                      hitSlop={{ top: 4, bottom: 4 }}
                      onPress={() => setField(def.type)}
                      testID={`devices-field-${def.type}`}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: tokens.smart.colors.textPrimary },
                        ]}
                      >
                        {def.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {formError ? (
                <Text style={[styles.errorText, { color: tokens.danger }]}>
                  {formError}
                </Text>
              ) : null}
              {/* Secondary curated custom-metric creation (NOT a primary tab):
              entering the dedicated step keeps this form's state alive. */}
              <TouchableOpacity
                onPress={() => setShowCustomMetric(true)}
                testID="devices-custom-metric-toggle"
              >
                <Text style={{ color: tokens.primary, marginTop: 8 }}>
                  {STRINGS.devices.customMetric}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text
                style={[
                  styles.label,
                  { color: tokens.smart.colors.textSecondary },
                ]}
              >
                {STRINGS.devices.name}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: tokens.smart.colors.card,
                    borderColor: tokens.smart.colors.cardBorder,
                    color: tokens.smart.colors.textPrimary,
                  },
                ]}
                value={relayName}
                onChangeText={setRelayName}
                placeholder="Đèn"
                placeholderTextColor={tokens.smart.colors.textSecondary}
                testID="devices-add-relay-name"
              />
              <Text
                style={[
                  styles.label,
                  { color: tokens.smart.colors.textSecondary },
                ]}
              >
                {STRINGS.devices.chooseSlot}
              </Text>
              <View style={styles.pickerRow}>
                {freeSlots.map(candidate => (
                  <TouchableOpacity
                    key={candidate}
                    style={[
                      styles.pickerChip,
                      {
                        borderColor:
                          slot === candidate
                            ? tokens.primary
                            : tokens.smart.colors.cardBorder,
                      },
                      slot === candidate
                        ? { backgroundColor: tokens.smart.colors.tealTint }
                        : // Unselected chips dim (consistent with the
                          // custom-metric step's chips).
                          { opacity: 0.4 },
                    ]}
                    hitSlop={{ top: 4, bottom: 4 }}
                    onPress={() => setSlot(candidate)}
                    testID={`devices-slot-${candidate}`}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: tokens.smart.colors.textPrimary },
                      ]}
                    >
                      {candidate}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {relayError ? (
                <Text style={[styles.errorText, { color: tokens.danger }]}>
                  {relayError}
                </Text>
              ) : null}
            </>
          )}
        </>
      )}
    </DialogShell>
  );
}

interface AddRoomDialogProps {
  /** Screen-owned submit (await → open created room on success). */
  readonly onSubmitRoom: (name: string) => Promise<AddRoomOutcome>;
  /** Successful submit closes the dialog; failure keeps it open. */
  readonly onClose: () => void;
  readonly styles: DevicesStyles;
}

/**
 * The `＋ Thêm phòng` dialog: name input only. Draft/error/saving state
 * moved here from the screen; the outcome semantics (success banner +
 * open the created room, truthful failure) stay in the screen's
 * `onSubmitRoom`.
 */
export function AddRoomDialog({
  onSubmitRoom,
  onClose,
  styles,
}: AddRoomDialogProps) {
  const { tokens } = useTheme();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const name = draft.trim();
    if (!name || saving) {
      return;
    }
    setError(null);
    setSaving(true);
    const result = await onSubmitRoom(name);
    setSaving(false);
    if (!result.ok) {
      // Keep the draft so the user can retry; surface the service error.
      setError(result.message);
      return;
    }
    onClose();
  };

  return (
    <DialogShell
      title={STRINGS.devices.addRoom}
      onClose={onClose}
      closeTestID="devices-add-room-close"
      scrimTestID="devices-add-room-scrim"
      styles={styles}
      footer={
        <>
          <DialogFooterButton
            label={STRINGS.devices.cancel}
            filled={false}
            onPress={onClose}
            disabled={saving}
            styles={styles}
          />
          <DialogFooterButton
            label={STRINGS.devices.save}
            filled
            disabled={!draft.trim() || saving}
            onPress={() => {
              void submit();
            }}
            testID="devices-add-room-submit"
            styles={styles}
          />
        </>
      }
    >
      <Text
        style={[styles.label, { color: tokens.smart.colors.textSecondary }]}
      >
        {STRINGS.devices.roomName}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: tokens.smart.colors.card,
            borderColor: tokens.smart.colors.cardBorder,
            color: tokens.smart.colors.textPrimary,
          },
        ]}
        value={draft}
        onChangeText={setDraft}
        placeholder={STRINGS.devices.roomName}
        placeholderTextColor={tokens.smart.colors.textSecondary}
        testID="devices-add-room-input"
      />
      {error ? (
        <Text style={[styles.errorText, { color: tokens.danger }]}>
          {error}
        </Text>
      ) : null}
    </DialogShell>
  );
}

/**
 * Curated custom-metric creation (machine key immutable after creation;
 * presets fill key/label/unit — approved CP-R4 behavior). Moved verbatim
 * from `DevicesScreen` (its only consumer is the sensor dialog body).
 */
function CustomMetricForm({
  capabilities,
  styles,
  onAdd,
  onCreated,
}: {
  capabilities: readonly CapabilityDef[];
  styles: DevicesStyles;
  onAdd: (input: NewCapabilityInput) => Promise<ActionOutcome>;
  onCreated: () => void;
}) {
  const { tokens } = useTheme();
  const [capLabel, setCapLabel] = useState('');
  const [capUnit, setCapUnit] = useState('');
  const [capType, setCapType] = useState('');
  const [capIcon, setCapIcon] = useState<string>(
    CAPABILITY_ICON_GROUPS[0]?.icon ?? 'pulse-outline',
  );
  const [capColor, setCapColor] = useState<string>(CAPABILITY_COLORS[0]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | null>(null);

  const trimmedKey = capType.trim();
  const keyFormatValid = CAPABILITY_KEY_REGEX.test(trimmedKey);
  const keyTaken =
    trimmedKey.length > 0 && capabilities.some(def => def.type === trimmedKey);

  const applyPreset = (preset: CapabilityPreset) => {
    setCapType(preset.key);
    setCapLabel(preset.label);
    setCapUnit(preset.unit ?? '');
    setCapError(null);
  };

  const submit = async () => {
    const label = capLabel.trim();
    const type = capType.trim();
    setCapError(null);
    if (!label || !type) {
      setCapError(STRINGS.devices.requiredField);
      return;
    }
    if (!CAPABILITY_KEY_REGEX.test(type)) {
      setCapError(STRINGS.devices.capabilityKeyFormat);
      return;
    }
    const result = await onAdd({
      type,
      label,
      kind: 'sensor',
      unit: capUnit.trim() ? capUnit.trim() : undefined,
      icon: capIcon,
      color: capColor,
    });
    if (!result.ok) {
      setCapError(result.message);
      return;
    }
    onCreated();
  };

  const presets =
    CAPABILITY_ICON_GROUPS.find(group => group.icon === activeGroup)?.presets ??
    [];

  // The DialogShell card is the surface now — no card-in-card wrapper.
  return (
    <>
      <Text
        style={[styles.label, { color: tokens.smart.colors.textSecondary }]}
      >
        {STRINGS.devices.capabilityKeyLabel}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: tokens.smart.colors.card,
            borderColor:
              !keyFormatValid && trimmedKey
                ? tokens.danger
                : tokens.smart.colors.cardBorder,
            color: tokens.smart.colors.textPrimary,
          },
        ]}
        value={capType}
        onChangeText={t => {
          setCapType(t);
          if (capError) {
            setCapError(null);
          }
        }}
        placeholder="pressure"
        placeholderTextColor={tokens.smart.colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        testID="capability-key-input"
      />
      {trimmedKey && !keyFormatValid ? (
        <Text style={[styles.errorText, { color: tokens.danger }]}>
          {STRINGS.devices.capabilityKeyFormat}
        </Text>
      ) : null}
      {keyTaken ? (
        <Text style={[styles.errorText, { color: tokens.danger }]}>
          {STRINGS.devices.capabilityKeyTaken}
        </Text>
      ) : null}
      {!trimmedKey ? (
        <Text
          style={[styles.hint, { color: tokens.smart.colors.textSecondary }]}
        >
          {STRINGS.devices.capabilityKeyHint}
        </Text>
      ) : null}

      <Text
        style={[styles.label, { color: tokens.smart.colors.textSecondary }]}
      >
        {STRINGS.settings.capabilityLabel}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: tokens.smart.colors.card,
            borderColor: tokens.smart.colors.cardBorder,
            color: tokens.smart.colors.textPrimary,
          },
        ]}
        value={capLabel}
        onChangeText={setCapLabel}
        placeholder="Áp suất"
        placeholderTextColor={tokens.smart.colors.textSecondary}
        testID="capability-label-input"
      />

      <Text
        style={[styles.label, { color: tokens.smart.colors.textSecondary }]}
      >
        {STRINGS.settings.capabilityUnit}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: tokens.smart.colors.card,
            borderColor: tokens.smart.colors.cardBorder,
            color: tokens.smart.colors.textPrimary,
          },
        ]}
        value={capUnit}
        onChangeText={setCapUnit}
        placeholder="hPa"
        placeholderTextColor={tokens.smart.colors.textSecondary}
      />

      <Text
        style={[styles.label, { color: tokens.smart.colors.textSecondary }]}
      >
        {STRINGS.settings.capabilityIcon}
      </Text>
      <View style={styles.pickerRow}>
        {CAPABILITY_ICON_GROUPS.map(group => (
          <TouchableOpacity
            key={group.icon}
            style={[
              styles.pickerChip,
              {
                borderColor:
                  capIcon === group.icon
                    ? tokens.primary
                    : tokens.smart.colors.cardBorder,
              },
              capIcon === group.icon
                ? { backgroundColor: tokens.smart.colors.tealTint }
                : // Unselected groups dim (user-acceptance: clear
                  // highlight-while-others-recede affordance).
                  { opacity: 0.4 },
            ]}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              setCapIcon(group.icon);
              setActiveGroup(group.icon);
            }}
            testID={`capability-icon-${group.icon}`}
          >
            <Ionicons
              name={group.icon as keyof typeof Ionicons.glyphMap}
              size={22}
              color={tokens.primary}
            />
          </TouchableOpacity>
        ))}
      </View>
      {presets.length > 0 ? (
        <View style={styles.pickerRow}>
          {presets.map(preset => (
            <TouchableOpacity
              key={preset.key}
              style={[
                styles.pickerChip,
                { borderColor: tokens.smart.colors.cardBorder },
              ]}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => applyPreset(preset)}
              testID={`capability-preset-${preset.key}`}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: tokens.smart.colors.textPrimary },
                ]}
              >
                {`${preset.label}${preset.unit ? ` (${preset.unit})` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Text
        style={[styles.label, { color: tokens.smart.colors.textSecondary }]}
      >
        {STRINGS.settings.capabilityColor}
      </Text>
      <View style={styles.pickerRow}>
        {CAPABILITY_COLORS.map(color => (
          <TouchableOpacity
            key={color}
            style={[
              styles.colorChip,
              { backgroundColor: color },
              capColor === color
                ? // Selected swatch: bigger-feeling 3pt teal ring…
                  { borderColor: tokens.primary, borderWidth: 3 }
                : // …unselected swatches dim (one is always selected).
                  { opacity: 0.4 },
            ]}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => setCapColor(color)}
            testID={`capability-color-${color}`}
          />
        ))}
      </View>

      {capError ? (
        <Text style={[styles.errorText, { color: tokens.danger }]}>
          {capError}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: tokens.primary }]}
        onPress={() => {
          void submit();
        }}
        testID="capability-add-submit"
      >
        <Text style={[styles.primaryButtonText, { color: tokens.onPrimary }]}>
          {STRINGS.devices.save}
        </Text>
      </TouchableOpacity>
    </>
  );
}
