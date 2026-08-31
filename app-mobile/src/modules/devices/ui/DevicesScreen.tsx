/**
 * DeviceManagementScreen — devices-owned management UI rendered under the
 * Settings tab (CP-R2/CP-R4).
 *
 * The screen is dumb: the app-layer Settings coordinator wires it to the
 * devices registry service. Sections:
 *
 * - Quản lý phòng: inline add + rename, and remove with the explicit
 *   migration dialog when the room still has devices (move / unassign).
 *   Room creation exists ONLY here — AddWidgetFlow cannot create rooms.
 * - Thiết bị: add + edit devices. The editor covers everything this app
 *   needs: name, room assignment/unassignment, binding kind (telemetry
 *   sensor vs relay + relay channel 1..3) and catalog capability selection
 *   (relay devices are pinned to `switch`; sensors pick from the catalog).
 * - Thông số giám sát: capability catalog with locked built-ins and an add
 *   form with an explicit machine key (label/unit/icon/color preserved).
 *
 * Expected service failures are surfaced inline — forms stay open on a
 * failed Result instead of closing unconditionally.
 */

import React, { useMemo, useState } from 'react';
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
import { useTheme, type ThemeTokens } from '@core/theme';
import type {
  CapabilityDef,
  CapabilityType,
  Device,
  Room,
} from '@modules/devices/api';
import type {
  DevicePatch,
  NewCapabilityInput,
  NewDeviceInput,
  RoomMigrationTarget,
} from '@modules/devices/api';
import { resolveCapabilityAccent } from '@modules/widgets/api';

/** Outcome of a management action (service Result mapped for the UI). */
export type ActionOutcome = { ok: boolean; message: string };

interface DeviceManagementScreenProps {
  /** Navigate back to the Settings root (explicit, always available). */
  readonly onBack: () => void;
  /** All rooms (Quản lý phòng section). */
  readonly rooms: readonly Room[];
  /** All devices (Thiết bị section). */
  readonly devices: readonly Device[];
  /** Capability catalog (Thông số giám sát section + device editor). */
  readonly capabilities: readonly CapabilityDef[];
  /** Add a room. The form stays open on failure and the error is shown. */
  readonly onAddRoom: (name: string) => Promise<ActionOutcome>;
  /** Inline room rename. The row stays open on failure. */
  readonly onRenameRoom: (
    roomId: string,
    name: string,
  ) => Promise<ActionOutcome>;
  /** Room removal with an explicit device/widget migration. The dialog
   *  stays open on failure and the error is shown inside it. */
  readonly onRemoveRoom: (
    roomId: string,
    target: RoomMigrationTarget,
  ) => Promise<ActionOutcome>;
  /** Add a device (validated by the registry service). */
  readonly onAddDevice: (input: NewDeviceInput) => Promise<ActionOutcome>;
  /** Update a device (partial patch; validated by the registry service). */
  readonly onUpdateDevice: (
    id: string,
    patch: DevicePatch,
  ) => Promise<ActionOutcome>;
  /** Remove a device (cascade handled by the app root). The card stays on
   *  failure and the error is shown on it. */
  readonly onRemoveDevice: (id: string) => Promise<ActionOutcome>;
  /** Add a capability to the catalog (explicit machine key). */
  readonly onAddCapability: (
    input: NewCapabilityInput,
  ) => Promise<ActionOutcome>;
  /** Remove a (non-builtin, unused) capability from the catalog. The row
   *  stays on failure and the error is shown in the section. */
  readonly onRemoveCapability: (type: string) => Promise<ActionOutcome>;
}

/** Icon presets offered by the capability add form. */
const CAPABILITY_ICONS = [
  'thermometer-outline',
  'water-outline',
  'gauge-outline',
  'flash-outline',
  'leaf-outline',
  'speedometer-outline',
  'pulse-outline',
  'cloud-outline',
] as const;

/** Color palette offered by the capability add form. */
const CAPABILITY_COLORS = [
  '#e65100',
  '#00897b',
  '#1565c0',
  '#6a1b9a',
  '#2e7d32',
  '#c62828',
] as const;

/** Relay channel options (hardware contract 1..3). */
const RELAY_INDEX_OPTIONS = [1, 2, 3] as const;

/** Label for a capability type (catalog label first, known fallbacks). */
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
 * Device management screen (rooms + devices + capability catalog).
 */
