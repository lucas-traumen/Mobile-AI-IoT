/**
 * DeviceManagementScreen — ROOM-FIRST device management (approved
 * room-sensor-derived-history-layout-rework plan, slice A).
 *
 * The user chooses a room ONCE; every child list and creation form inherits
 * it:
 *
 * ```text
 * Room list (+ Thêm phòng)
 * └── Room detail
 *     ├── Cảm biến n/10   (one row per PROJECTED sensor metric)
 *     └── Điều khiển n/10 (one row per relay)
 * ```
 *
 * - There is NO `Tất cả` view, global device filter matrix, repeated room
 *   picker, or binding-kind choice — all rejected semantics are removed.
 * - A user-facing sensor is ONE metric/field (`{roomId, field}` unique,
 *   max 10 per room): a legacy multi-capability board projects as separate
 *   temperature/humidity rows and counters (`2/10`).
 * - Adding a sensor inherits the room and picks exactly one existing metric
 *   (or creates a curated custom metric through the secondary action).
 *   Adding a relay asks only for name + free room-scoped slot 1..10.
 * - Creating a room AWAITS the service result and opens the created room
 *   immediately; failures keep the form open with truthful feedback.
 * - Legacy roomless records stay manageable through a dedicated section on
 *   the room-list screen (assign/delete) — never a global `Tất cả` filter.
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
import {
  OperationBanner,
  useOperationFeedback,
  type OperationFeedback,
} from '@core/ui/OperationBanner';
import type {
  CapabilityDef,
  CapabilityType,
  Device,
  NewCapabilityInput,
  NewDeviceInput,
  Room,
  RoomMigrationTarget,
} from '@modules/devices/api';
import type { DevicePatch } from '../internal/services/deviceRegistryService';
import {
  CAPABILITY_COLORS,
  CAPABILITY_ICON_GROUPS,
  type CapabilityPreset,
} from '../internal/domain/capabilityPresets';
import {
  CAPABILITY_KEY_REGEX,
  MAX_RELAYS_PER_ROOM,
  MAX_SENSORS_PER_ROOM,
  countRoomSensors,
  projectSensorRegistrations,
  relaySlotTakenInRoom,
} from '../internal/domain/devices';

/** Generic action outcome surfaced through the top-center banner. */
export interface ActionOutcome {
  readonly ok: boolean;
  readonly message: string;
}

/** Room creation outcome: carries the created room id (opened on success). */
export type AddRoomOutcome = ActionOutcome & { readonly roomId?: string };

interface DeviceManagementScreenProps {
  /** Navigate back to the Settings root (explicit, always available). */
  readonly onBack: () => void;
  /** All rooms (room list + rename/delete). */
  readonly rooms: readonly Room[];
  /** All devices (projected counters + room detail + legacy section). */
  readonly devices: readonly Device[];
  /** Capability catalog (metric choices + custom metric creation). */
  readonly capabilities: readonly CapabilityDef[];
  /** Add a room; the outcome carries the created room id. The form stays
   *  open on failure and the error is shown. */
  readonly onAddRoom: (name: string) => Promise<AddRoomOutcome>;
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
  /** Add a curated custom metric to the catalog (strict machine key). */
  readonly onAddCapability: (
    input: NewCapabilityInput,
  ) => Promise<ActionOutcome>;
  /** Remove ONE projected sensor metric (binding-level cascade). */
  readonly onRemoveDeviceCapability: (
    deviceId: string,
    field: string,
  ) => Promise<ActionOutcome>;
}

function capabilityLabel(
  capability: CapabilityType,
  catalog: readonly CapabilityDef[],
): string {
  const def = catalog.find(candidate => candidate.type === capability);
  return def ? def.label : capability;
}