export function DeviceManagementScreen({
  onBack,
  rooms,
  devices,
  capabilities,
  onAddRoom,
  onRenameRoom,
  onRemoveRoom,
  onAddDevice,
  onUpdateDevice,
  onRemoveDevice,
  onAddCapability,
  onRemoveCapability,
}: DeviceManagementScreenProps) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  // Room management state.
  const [roomDraft, setRoomDraft] = useState('');
  const [roomError, setRoomError] = useState<string | null>(null);
  const [renamingRoomId, setRenamingRoomId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [removingRoom, setRemovingRoom] = useState<Room | null>(null);
  const [migrationKind, setMigrationKind] =
    useState<RoomMigrationTarget['kind']>('move');
  const [migrationTarget, setMigrationTarget] = useState<string | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  // Catalog section error (capability removal failures).
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Capability add-form state.
  const [showAddCapability, setShowAddCapability] = useState(false);
  const [capLabel, setCapLabel] = useState('');
  const [capUnit, setCapUnit] = useState('');
  const [capIcon, setCapIcon] = useState<string>(CAPABILITY_ICONS[0]);
  const [capColor, setCapColor] = useState<string>(CAPABILITY_COLORS[0]);
  const [capType, setCapType] = useState('');
  const [capError, setCapError] = useState<string | null>(null);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: tokens.surface,
      borderColor: tokens.border,
      color: tokens.textPrimary,
    },
  ];

  const submitRoom = async () => {
    const name = roomDraft.trim();
    if (!name) {
      return;
    }
    setRoomError(null);
    const result = await onAddRoom(name);
    if (!result.ok) {
      // Keep the draft so the user can retry; surface the service error.
      setRoomError(result.message);
      return;
    }
    setRoomDraft('');
  };

  const startRemoveRoom = (room: Room) => {
    setRemovingRoom(room);
    setMigrationError(null);
    const firstOther = rooms.find(candidate => candidate.id !== room.id);
    setMigrationKind(firstOther ? 'move' : 'unassign');
    setMigrationTarget(firstOther ? firstOther.id : null);
  };

  const confirmRemoveRoom = async () => {
    if (!removingRoom) {
      return;
    }
    const target: RoomMigrationTarget =
      migrationKind === 'move' && migrationTarget
        ? { kind: 'move', roomId: migrationTarget }
        : { kind: 'unassign' };
    setMigrationError(null);
    const result = await onRemoveRoom(removingRoom.id, target);
    if (!result.ok) {
      // Keep the dialog open so the user can pick a different target.
      setMigrationError(result.message);
      return;
    }
    setRemovingRoom(null);
  };

  const submitRenameRoom = async (roomId: string) => {
    const name = renameValue.trim();
    if (!name) {
      return;
    }
    setRoomError(null);
    const result = await onRenameRoom(roomId, name);
    if (!result.ok) {
      // Keep the rename row open on failure.
      setRoomError(result.message);
      return;
    }
    setRenamingRoomId(null);
  };

  const removeCapability = async (type: string) => {
    setCatalogError(null);
    const result = await onRemoveCapability(type);
    if (!result.ok) {
      setCatalogError(result.message);
    }
  };

  const deviceCountInRoom = (roomId: string): number =>
    devices.filter(device => device.roomId === roomId).length;

  const submitCapability = async () => {
    const label = capLabel.trim();
    const type = capType.trim();
    setCapError(null);
    if (!label || !type) {
      setCapError(STRINGS.devices.requiredField);
      return;
    }
    const result = await onAddCapability({
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
    setCapLabel('');
    setCapType('');
    setCapUnit('');
    setShowAddCapability(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.backRow}
          accessibilityLabel={STRINGS.settings.back}
          testID="device-management-back"
          onPress={onBack}
        >
          <Ionicons name="arrow-back" size={18} color={tokens.primary} />
          <Text style={[styles.backText, { color: tokens.primary }]}>
            {STRINGS.settings.back}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: tokens.textPrimary }]}>
          {STRINGS.settings.manageDevices}
        </Text>

        {/* Quản lý phòng */}
        <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
          {STRINGS.settings.roomsSection}
        </Text>
        {rooms.map(room => (
          <View
            key={room.id}
            style={[
              styles.rowCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            {renamingRoomId === room.id ? (
              <View style={styles.renameRow}>
                <TextInput
                  style={[inputStyle, styles.renameInput]}
                  value={renameValue}
                  onChangeText={setRenameValue}
                  placeholder={STRINGS.devices.roomName}
                  placeholderTextColor={tokens.textSecondary}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={() => {
                    void submitRenameRoom(room.id);
                  }}
                >
                  <Text style={[styles.rowAction, { color: tokens.primary }]}>
                    {STRINGS.devices.save}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setRenamingRoomId(null)}>
                  <Text
                    style={[styles.rowAction, { color: tokens.textSecondary }]}
                  >
                    {STRINGS.devices.cancel}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.rowLeft}>
                  <Ionicons
                    name={
                      (room.icon ??
                        'home-outline') as keyof typeof Ionicons.glyphMap
                    }
                    size={18}
                    color={tokens.primary}
                  />
                  <View style={styles.rowText}>
                    <Text
                      style={[styles.rowTitle, { color: tokens.textPrimary }]}
                    >
                      {room.name}
                    </Text>
                    <Text
                      style={[styles.rowMeta, { color: tokens.textSecondary }]}
                    >
                      {deviceCountInRoom(room.id)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.iconButton}
                  accessibilityLabel={STRINGS.settings.rename}
                  onPress={() => {
                    setRenamingRoomId(room.id);
                    setRenameValue(room.name);
                  }}
                >
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={tokens.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  accessibilityLabel={STRINGS.settings.remove}
                  onPress={() => startRemoveRoom(room)}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={tokens.danger}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}
        {roomError ? <Text style={styles.errorText}>{roomError}</Text> : null}
        <View style={styles.inlineForm}>
          <TextInput
            style={inputStyle}
            value={roomDraft}
            onChangeText={setRoomDraft}
            placeholder={STRINGS.devices.roomName}
            placeholderTextColor={tokens.textSecondary}
          />
          <TouchableOpacity
            style={styles.addButton}
            onPress={submitRoom}
            disabled={roomDraft.trim().length === 0}
          >
            <Text style={styles.addButtonText}>{STRINGS.devices.addRoom}</Text>
          </TouchableOpacity>
        </View>

        {/* Thiết bị */}
        <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
          {STRINGS.devices.devicesTitle}
        </Text>
        {devices.length === 0 ? (
          <Text style={[styles.hint, { color: tokens.textSecondary }]}>
            {STRINGS.devices.noDevices}
          </Text>
        ) : (
          devices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              rooms={rooms}
              capabilities={capabilities}
              onSave={async patch => onUpdateDevice(device.id, patch)}
              onRemove={() => onRemoveDevice(device.id)}
            />
          ))
        )}
        <AddDeviceCard
          rooms={rooms}
          capabilities={capabilities}
          onAdd={onAddDevice}
        />

        {/* Thông số giám sát */}
        <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
          {STRINGS.settings.capabilitiesSection}
        </Text>
        {catalogError ? (
          <Text style={styles.errorText}>{catalogError}</Text>
        ) : null}
        {capabilities.map(def => (
          <View
            key={def.type}
            style={[
              styles.rowCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name={
                  (def.icon ??
                    'pulse-outline') as keyof typeof Ionicons.glyphMap
                }
                size={18}
                color={resolveCapabilityAccent(def.type, def, tokens)}
              />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
                  {def.label}
                  {def.unit ? ` (${def.unit})` : ''}
                </Text>
                <Text style={[styles.rowMeta, { color: tokens.textSecondary }]}>
                  {def.kind === 'sensor'
                    ? STRINGS.devices.sensor
                    : STRINGS.devices.switch}
                </Text>
              </View>
            </View>
            {def.builtin ? (
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={tokens.textSecondary}
                accessibilityLabel={STRINGS.settings.builtinLocked}
              />
            ) : (
              <TouchableOpacity
                style={styles.iconButton}
                accessibilityLabel={STRINGS.settings.remove}
                onPress={() => {
                  void removeCapability(def.type);
                }}
              >
                <Ionicons
                  name="trash-outline"
                  size={16}
                  color={tokens.danger}
                />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {showAddCapability ? (
          <View
            style={[
              styles.capForm,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            <Text style={[styles.label, { color: tokens.textSecondary }]}>
              Key (machine ID)
            </Text>
            <TextInput
              style={inputStyle}
              value={capType}
              onChangeText={t => {
                setCapType(t);
                if (capError) {
                  setCapError(null);
                }
              }}
              placeholder="pressure"
              placeholderTextColor={tokens.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {capError ? <Text style={styles.errorText}>{capError}</Text> : null}
            <Text style={[styles.label, { color: tokens.textSecondary }]}>
              {STRINGS.settings.capabilityLabel}
            </Text>
            <TextInput
              style={inputStyle}
              value={capLabel}
              onChangeText={t => {
                setCapLabel(t);
                if (capError) {
                  setCapError(null);
                }
              }}
              placeholder="Áp suất"
              placeholderTextColor={tokens.textSecondary}
            />
            <Text style={[styles.label, { color: tokens.textSecondary }]}>
              {STRINGS.settings.capabilityUnit}
            </Text>
            <TextInput
              style={inputStyle}
              value={capUnit}
              onChangeText={setCapUnit}
              placeholder="hPa"
              placeholderTextColor={tokens.textSecondary}
            />
            <Text style={[styles.label, { color: tokens.textSecondary }]}>
              {STRINGS.settings.capabilityIcon}
            </Text>
            <View style={styles.pickerRow}>
              {CAPABILITY_ICONS.map(icon => (
                <TouchableOpacity
                  key={icon}
                  style={[
                    styles.pickerChip,
                    {
                      borderColor:
                        capIcon === icon ? tokens.primary : tokens.border,
                    },
                    capIcon === icon && {
                      backgroundColor: tokens.surfaceElevated,
                    },
                  ]}
                  onPress={() => setCapIcon(icon)}
                >
                  <Ionicons
                    name={icon as keyof typeof Ionicons.glyphMap}
                    size={16}
                    color={tokens.textPrimary}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.label, { color: tokens.textSecondary }]}>
              {STRINGS.settings.capabilityColor}
            </Text>
            <View style={styles.pickerRow}>
              {CAPABILITY_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorChip,
                    { backgroundColor: color },
                    capColor === color && styles.colorChipActive,
                  ]}
                  onPress={() => setCapColor(color)}
                />
              ))}
            </View>
            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: tokens.border }]}
                onPress={() => setShowAddCapability(false)}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: tokens.textSecondary },
                  ]}
                >
                  {STRINGS.settings.cancel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: tokens.primary },
                ]}
                onPress={() => {
                  void submitCapability();
                }}
                disabled={
                  capLabel.trim().length === 0 || capType.trim().length === 0
                }
              >
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: tokens.onPrimary },
                  ]}
                >
                  {STRINGS.widgets.add}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addRow, { borderColor: tokens.primary }]}
            onPress={() => setShowAddCapability(true)}
          >
            <Text style={[styles.addRowText, { color: tokens.primary }]}>
              + {STRINGS.settings.addCapability}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Room removal migration dialog. */}
      <Modal
        visible={removingRoom !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemovingRoom(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: tokens.textPrimary }]}>
              {STRINGS.devices.removeRoom}
            </Text>
            {removingRoom && deviceCountInRoom(removingRoom.id) > 0 ? (
              <>
                <Text
                  style={[styles.modalText, { color: tokens.textSecondary }]}
                >
                  {STRINGS.settings.roomHasDevices.replace(
                    '{n}',
                    String(deviceCountInRoom(removingRoom.id)),
                  )}
                </Text>
                <Pressable
                  style={styles.radioRow}
                  onPress={() => setMigrationKind('move')}
                >
                  <Text
                    style={[
                      styles.radioMark,
                      {
                        color:
                          migrationKind === 'move'
                            ? tokens.primary
                            : tokens.border,
                      },
                    ]}
                  >
                    {'●'}
                  </Text>
                  <Text
                    style={[styles.modalText, { color: tokens.textPrimary }]}
                  >
                    {STRINGS.settings.migrationMove}
                  </Text>
                </Pressable>
                {migrationKind === 'move' ? (
                  <View style={styles.targetList}>
                    {rooms
                      .filter(candidate => candidate.id !== removingRoom.id)
                      .map(candidate => (
                        <Pressable
                          key={candidate.id}
                          style={styles.radioRow}
                          onPress={() => setMigrationTarget(candidate.id)}
                        >
                          <Text
                            style={[
                              styles.radioMark,
                              {
                                color:
                                  migrationTarget === candidate.id
                                    ? tokens.primary
                                    : tokens.border,
                              },
                            ]}
                          >
                            {'●'}
                          </Text>
                          <Text
                            style={[
                              styles.modalText,
                              { color: tokens.textPrimary },
                            ]}
                          >
                            {candidate.name}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                ) : null}
                <Pressable
                  style={styles.radioRow}
                  onPress={() => setMigrationKind('unassign')}
                >
                  <Text
                    style={[
                      styles.radioMark,
                      {
                        color:
                          migrationKind === 'unassign'
                            ? tokens.primary
                            : tokens.border,
                      },
                    ]}
                  >
                    {'●'}
                  </Text>
                  <Text
                    style={[styles.modalText, { color: tokens.textPrimary }]}
                  >
                    {STRINGS.settings.migrationUnassign}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Text style={[styles.modalText, { color: tokens.textSecondary }]}>
                {STRINGS.settings.removeRoomConfirm}
              </Text>
            )}
            {migrationError ? (
              <Text style={styles.errorText}>{migrationError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: tokens.border }]}
                onPress={() => setRemovingRoom(null)}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: tokens.textSecondary },
                  ]}
                >
                  {STRINGS.settings.cancel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: tokens.danger },
                ]}
                onPress={confirmRemoveRoom}
                disabled={
                  migrationKind === 'move' &&
                  (migrationTarget === null ||
                    migrationTarget === removingRoom?.id)
                }
              >
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: tokens.onPrimary },
                  ]}
                >
                  {STRINGS.settings.confirm}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** Shared device-form state (used by both the add card and the editor). */