/**
 * Device management screen (room list → room detail).
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
  onRemoveDeviceCapability,
}: DeviceManagementScreenProps) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { feedback, exiting, show, clear } = useOperationFeedback();

  // Room-first navigation: the room LIST or one room's DETAIL. The selected
  // room is inherited by every child list and creation form.
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);

  // Add-room form state (await + open on success, truthful failure).
  const [roomDraft, setRoomDraft] = useState('');
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomSaving, setRoomSaving] = useState(false);

  // Room rename state.
  const [renamingRoomId, setRenamingRoomId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Room delete + migration dialog state (CP5 behavior preserved).
  const [removingRoom, setRemovingRoom] = useState<Room | null>(null);
  const [migrationKind, setMigrationKind] =
    useState<RoomMigrationTarget['kind']>('move');
  const [migrationTarget, setMigrationTarget] = useState<string | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  /** Map an action outcome to the top-center banner (general feedback). */
  const notifyOutcome = (outcome: ActionOutcome): ActionOutcome => {
    const severity: OperationFeedback['severity'] = outcome.ok
      ? outcome.message
        ? 'info'
        : 'success'
      : 'error';
    show({
      severity,
      message:
        outcome.message ||
        (outcome.ok ? 'Thao tác thành công' : 'Thao tác thất bại'),
    });
    return outcome;
  };

  /**
   * Room creation (the user-reported broken flow — now a regression-tested
   * contract): await the service, open the CREATED room on success, keep
   * the form + error on failure.
   */
  const submitRoom = async () => {
    const name = roomDraft.trim();
    if (!name || roomSaving) {
      return;
    }
    setRoomError(null);
    setRoomSaving(true);
    const result = await onAddRoom(name);
    setRoomSaving(false);
    if (!result.ok) {
      // Keep the draft so the user can retry; surface the service error.
      setRoomError(result.message);
      notifyOutcome(result);
      return;
    }
    setRoomDraft('');
    notifyOutcome({ ok: true, message: STRINGS.devices.roomCreated });
    if (result.roomId) {
      setOpenRoomId(result.roomId);
    }
  };

  const submitRenameRoom = async (roomId: string) => {
    const name = renameValue.trim();
    if (!name) {
      return;
    }
    const result = await onRenameRoom(roomId, name);
    if (!result.ok) {
      // Keep the rename row open on failure.
      notifyOutcome(result);
      return;
    }
    setRenamingRoomId(null);
    notifyOutcome({ ok: true, message: 'Đã đổi tên phòng' });
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
    if (openRoomId === removingRoom.id) {
      setOpenRoomId(null);
    }
    setRemovingRoom(null);
    notifyOutcome({ ok: true, message: 'Đã xóa phòng' });
  };

  const openRoom = rooms.find(room => room.id === openRoomId) ?? null;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: tokens.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {openRoom ? (
          <TouchableOpacity
            style={styles.backRow}
            accessibilityLabel={STRINGS.settings.back}
            testID="devices-room-back"
            onPress={() => setOpenRoomId(null)}
          >
            <Ionicons name="arrow-back" size={18} color={tokens.primary} />
            <Text style={[styles.backText, { color: tokens.primary }]}>
              {STRINGS.settings.back}
            </Text>
          </TouchableOpacity>
        ) : (
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
        )}
        <Text style={[styles.screenTitle, { color: tokens.textPrimary }]}>
          {openRoom ? openRoom.name : STRINGS.settings.manageDevices}
        </Text>

        {openRoom ? (
          <RoomDetailView
            room={openRoom}
            rooms={rooms}
            devices={devices}
            capabilities={capabilities}
            onAddDevice={onAddDevice}
            onUpdateDevice={onUpdateDevice}
            onRemoveDevice={onRemoveDevice}
            onAddCapability={onAddCapability}
            onRemoveDeviceCapability={onRemoveDeviceCapability}
            notifyOutcome={notifyOutcome}
            styles={styles}
          />
        ) : (
          <RoomsView
            rooms={rooms}
            devices={devices}
            capabilities={capabilities}
            roomDraft={roomDraft}
            roomError={roomError}
            roomSaving={roomSaving}
            renamingRoomId={renamingRoomId}
            renameValue={renameValue}
            onRoomDraftChange={setRoomDraft}
            onRenameValueChange={setRenameValue}
            onOpenRoom={setOpenRoomId}
            onStartRename={roomId => {
              setRenamingRoomId(roomId);
              const room = rooms.find(candidate => candidate.id === roomId);
              setRenameValue(room?.name ?? '');
            }}
            onCancelRename={() => setRenamingRoomId(null)}
            onSubmitRename={submitRenameRoom}
            onSubmitRoom={submitRoom}
            onStartRemoveRoom={startRemoveRoom}
            onRemoveDevice={onRemoveDevice}
            onUpdateDevice={onUpdateDevice}
            notifyOutcome={notifyOutcome}
            styles={styles}
          />
        )}
      </ScrollView>

      {/* Room delete + migration dialog (CP5 behavior preserved). */}
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
              {STRINGS.devices.removeRoom}: {removingRoom?.name ?? ''}
            </Text>
            <Text style={[styles.hint, { color: tokens.textSecondary }]}>
              {'Thiết bị của phòng này sẽ được chuyển đi hoặc bỏ xếp phòng.'}
            </Text>
            {rooms
              .filter(candidate => candidate.id !== removingRoom?.id)
              .map(candidate => (
                <Pressable
                  key={candidate.id}
                  style={[
                    styles.pickerChip,
                    {
                      borderColor:
                        migrationKind === 'move' &&
                        migrationTarget === candidate.id
                          ? tokens.primary
                          : tokens.border,
                    },
                  ]}
                  onPress={() => {
                    setMigrationKind('move');
                    setMigrationTarget(candidate.id);
                  }}
                >
                  <Text style={{ color: tokens.textPrimary }}>
                    {`Chuyển vào ${candidate.name}`}
                  </Text>
                </Pressable>
              ))}
            <Pressable
              style={[
                styles.pickerChip,
                {
                  borderColor:
                    migrationKind === 'unassign'
                      ? tokens.primary
                      : tokens.border,
                },
              ]}
              onPress={() => setMigrationKind('unassign')}
            >
              <Text style={{ color: tokens.textPrimary }}>
                {'Bỏ xếp phòng (bản ghi cũ)'}
              </Text>
            </Pressable>
            {migrationError ? (
              <Text style={[styles.errorText, { color: tokens.danger }]}>
                {migrationError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: tokens.border }]}
                onPress={() => setRemovingRoom(null)}
              >
                <Text style={{ color: tokens.textSecondary }}>
                  {STRINGS.devices.cancel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: tokens.danger,
                    borderColor: tokens.danger,
                  },
                ]}
                onPress={() => {
                  void confirmRemoveRoom();
                }}
              >
                <Text style={{ color: tokens.onPrimary }}>
                  {STRINGS.devices.delete}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Top-center operation feedback (field errors stay inline). */}
      <OperationBanner
        feedback={feedback}
        exiting={exiting}
        onDismiss={clear}
      />
    </KeyboardAvoidingView>
  );
}