interface DeviceFormState {
  name: string;
  roomId: string | undefined;
  bindingKind: 'telemetry-sensor' | 'relay';
  relayIndex: 1 | 2 | 3;
  capabilities: CapabilityType[];
  error: string | null;
}

function makeInitialForm(device?: Device): DeviceFormState {
  return {
    name: device?.name ?? '',
    roomId: device?.roomId,
    bindingKind: device?.binding.kind ?? 'telemetry-sensor',
    relayIndex: device?.binding.kind === 'relay' ? device.binding.index : 1,
    capabilities: device
      ? [...device.capabilities]
      : ['temperature', 'humidity'],
    error: null,
  };
}

/** Build a validated service input from the form state (`null` on local error). */
export function formToInput(
  form: DeviceFormState,
  catalog: readonly CapabilityDef[],
): NewDeviceInput | null {
  const name = form.name.trim();
  if (!name) {
    return null;
  }
  if (form.bindingKind === 'relay') {
    return {
      name,
      type: 'relay',
      roomId: form.roomId,
      capabilities: ['switch'],
      binding: { kind: 'relay', index: form.relayIndex },
    };
  }
  const sensorKinds = new Set(
    catalog.filter(def => def.kind === 'sensor').map(def => def.type),
  );
  const selected = form.capabilities.filter(cap => sensorKinds.has(cap));
  if (selected.length === 0) {
    return null;
  }
  return {
    name,
    type: 'sensor',
    roomId: form.roomId,
    capabilities: selected,
    binding: { kind: 'telemetry-sensor' },
  };
}

/** One device row with an expandable full editor (CP-R4). */
function DeviceCard({
  device,
  rooms,
  capabilities,
  onSave,
  onRemove,
}: {
  device: Device;
  rooms: readonly Room[];
  capabilities: readonly CapabilityDef[];
  onSave: (patch: DevicePatch) => Promise<ActionOutcome>;
  onRemove: () => Promise<ActionOutcome>;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeviceFormState>(() =>
    makeInitialForm(device),
  );
  const [saving, setSaving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Form sync (fix cycle 2): track the device object the form was built
  // from and whether the user has unsaved edits.
  const [syncedDevice, setSyncedDevice] = useState(device);
  const [formDirty, setFormDirty] = useState(false);

  // Safe lifecycle boundary (React-endorsed render-phase adjustment): when
  // the parent updates the `device` object (e.g. right after a successful
  // save), re-sync the form from the persisted values — but never clobber
  // active unsaved edits (dirty form while the editor is open). This makes
  // save → parent update → close/reopen show the persisted values.
  if (syncedDevice !== device) {
    setSyncedDevice(device);
    if (!editing || !formDirty) {
      setForm(makeInitialForm(device));
      setFormDirty(false);
    }
  }

  const patchForm = (patch: Partial<DeviceFormState>) => {
    setFormDirty(true);
    return setForm(previous => ({ ...previous, ...patch, error: null }));
  };

  const sensorCatalog = capabilities.filter(def => def.kind === 'sensor');

  const submit = async () => {
    const input = formToInput(form, capabilities);
    if (!input) {
      setForm(previous => ({
        ...previous,
        error: form.name.trim()
          ? STRINGS.devices.noCapability
          : STRINGS.devices.requiredField,
      }));
      return;
    }
    setSaving(true);
    const result = await onSave({
      name: input.name,
      roomId: input.roomId,
      type: input.type,
      capabilities: input.capabilities,
      binding: input.binding,
    });
    setSaving(false);
    if (!result.ok) {
      setForm(previous => ({
        ...previous,
        error: `${STRINGS.devices.saveFailed}${result.message}`,
      }));
      return;
    }
    setEditing(false);
    setFormDirty(false);
  };

  return (
    <View
      style={[
        styles.rowCard,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <View style={styles.rowLeft}>
        <Ionicons
          name={
            (device.binding.kind === 'relay'
              ? 'power-outline'
              : 'hardware-chip-outline') as keyof typeof Ionicons.glyphMap
          }
          size={18}
          color={tokens.primary}
        />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
            {device.name}
          </Text>
          <Text style={[styles.rowMeta, { color: tokens.textSecondary }]}>
            {roomName(rooms, device.roomId)} ·{' '}
            {device.capabilities
              .map(cap => capabilityLabel(cap, capabilities))
              .join(', ')}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.iconButton}
        testID={`device-edit-${device.id}`}
        accessibilityLabel={`${STRINGS.devices.edit} ${device.name}`}
        onPress={() => {
          if (!editing) {
            // State ownership (fix cycle 2): the editor form is re-derived
            // from the CURRENT device prop every time it opens — a save →
            // parent update → reopen cycle can never show stale values.
            setForm(makeInitialForm(device));
            setFormDirty(false);
            setRemoveError(null);
          }
          setEditing(value => !value);
        }}
      >
        <Text style={[styles.rowAction, { color: tokens.primary }]}>
          {editing ? STRINGS.devices.cancel : STRINGS.devices.edit}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.iconButton}
        accessibilityLabel={STRINGS.settings.remove}
        onPress={() => {
          void onRemove().then(result => {
            if (!result.ok) {
              // The card stays; surface why the removal was rejected.
              setRemoveError(result.message);
            } else {
              setRemoveError(null);
            }
          });
        }}
      >
        <Ionicons name="trash-outline" size={16} color={tokens.danger} />
      </TouchableOpacity>

      {removeError ? <Text style={styles.errorText}>{removeError}</Text> : null}

      {editing ? (
        <View style={styles.editForm}>
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            {STRINGS.devices.name}
          </Text>
          <TextInput
            style={styles.input}
            testID="device-name-input"
            value={form.name}
            onChangeText={name => patchForm({ name })}
            placeholder={STRINGS.devices.name}
            placeholderTextColor={tokens.textSecondary}
          />
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            {STRINGS.devices.room}
          </Text>
          <View style={styles.chipWrap}>
            <Pressable
              style={[
                styles.chip,
                form.roomId === undefined && styles.chipActive,
              ]}
              onPress={() => patchForm({ roomId: undefined })}
            >
              <Text
                style={[
                  styles.chipText,
                  form.roomId === undefined && styles.chipTextActive,
                ]}
              >
                {STRINGS.devices.noRoom}
              </Text>
            </Pressable>
            {rooms.map(room => (
              <Pressable
                key={room.id}
                style={[
                  styles.chip,
                  form.roomId === room.id && styles.chipActive,
                ]}
                onPress={() => patchForm({ roomId: room.id })}
              >
                <Text
                  style={[
                    styles.chipText,
                    form.roomId === room.id && styles.chipTextActive,
                  ]}
                >
                  {room.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            {STRINGS.devices.bindingKind}
          </Text>
          <View style={styles.chipWrap}>
            <Pressable
              style={[
                styles.chip,
                form.bindingKind === 'telemetry-sensor' && styles.chipActive,
              ]}
              onPress={() => patchForm({ bindingKind: 'telemetry-sensor' })}
            >
              <Text
                style={[
                  styles.chipText,
                  form.bindingKind === 'telemetry-sensor' &&
                    styles.chipTextActive,
                ]}
              >
                {STRINGS.devices.bindingTelemetry}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.chip,
                form.bindingKind === 'relay' && styles.chipActive,
              ]}
              onPress={() => patchForm({ bindingKind: 'relay' })}
            >
              <Text
                style={[
                  styles.chipText,
                  form.bindingKind === 'relay' && styles.chipTextActive,
                ]}
              >
                {STRINGS.devices.bindingRelay}
              </Text>
            </Pressable>
          </View>
          {form.bindingKind === 'relay' ? (
            <>
              <Text style={[styles.label, { color: tokens.textSecondary }]}>
                {STRINGS.devices.relayIndex}
              </Text>
              <View style={styles.chipWrap}>
                {RELAY_INDEX_OPTIONS.map(index => (
                  <Pressable
                    key={index}
                    style={[
                      styles.chip,
                      form.relayIndex === index && styles.chipActive,
                    ]}
                    onPress={() => patchForm({ relayIndex: index })}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        form.relayIndex === index && styles.chipTextActive,
                      ]}
                    >
                      {index}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: tokens.textSecondary }]}>
                {STRINGS.devices.capabilityHelper}
              </Text>
              <View style={styles.chipWrap}>
                {sensorCatalog.map(def => {
                  const selected = form.capabilities.includes(def.type);
                  return (
                    <Pressable
                      key={def.type}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() =>
                        patchForm({
                          capabilities: selected
                            ? form.capabilities.filter(cap => cap !== def.type)
                            : [...form.capabilities, def.type],
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextActive,
                        ]}
                      >
                        {def.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          {form.error ? (
            <Text style={styles.errorText}>{form.error}</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: tokens.primary }]}
            testID="device-save"
            onPress={() => {
              void submit();
            }}
            disabled={saving}
          >
            <Text
              style={[styles.primaryButtonText, { color: tokens.onPrimary }]}
            >
              {saving ? STRINGS.settings.saving : STRINGS.devices.save}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/** Inline add-device card (same fields as the editor, empty start). */
function AddDeviceCard({
  rooms,
  capabilities,
  onAdd,
}: {
  rooms: readonly Room[];
  capabilities: readonly CapabilityDef[];
  onAdd: (input: NewDeviceInput) => Promise<{ ok: boolean; message: string }>;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DeviceFormState>(() => makeInitialForm());
  const [saving, setSaving] = useState(false);

  const patchForm = (patch: Partial<DeviceFormState>) =>
    setForm(previous => ({ ...previous, ...patch, error: null }));

  const sensorCatalog = capabilities.filter(def => def.kind === 'sensor');

  const submit = async () => {
    const input = formToInput(form, capabilities);
    if (!input) {
      setForm(previous => ({
        ...previous,
        error: form.name.trim()
          ? STRINGS.devices.noCapability
          : STRINGS.devices.requiredField,
      }));
      return;
    }
    setSaving(true);
    const result = await onAdd(input);
    setSaving(false);
    if (!result.ok) {
      setForm(previous => ({
        ...previous,
        error: `${STRINGS.devices.saveFailed}${result.message}`,
      }));
      return;
    }
    setForm(makeInitialForm());
    setOpen(false);
  };

  if (!open) {
    return (
      <TouchableOpacity
        style={[styles.addRow, { borderColor: tokens.primary }]}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.addRowText, { color: tokens.primary }]}>
          + {STRINGS.devices.addDevice}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[
        styles.capForm,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <Text style={[styles.label, { color: tokens.textSecondary }]}>
        {STRINGS.devices.name}
      </Text>
      <TextInput
        style={styles.input}
        value={form.name}
        onChangeText={name => patchForm({ name })}
        placeholder={STRINGS.devices.name}
        placeholderTextColor={tokens.textSecondary}
        autoFocus
      />
      <Text style={[styles.label, { color: tokens.textSecondary }]}>
        {STRINGS.devices.room}
      </Text>
      <View style={styles.chipWrap}>
        <Pressable
          style={[styles.chip, form.roomId === undefined && styles.chipActive]}
          onPress={() => patchForm({ roomId: undefined })}
        >
          <Text
            style={[
              styles.chipText,
              form.roomId === undefined && styles.chipTextActive,
            ]}
          >
            {STRINGS.devices.noRoom}
          </Text>
        </Pressable>
        {rooms.map(room => (
          <Pressable
            key={room.id}
            style={[styles.chip, form.roomId === room.id && styles.chipActive]}
            onPress={() => patchForm({ roomId: room.id })}
          >
            <Text
              style={[
                styles.chipText,
                form.roomId === room.id && styles.chipTextActive,
              ]}
            >
              {room.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.label, { color: tokens.textSecondary }]}>
        {STRINGS.devices.bindingKind}
      </Text>
      <View style={styles.chipWrap}>
        <Pressable
          style={[
            styles.chip,
            form.bindingKind === 'telemetry-sensor' && styles.chipActive,
          ]}
          onPress={() => patchForm({ bindingKind: 'telemetry-sensor' })}
        >
          <Text
            style={[
              styles.chipText,
              form.bindingKind === 'telemetry-sensor' && styles.chipTextActive,
            ]}
          >
            {STRINGS.devices.bindingTelemetry}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.chip,
            form.bindingKind === 'relay' && styles.chipActive,
          ]}
          onPress={() => patchForm({ bindingKind: 'relay' })}
        >
          <Text
            style={[
              styles.chipText,
              form.bindingKind === 'relay' && styles.chipTextActive,
            ]}
          >
            {STRINGS.devices.bindingRelay}
          </Text>
        </Pressable>
      </View>
      {form.bindingKind === 'relay' ? (
        <>
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            {STRINGS.devices.relayIndex}
          </Text>
          <View style={styles.chipWrap}>
            {RELAY_INDEX_OPTIONS.map(index => (
              <Pressable
                key={index}
                style={[
                  styles.chip,
                  form.relayIndex === index && styles.chipActive,
                ]}
                onPress={() => patchForm({ relayIndex: index })}
              >
                <Text
                  style={[
                    styles.chipText,
                    form.relayIndex === index && styles.chipTextActive,
                  ]}
                >
                  {index}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            {STRINGS.devices.capabilityHelper}
          </Text>
          <View style={styles.chipWrap}>
            {sensorCatalog.map(def => {
              const selected = form.capabilities.includes(def.type);
              return (
                <Pressable
                  key={def.type}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() =>
                    patchForm({
                      capabilities: selected
                        ? form.capabilities.filter(cap => cap !== def.type)
                        : [...form.capabilities, def.type],
                    })
                  }
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextActive]}
                  >
                    {def.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      {form.error ? <Text style={styles.errorText}>{form.error}</Text> : null}
      <View style={styles.formActions}>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: tokens.border }]}
          onPress={() => {
            setForm(makeInitialForm());
            setOpen(false);
          }}
        >
          <Text
            style={[
              styles.secondaryButtonText,
              { color: tokens.textSecondary },
            ]}
          >
            {STRINGS.settings.cancel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: tokens.primary }]}
          onPress={() => {
            void submit();
          }}
          disabled={saving}
        >
          <Text style={[styles.primaryButtonText, { color: tokens.onPrimary }]}>
            {saving ? STRINGS.settings.saving : STRINGS.devices.addDevice}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: 16, paddingBottom: 48 },
    screenTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginTop: 20,
      marginBottom: 8,
    },
    label: { fontSize: 13, marginTop: 12, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    rowCard: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    rowText: { flex: 1 },
    rowTitle: { fontSize: 15, fontWeight: '500' },
    rowMeta: { fontSize: 12 },
    rowAction: { fontSize: 13, fontWeight: '600', marginLeft: 8 },
    iconButton: { paddingHorizontal: 6, paddingVertical: 4 },
    renameRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    renameInput: { flex: 1, paddingVertical: 6 },
    inlineForm: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 8,
    },
    addButton: {
      backgroundColor: tokens.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    addButtonText: { color: tokens.onPrimary, fontWeight: '600', fontSize: 13 },
    editForm: { width: '100%', marginTop: 8 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderRadius: 14,
      borderColor: tokens.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: tokens.background,
    },
    chipActive: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    chipText: { fontSize: 13, color: tokens.textPrimary, fontWeight: '500' },
    chipTextActive: { color: tokens.onPrimary, fontWeight: '600' },
    errorText: { color: tokens.danger, fontSize: 12, marginTop: 8 },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingRight: 12,
    },
    backText: { fontSize: 14, fontWeight: '500' },
    hint: { fontSize: 13, marginBottom: 8 },
    capForm: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    pickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 4,
    },
    pickerChip: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    colorChip: {
      width: 28,
      height: 28,
      borderRadius: 14,
    },
    colorChipActive: {
      borderWidth: 2,
      borderColor: '#00000055',
    },
    formActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 12,
    },
    addRow: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      alignItems: 'center',
    },
    addRowText: { fontSize: 14, fontWeight: '600' },
    secondaryButton: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    secondaryButtonText: { fontSize: 14, fontWeight: '600' },
    primaryButton: {
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginTop: 12,
      alignSelf: 'flex-end',
    },
    primaryButtonText: { fontSize: 14, fontWeight: '700' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCard: {
      width: '85%',
      borderRadius: 12,
      borderWidth: 1,
      padding: 16,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
    modalText: { fontSize: 14, marginBottom: 8 },
    radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    radioMark: { fontSize: 14 },
    targetList: { marginLeft: 20, marginBottom: 8 },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 12,
    },
  });
}