interface RoomsViewProps {
  readonly rooms: readonly Room[];
  readonly devices: readonly Device[];
  readonly capabilities: readonly CapabilityDef[];
  readonly roomDraft: string;
  readonly roomError: string | null;
  readonly roomSaving: boolean;
  readonly renamingRoomId: string | null;
  readonly renameValue: string;
  readonly onRoomDraftChange: (value: string) => void;
  readonly onRenameValueChange: (value: string) => void;
  readonly onOpenRoom: (roomId: string) => void;
  readonly onStartRename: (roomId: string) => void;
  readonly onCancelRename: () => void;
  readonly onSubmitRename: (roomId: string) => void;
  readonly onSubmitRoom: () => void;
  readonly onStartRemoveRoom: (room: Room) => void;
  readonly onRemoveDevice: (id: string) => Promise<ActionOutcome>;
  readonly onUpdateDevice: (
    id: string,
    patch: DevicePatch,
  ) => Promise<ActionOutcome>;
  readonly notifyOutcome: (outcome: ActionOutcome) => ActionOutcome;
  readonly styles: ReturnType<typeof makeStyles>;
}

/**
 * The room list: one row per room with truthful projected counters, the
 * explicit `+ Thêm phòng` action and the legacy roomless-records section.
 */
function RoomsView({
  rooms,
  devices,
  capabilities,
  roomDraft,
  roomError,
  roomSaving,
  renamingRoomId,
  renameValue,
  onRoomDraftChange,
  onRenameValueChange,
  onOpenRoom,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onSubmitRoom,
  onStartRemoveRoom,
  onRemoveDevice,
  onUpdateDevice,
  notifyOutcome,
  styles,
}: RoomsViewProps) {
  const { tokens } = useTheme();
  const roomless = devices.filter(device => !device.roomId);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);

  return (
    <View>
      {/* Room rows (projected metric/relay counters mirror the service). */}
      {rooms.map(room => {
        const sensors = countRoomSensors(devices, capabilities, room.id);
        const relayCount = devices.filter(
          device =>
            device.roomId === room.id && device.binding.kind === 'relay',
        ).length;
        const renaming = renamingRoomId === room.id;
        return (
          <View
            key={room.id}
            style={[
              styles.rowCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            {renaming ? (
              <View style={styles.rowMain}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: tokens.surface,
                      borderColor: tokens.border,
                      color: tokens.textPrimary,
                    },
                  ]}
                  value={renameValue}
                  onChangeText={onRenameValueChange}
                  autoFocus
                />
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    onPress={() => onSubmitRename(room.id)}
                    testID={`devices-room-rename-save-${room.id}`}
                  >
                    <Text style={{ color: tokens.primary }}>
                      {STRINGS.devices.save}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onCancelRename}>
                    <Text style={{ color: tokens.textSecondary }}>
                      {STRINGS.devices.cancel}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <Pressable
                  style={styles.rowMain}
                  onPress={() => onOpenRoom(room.id)}
                  accessibilityRole="button"
                  testID={`devices-room-row-${room.id}`}
                >
                  <Text
                    style={[styles.rowTitle, { color: tokens.textPrimary }]}
                  >
                    {room.name}
                  </Text>
                  <Text
                    style={[styles.rowMeta, { color: tokens.textSecondary }]}
                  >
                    {`${STRINGS.devices.sensorsSection} ${sensors}/${MAX_SENSORS_PER_ROOM} · ${STRINGS.devices.controlsSection} ${relayCount}/${MAX_RELAYS_PER_ROOM}`}
                  </Text>
                </Pressable>
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    onPress={() => onStartRename(room.id)}
                    accessibilityLabel={STRINGS.devices.editRoom}
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={18}
                      color={tokens.textSecondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onStartRemoveRoom(room)}
                    accessibilityLabel={STRINGS.devices.removeRoom}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={tokens.danger}
                    />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        );
      })}

      {/* Explicit room creation: await → open on success. */}
      <View
        style={[
          styles.addCard,
          { backgroundColor: tokens.surface, borderColor: tokens.border },
        ]}
      >
        <Text style={[styles.label, { color: tokens.textSecondary }]}>
          {STRINGS.devices.addRoom}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: tokens.surface,
              borderColor: tokens.border,
              color: tokens.textPrimary,
            },
          ]}
          value={roomDraft}
          onChangeText={onRoomDraftChange}
          placeholder={STRINGS.devices.roomName}
          placeholderTextColor={tokens.textSecondary}
          testID="devices-add-room-input"
        />
        {roomError ? (
          <Text style={[styles.errorText, { color: tokens.danger }]}>
            {roomError}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: tokens.primary }]}
          onPress={() => {
            void onSubmitRoom();
          }}
          disabled={roomSaving}
          testID="devices-add-room-submit"
        >
          <Text style={[styles.primaryButtonText, { color: tokens.onPrimary }]}>
            {STRINGS.devices.addRoomAction}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Legacy roomless records: manageable WITHOUT a global Tất cả view. */}
      {roomless.length > 0 ? (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
            {STRINGS.devices.roomlessLegacy} ({roomless.length})
          </Text>
          {roomless.map(device => (
            <View
              key={device.id}
              style={[
                styles.rowCard,
                { backgroundColor: tokens.surface, borderColor: tokens.border },
              ]}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
                  {device.name}
                </Text>
                <Text style={[styles.rowMeta, { color: tokens.textSecondary }]}>
                  {device.type}
                </Text>
              </View>
              <View style={styles.rowActions}>
                {assigningId === device.id ? (
                  <>
                    {rooms.map(room => (
                      <TouchableOpacity
                        key={room.id}
                        onPress={() => setAssignTarget(room.id)}
                        style={[
                          styles.pickerChip,
                          {
                            borderColor:
                              assignTarget === room.id
                                ? tokens.primary
                                : tokens.border,
                          },
                        ]}
                      >
                        <Text style={{ color: tokens.textPrimary }}>
                          {room.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      onPress={() => {
                        void (async () => {
                          if (!assignTarget) {
                            return;
                          }
                          const result = await onUpdateDevice(device.id, {
                            roomId: assignTarget,
                          });
                          setLegacyError(
                            result.ok ? null : result.message || 'Lỗi',
                          );
                          if (result.ok) {
                            setAssigningId(null);
                            setAssignTarget(null);
                          }
                        })();
                      }}
                    >
                      <Text style={{ color: tokens.primary }}>
                        {STRINGS.devices.assignRoom}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => {
                        setAssigningId(device.id);
                        setLegacyError(null);
                      }}
                    >
                      <Text style={{ color: tokens.primary }}>
                        {STRINGS.devices.assignRoom}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        void (async () => {
                          const result = await onRemoveDevice(device.id);
                          if (!result.ok) {
                            setLegacyError(result.message || 'Lỗi');
                          }
                        })();
                      }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={tokens.danger}
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          ))}
          {legacyError ? (
            <Text style={[styles.errorText, { color: tokens.danger }]}>
              {legacyError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

interface RoomDetailViewProps {
  readonly room: Room;
  readonly rooms: readonly Room[];
  readonly devices: readonly Device[];
  readonly capabilities: readonly CapabilityDef[];
  readonly onAddDevice: (input: NewDeviceInput) => Promise<ActionOutcome>;
  readonly onUpdateDevice: (
    id: string,
    patch: DevicePatch,
  ) => Promise<ActionOutcome>;
  readonly onRemoveDevice: (id: string) => Promise<ActionOutcome>;
  readonly onAddCapability: (
    input: NewCapabilityInput,
  ) => Promise<ActionOutcome>;
  readonly onRemoveDeviceCapability: (
    deviceId: string,
    field: string,
  ) => Promise<ActionOutcome>;
  readonly notifyOutcome: (outcome: ActionOutcome) => ActionOutcome;
  readonly styles: ReturnType<typeof makeStyles>;
}

/**
 * One room's detail: ONLY the `Cảm biến n/10` and `Điều khiển n/10`
 * sections. The room is inherited — no room picker, no binding-kind choice.
 */
function RoomDetailView({
  room,
  devices,
  capabilities,
  onAddDevice,
  onUpdateDevice,
  onRemoveDevice,
  onAddCapability,
  onRemoveDeviceCapability,
  notifyOutcome,
  styles,
}: RoomDetailViewProps) {
  const { tokens } = useTheme();
  const [section, setSection] = useState<'sensors' | 'controls'>('sensors');
  const sensorCount = countRoomSensors(devices, capabilities, room.id);
  const relayCount = devices.filter(
    device => device.roomId === room.id && device.binding.kind === 'relay',
  ).length;

  return (
    <View>
      {/* Truthful section tabs (the room is already chosen). */}
      <View style={styles.sectionTabs}>
        <TouchableOpacity
          style={[
            styles.sectionTab,
            { borderColor: tokens.border },
            section === 'sensors' && {
              backgroundColor: tokens.primary,
              borderColor: tokens.primary,
            },
          ]}
          onPress={() => setSection('sensors')}
          testID="devices-section-sensors"
        >
          <Text
            style={{
              color:
                section === 'sensors' ? tokens.onPrimary : tokens.textPrimary,
            }}
          >
            {`${STRINGS.devices.sensorsSection} ${sensorCount}/${MAX_SENSORS_PER_ROOM}`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sectionTab,
            { borderColor: tokens.border },
            section === 'controls' && {
              backgroundColor: tokens.primary,
              borderColor: tokens.primary,
            },
          ]}
          onPress={() => setSection('controls')}
          testID="devices-section-controls"
        >
          <Text
            style={{
              color:
                section === 'controls' ? tokens.onPrimary : tokens.textPrimary,
            }}
          >
            {`${STRINGS.devices.controlsSection} ${relayCount}/${MAX_RELAYS_PER_ROOM}`}
          </Text>
        </TouchableOpacity>
      </View>

      {section === 'sensors' ? (
        <SensorsSection
          room={room}
          devices={devices}
          capabilities={capabilities}
          onAddDevice={onAddDevice}
          onUpdateDevice={onUpdateDevice}
          onAddCapability={onAddCapability}
          onRemoveDeviceCapability={onRemoveDeviceCapability}
          notifyOutcome={notifyOutcome}
          styles={styles}
        />
      ) : (
        <ControlsSection
          room={room}
          devices={devices}
          onAddDevice={onAddDevice}
          onUpdateDevice={onUpdateDevice}
          onRemoveDevice={onRemoveDevice}
          notifyOutcome={notifyOutcome}
          styles={styles}
        />
      )}
    </View>
  );
}

interface SensorsSectionProps {
  readonly room: Room;
  readonly devices: readonly Device[];
  readonly capabilities: readonly CapabilityDef[];
  readonly onAddDevice: (input: NewDeviceInput) => Promise<ActionOutcome>;
  readonly onUpdateDevice: (
    id: string,
    patch: DevicePatch,
  ) => Promise<ActionOutcome>;
  readonly onAddCapability: (
    input: NewCapabilityInput,
  ) => Promise<ActionOutcome>;
  readonly onRemoveDeviceCapability: (
    deviceId: string,
    field: string,
  ) => Promise<ActionOutcome>;
  readonly notifyOutcome: (outcome: ActionOutcome) => ActionOutcome;
  readonly styles: ReturnType<typeof makeStyles>;
}

/**
 * The room's sensor section: one row per PROJECTED metric registration.
 * Deleting a row removes exactly that metric (legacy siblings survive).
 */
function SensorsSection({
  room,
  devices,
  capabilities,
  onAddDevice,
  onUpdateDevice,
  onAddCapability,
  onRemoveDeviceCapability,
  notifyOutcome,
  styles,
}: SensorsSectionProps) {
  const { tokens } = useTheme();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [field, setField] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showCustomMetric, setShowCustomMetric] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const registrations = projectSensorRegistrations(
    devices,
    capabilities,
  ).filter(registration => registration.roomId === room.id);

  // Available metric choices: sensor-kind catalog fields not yet registered
  // in this room (duplicate/full choices are omitted with truthful copy).
  const takenFields = new Set(registrations.map(entry => entry.field));
  const availableFields = capabilities
    .filter(def => def.kind === 'sensor')
    .filter(def => !takenFields.has(def.type));
  const roomFull = registrations.length >= MAX_SENSORS_PER_ROOM;

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
      setFormError(result.message || 'Lỗi');
      notifyOutcome(result);
      return;
    }
    setName('');
    setField(null);
    setAdding(false);
    notifyOutcome({ ok: true, message: STRINGS.devices.addSensor });
  };

  return (
    <View>
      {registrations.map(registration => {
        const def = capabilities.find(
          candidate => candidate.type === registration.field,
        );
        const label = def?.label ?? registration.field;
        return (
          <View
            key={`${registration.deviceId}:${registration.field}`}
            style={[
              styles.rowCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
            testID={`devices-sensor-row-${registration.deviceId}-${registration.field}`}
          >
            <View style={styles.rowMain}>
              <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
                {label}
              </Text>
              <Text style={[styles.rowMeta, { color: tokens.textSecondary }]}>
                {registration.deviceName}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() => {
                  void (async () => {
                    const result = await onRemoveDeviceCapability(
                      registration.deviceId,
                      registration.field,
                    );
                    if (!result.ok) {
                      setRowError(result.message || 'Lỗi');
                      notifyOutcome(result);
                      return;
                    }
                    setRowError(null);
                    notifyOutcome({
                      ok: true,
                      message: STRINGS.devices.sensorMetricRemoved,
                    });
                  })();
                }}
                accessibilityLabel={STRINGS.devices.delete}
                testID={`devices-sensor-delete-${registration.deviceId}-${registration.field}`}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={tokens.danger}
                />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      {rowError ? (
        <Text style={[styles.errorText, { color: tokens.danger }]}>
          {rowError}
        </Text>
      ) : null}

      {adding ? (
        <View
          style={[
            styles.addCard,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
        >
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            {STRINGS.devices.name}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: tokens.surface,
                borderColor: tokens.border,
                color: tokens.textPrimary,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder={
              capabilityLabel(field ?? '', capabilities) || 'Nhiệt độ'
            }
            placeholderTextColor={tokens.textSecondary}
            testID="devices-add-sensor-name"
          />
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            {STRINGS.devices.selectField}
          </Text>
          {roomFull || availableFields.length === 0 ? (
            <Text style={[styles.hint, { color: tokens.textSecondary }]}>
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
                        field === def.type ? tokens.primary : tokens.border,
                    },
                    field === def.type && {
                      backgroundColor: tokens.surfaceElevated,
                    },
                  ]}
                  onPress={() => setField(def.type)}
                  testID={`devices-field-${def.type}`}
                >
                  <Text style={{ color: tokens.textPrimary }}>{def.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {formError ? (
            <Text style={[styles.errorText, { color: tokens.danger }]}>
              {formError}
            </Text>
          ) : null}
          <View style={styles.rowActions}>
            <TouchableOpacity
              onPress={() => {
                setAdding(false);
                setFormError(null);
              }}
            >
              <Text style={{ color: tokens.textSecondary }}>
                {STRINGS.devices.cancel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                void submitSensor();
              }}
              disabled={roomFull || !field}
              testID="devices-add-sensor-submit"
            >
              <Text
                style={{
                  color:
                    roomFull || !field ? tokens.textSecondary : tokens.primary,
                }}
              >
                {STRINGS.devices.save}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Secondary curated custom-metric creation (NOT a primary tab). */}
          <TouchableOpacity
            onPress={() => setShowCustomMetric(value => !value)}
            testID="devices-custom-metric-toggle"
          >
            <Text style={{ color: tokens.primary, marginTop: 8 }}>
              {showCustomMetric
                ? STRINGS.devices.cancel
                : STRINGS.devices.customMetric}
            </Text>
          </TouchableOpacity>
          {showCustomMetric ? (
            <CustomMetricForm
              capabilities={capabilities}
              styles={styles}
              onAdd={onAddCapability}
              onCreated={() => setShowCustomMetric(false)}
            />
          ) : null}
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: tokens.primary }]}
          onPress={() => setAdding(true)}
          testID="devices-add-sensor-toggle"
        >
          <Text style={[styles.primaryButtonText, { color: tokens.onPrimary }]}>
            {`+ ${STRINGS.devices.addSensor}`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * Curated custom-metric creation (machine key immutable after creation;
 * presets fill key/label/unit — approved CP-R4 behavior).
 */
function CustomMetricForm({
  capabilities,
  styles,
  onAdd,
  onCreated,
}: {
  capabilities: readonly CapabilityDef[];
  styles: ReturnType<typeof makeStyles>;
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

  return (
    <View
      style={[
        styles.addCard,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <Text style={[styles.label, { color: tokens.textSecondary }]}>
        {STRINGS.devices.capabilityKeyLabel}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: tokens.surface,
            borderColor:
              !keyFormatValid && trimmedKey ? tokens.danger : tokens.border,
            color: tokens.textPrimary,
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
        placeholderTextColor={tokens.textSecondary}
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
        <Text style={[styles.hint, { color: tokens.textSecondary }]}>
          {STRINGS.devices.capabilityKeyHint}
        </Text>
      ) : null}

      <Text style={[styles.label, { color: tokens.textSecondary }]}>
        {STRINGS.settings.capabilityLabel}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: tokens.surface,
            borderColor: tokens.border,
            color: tokens.textPrimary,
          },
        ]}
        value={capLabel}
        onChangeText={setCapLabel}
        placeholder="Áp suất"
        placeholderTextColor={tokens.textSecondary}
        testID="capability-label-input"
      />

      <Text style={[styles.label, { color: tokens.textSecondary }]}>
        {STRINGS.settings.capabilityUnit}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: tokens.surface,
            borderColor: tokens.border,
            color: tokens.textPrimary,
          },
        ]}
        value={capUnit}
        onChangeText={setCapUnit}
        placeholder="hPa"
        placeholderTextColor={tokens.textSecondary}
      />

      <Text style={[styles.label, { color: tokens.textSecondary }]}>
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
                  capIcon === group.icon ? tokens.primary : tokens.border,
              },
              capIcon === group.icon && {
                backgroundColor: tokens.surfaceElevated,
              },
            ]}
            onPress={() => {
              setCapIcon(group.icon);
              setActiveGroup(group.icon);
            }}
            testID={`capability-icon-${group.icon}`}
          >
            <Ionicons
              name={group.icon as keyof typeof Ionicons.glyphMap}
              size={18}
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
              style={[styles.pickerChip, { borderColor: tokens.border }]}
              onPress={() => applyPreset(preset)}
              testID={`capability-preset-${preset.key}`}
            >
              <Text style={{ color: tokens.textPrimary }}>
                {`${preset.label}${preset.unit ? ` (${preset.unit})` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

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
              capColor === color && { borderColor: tokens.primary },
            ]}
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
    </View>
  );
}

interface ControlsSectionProps {
  readonly room: Room;
  readonly devices: readonly Device[];
  readonly onAddDevice: (input: NewDeviceInput) => Promise<ActionOutcome>;
  readonly onUpdateDevice: (
    id: string,
    patch: DevicePatch,
  ) => Promise<ActionOutcome>;
  readonly onRemoveDevice: (id: string) => Promise<ActionOutcome>;
  readonly notifyOutcome: (outcome: ActionOutcome) => ActionOutcome;
  readonly styles: ReturnType<typeof makeStyles>;
}

/**
 * The room's relay section: name + free room-scoped slot 1..10 — the room
 * and the switch capability are inherited, never asked again.
 */
function ControlsSection({
  room,
  devices,
  onAddDevice,
  onUpdateDevice,
  onRemoveDevice,
  notifyOutcome,
  styles,
}: ControlsSectionProps) {
  const { tokens } = useTheme();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [slot, setSlot] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const relays = devices.filter(
    device => device.roomId === room.id && device.binding.kind === 'relay',
  );
  const takenSlots = new Set<number>(
    relays.flatMap(device =>
      device.binding.kind === 'relay' ? [device.binding.index] : [],
    ),
  );
  const freeSlots = Array.from({ length: MAX_RELAYS_PER_ROOM }, (_, i) => i + 1)
    .filter(candidate => !takenSlots.has(candidate))
    .filter(candidate => !relaySlotTakenInRoom(devices, room.id, candidate));

  const submitRelay = async () => {
    if (slot === null) {
      setFormError(STRINGS.devices.requiredField);
      return;
    }
    setFormError(null);
    const result = await onAddDevice({
      name: name.trim() || `Rơ le ${slot}`,
      roomId: room.id,
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: slot as 1 },
    });
    if (!result.ok) {
      setFormError(result.message || 'Lỗi');
      notifyOutcome(result);
      return;
    }
    setName('');
    setSlot(null);
    setAdding(false);
    notifyOutcome({ ok: true, message: STRINGS.devices.addRelay });
  };

  return (
    <View>
      {relays.map(device => (
        <View
          key={device.id}
          style={[
            styles.rowCard,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
          testID={`devices-relay-row-${device.id}`}
        >
          {renamingId === device.id ? (
            <View style={styles.rowMain}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: tokens.surface,
                    borderColor: tokens.border,
                    color: tokens.textPrimary,
                  },
                ]}
                value={renameValue}
                onChangeText={setRenameValue}
                autoFocus
              />
              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={() => {
                    void (async () => {
                      const result = await onUpdateDevice(device.id, {
                        name: renameValue.trim() || device.name,
                      });
                      if (!result.ok) {
                        setRowError(result.message || 'Lỗi');
                        return;
                      }
                      setRenamingId(null);
                    })();
                  }}
                >
                  <Text style={{ color: tokens.primary }}>
                    {STRINGS.devices.save}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setRenamingId(null)}>
                  <Text style={{ color: tokens.textSecondary }}>
                    {STRINGS.devices.cancel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
                  {device.name}
                </Text>
                <Text style={[styles.rowMeta, { color: tokens.textSecondary }]}>
                  {STRINGS.devices.chooseSlot}:{' '}
                  {device.binding.kind === 'relay' ? device.binding.index : ''}
                </Text>
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={() => {
                    setRenamingId(device.id);
                    setRenameValue(device.name);
                  }}
                  accessibilityLabel={STRINGS.devices.edit}
                >
                  <Ionicons
                    name="pencil-outline"
                    size={18}
                    color={tokens.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    void (async () => {
                      const result = await onRemoveDevice(device.id);
                      if (!result.ok) {
                        setRowError(result.message || 'Lỗi');
                      }
                    })();
                  }}
                  accessibilityLabel={STRINGS.devices.delete}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={tokens.danger}
                  />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ))}
      {rowError ? (
        <Text style={[styles.errorText, { color: tokens.danger }]}>
          {rowError}
        </Text>
      ) : null}

      {adding ? (
        <View
          style={[
            styles.addCard,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
        >
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            {STRINGS.devices.name}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: tokens.surface,
                borderColor: tokens.border,
                color: tokens.textPrimary,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="Đèn"
            placeholderTextColor={tokens.textSecondary}
            testID="devices-add-relay-name"
          />
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
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
                      slot === candidate ? tokens.primary : tokens.border,
                  },
                  slot === candidate && {
                    backgroundColor: tokens.surfaceElevated,
                  },
                ]}
                onPress={() => setSlot(candidate)}
                testID={`devices-slot-${candidate}`}
              >
                <Text style={{ color: tokens.textPrimary }}>{candidate}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {formError ? (
            <Text style={[styles.errorText, { color: tokens.danger }]}>
              {formError}
            </Text>
          ) : null}
          <View style={styles.rowActions}>
            <TouchableOpacity
              onPress={() => {
                setAdding(false);
                setFormError(null);
              }}
            >
              <Text style={{ color: tokens.textSecondary }}>
                {STRINGS.devices.cancel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                void submitRelay();
              }}
              disabled={slot === null}
              testID="devices-add-relay-submit"
            >
              <Text
                style={{
                  color: slot === null ? tokens.textSecondary : tokens.primary,
                }}
              >
                {STRINGS.devices.save}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: tokens.primary }]}
          onPress={() => setAdding(true)}
          testID="devices-add-relay-toggle"
        >
          <Text style={[styles.primaryButtonText, { color: tokens.onPrimary }]}>
            {`+ ${STRINGS.devices.addRelay}`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: 16, paddingBottom: 48 },
    screenTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingRight: 12,
    },
    backText: { fontSize: 14, fontWeight: '500' },
    sectionTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    sectionTab: {
      flex: 1,
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 8,
      paddingVertical: 10,
      backgroundColor: tokens.surface,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginTop: 20,
      marginBottom: 8,
    },
    sectionBlock: { marginTop: 8 },
    label: { fontSize: 13, marginTop: 12, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    rowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      gap: 8,
    },
    rowMain: { flex: 1 },
    rowTitle: { fontSize: 15, fontWeight: '600' },
    rowMeta: { fontSize: 12, marginTop: 2 },
    rowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    },
    addCard: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
      marginBottom: 8,
    },
    primaryButton: {
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 12,
    },
    primaryButtonText: { fontSize: 15, fontWeight: '600' },
    pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    pickerChip: {
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    colorChip: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    errorText: { fontSize: 12, marginTop: 4 },
    hint: { fontSize: 12, marginTop: 4, lineHeight: 16 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      gap: 8,
    },
    modalTitle: { fontSize: 16, fontWeight: '700' },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 8,
    },
    modalButton: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
  });
}
