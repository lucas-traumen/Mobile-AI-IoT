/**
 * BoardsScreen — the hardware-boards discovery surface
 * (board-discovery-binding plan items 10 + 12; descriptor-driven body per
 * boards-topic-contract-v2).
 *
 * One gel card per board discovered on the broker (from the RETAINED
 * `<prefix>/boards/<code>/descriptor` + `<prefix>/boards/<code>/status`
 * topics — the inventory itself lives in
 * `BoardInventoryService`/`boardStore`):
 *
 * - header: the descriptor `displayName` when the board published one (the
 *   stable mono board code stays visible as secondary text), or the bare
 *   mono code otherwise + a status chip (online = the smart teal accent,
 *   offline = neutral gray, seen = secondary caption — "descriptor seen, no
 *   status message yet");
 * - body: the DESCRIPTOR data — the board type, the declared sensor
 *   channels as `S<n> → catalog label` (raw field fallback) and the
 *   declared relay channels compressed to K-ranges (`K1–K3`); a board
 *   without a descriptor yet shows the honest hint;
 * - footer: `Phòng: {tên}` or `Chưa gán phòng`, plus the binding actions —
 *   assigned boards offer `Gán vào phòng khác` / `Gỡ gán`, unassigned ones
 *   offer `Gán vào phòng`. Both go through a centered confirm dialog (the
 *   devices module's dialog recipe) and end in `updateRoom` at the
 *   composition root (the registry validates board-code uniqueness, so two
 *   rooms can never share a board).
 *
 * Visual language: the shared Smart Home wash + `tokens.smart` — no new
 * palette. All labels come from `STRINGS.boards`.
 */

import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { STRINGS } from '@core/i18n';
import { useTheme, type ThemeTokens } from '@core/theme';
import type {
  BoardInventoryEntry,
  CapabilityDef,
  Room,
} from '@modules/devices/api';
import { boardAssignment } from '../internal/domain/devices';

/** Generic action outcome surfaced through the confirm dialog. */
export interface BoardActionOutcome {
  readonly ok: boolean;
  readonly message: string;
}

interface BoardsScreenProps {
  /** Navigate back to the Settings root (explicit, always available). */
  readonly onBack: () => void;
  /** Discovered boards (board store snapshot). */
  readonly boards: readonly BoardInventoryEntry[];
  /** All rooms (binding targets + `Phòng:` footer). */
  readonly rooms: readonly Room[];
  /** Capability catalog (field labels). */
  readonly capabilities: readonly CapabilityDef[];
  /** Bind the board to a room (registry-validated unique code). */
  readonly onAssignBoard: (
    code: string,
    roomId: string,
  ) => Promise<BoardActionOutcome>;
  /** Clear a room's board binding. */
  readonly onUnassignBoard: (code: string) => Promise<BoardActionOutcome>;
}

/** Pick-list order: online boards first, then seen, offline last. */
export function sortBoardsOnlineFirst(
  boards: readonly BoardInventoryEntry[],
): readonly BoardInventoryEntry[] {
  const rank = (status: BoardInventoryEntry['status']): number =>
    status === 'online' ? 0 : status === 'seen' ? 1 : 2;
  return [...boards].sort(
    (a, b) => rank(a.status) - rank(b.status) || a.code.localeCompare(b.code),
  );
}

/** Mono-ish font for the board code (the wire identity). */
const monoFontFamily = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
});

/**
 * Compress declared relay channels into `K`-range labels (pure):
 * `['K1','K2','K3']` → `K1–K3`, `['K1','K3']` → `K1, K3`,
 * `['K2']` → `K2`. Numeric adjacency (not array adjacency) decides a run,
 * and the input order does not matter.
 */
export function compressRelayChannels(channels: readonly string[]): string {
  const slots = channels
    .map(channel => Number(channel.replace(/^K/, '')))
    .filter(slot => Number.isInteger(slot) && slot >= 1 && slot <= 10)
    .sort((a, b) => a - b);
  const parts: string[] = [];
  let index = 0;
  while (index < slots.length) {
    const start = slots[index]!;
    let end = start;
    while (index + 1 < slots.length && slots[index + 1] === end + 1) {
      end = slots[index + 1]!;
      index += 1;
    }
    parts.push(start === end ? `K${start}` : `K${start}–K${end}`);
    index += 1;
  }
  return parts.join(', ');
}

function statusColor(
  status: BoardInventoryEntry['status'],
  tokens: ThemeTokens,
): string {
  switch (status) {
    case 'online':
      return tokens.smart.colors.teal;
    case 'offline':
      return tokens.smart.colors.neutral;
    case 'seen':
      return tokens.smart.colors.textSecondary;
  }
}

/**
 * The hardware-boards screen: one gel card per discovered board.
 */
export function BoardsScreen({
  onBack,
  boards,
  rooms,
  capabilities,
  onAssignBoard,
  onUnassignBoard,
}: BoardsScreenProps) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  // Board↔room mapping: the pure selector over the rooms snapshot decides
  // which room (if any) each board is bound to.
  const assignment = useMemo(() => boardAssignment(rooms), [rooms]);

  // Confirm-dialog state: one open dialog at a time (assign or unassign).
  const [assigning, setAssigning] = useState<BoardInventoryEntry | null>(null);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState<{
    board: BoardInventoryEntry;
    room: Room;
  } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startAssign = (board: BoardInventoryEntry) => {
    setAssigning(board);
    setAssignTarget(null);
    setDialogError(null);
  };

  const confirmAssign = async () => {
    if (!assigning || !assignTarget || busy) {
      return;
    }
    setBusy(true);
    const result = await onAssignBoard(assigning.code, assignTarget);
    setBusy(false);
    if (!result.ok) {
      // Keep the dialog open so the user can pick a different room.
      setDialogError(result.message);
      return;
    }
    setAssigning(null);
  };

  const confirmUnassign = async () => {
    if (!unassigning || busy) {
      return;
    }
    setBusy(true);
    const result = await onUnassignBoard(unassigning.board.code);
    setBusy(false);
    if (!result.ok) {
      setDialogError(result.message);
      return;
    }
    setUnassigning(null);
  };

  const targetRoom = assigning
    ? rooms.find(room => room.id === assignTarget) ?? null
    : null;
  // Assignment targets: every room EXCEPT the one currently bound to this
  // board (re-picking it would be a no-op). A room bound to ANOTHER board
  // is a valid target — assigning replaces its code (the "replace a broken
  // board" flow; the registry guarantees the code is never shared).
  const assignedRoomId = assigning
    ? assignment.get(assigning.code)?.id
    : undefined;
  const assignCandidates = rooms.filter(room => room.id !== assignedRoomId);

  return (
    // The ambient Smart Home wash — same recipe as the management screens.
    <LinearGradient
      colors={[
        tokens.smart.colors.tealTint,
        tokens.smart.colors.page,
        tokens.smart.colors.amberTint,
      ]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.flex}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.backRow}
          accessibilityLabel={STRINGS.settings.back}
          testID="boards-back"
          onPress={onBack}
        >
          <Ionicons name="arrow-back" size={18} color={tokens.primary} />
          <Text style={[styles.backText, { color: tokens.primary }]}>
            {STRINGS.settings.back}
          </Text>
        </TouchableOpacity>
        <Text
          style={[
            styles.screenTitle,
            { color: tokens.smart.colors.textPrimary },
          ]}
        >
          {STRINGS.boards.title}
        </Text>

        {boards.length === 0 ? (
          <Text
            style={[
              styles.emptyHint,
              { color: tokens.smart.colors.textSecondary },
            ]}
            testID="boards-empty"
          >
            {STRINGS.boards.empty}
          </Text>
        ) : (
          sortBoardsOnlineFirst(boards).map(board => {
            const boundRoom = assignment.get(board.code) ?? null;
            return (
              <View
                key={board.code}
                style={[
                  styles.boardCard,
                  {
                    backgroundColor: tokens.smart.colors.card,
                    borderColor: tokens.smart.colors.cardBorder,
                  },
                ]}
                testID={`boards-card-${board.code}`}
              >
                {/* Header: friendly display name (descriptor) with the
                    mono board code kept visible as secondary text, or the
                    bare code when no displayName exists + status chip. */}
                <View style={styles.boardHeader}>
                  <View style={styles.boardTitleColumn}>
                    <Text
                      style={[
                        styles.boardCode,
                        { color: tokens.smart.colors.textPrimary },
                      ]}
                    >
                      {board.descriptor?.displayName ?? board.code}
                    </Text>
                    {board.descriptor?.displayName ? (
                      <Text
                        style={[
                          styles.boardCodeSecondary,
                          { color: tokens.smart.colors.textSecondary },
                        ]}
                      >
                        {board.code}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.statusChip,
                      { borderColor: statusColor(board.status, tokens) },
                    ]}
                    testID={`boards-status-${board.code}`}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: statusColor(board.status, tokens) },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        { color: statusColor(board.status, tokens) },
                      ]}
                    >
                      {board.status === 'online'
                        ? STRINGS.boards.online
                        : board.status === 'offline'
                        ? STRINGS.boards.offline
                        : STRINGS.boards.seen}
                    </Text>
                  </View>
                </View>

                {/* Body: DESCRIPTOR data (boards contract v2) — the board
                    type, the declared sensor channels mapped to the
                    capability-catalog labels (raw field fallback) and the
                    declared relay channels compressed to K-ranges. A board
                    without a descriptor yet shows the honest hint. */}
                {board.descriptor ? (
                  <>
                    <Text
                      style={[
                        styles.boardMeta,
                        { color: tokens.smart.colors.textSecondary },
                      ]}
                      testID={`boards-type-${board.code}`}
                    >
                      {`${STRINGS.boards.boardTypeLabel}: ${board.descriptor.boardType}`}
                    </Text>
                    <Text
                      style={[
                        styles.boardMeta,
                        { color: tokens.smart.colors.textSecondary },
                      ]}
                      testID={`boards-sensors-${board.code}`}
                    >
                      {board.descriptor.sensors.length > 0
                        ? `${
                            STRINGS.boards.fieldsLabel
                          }: ${board.descriptor.sensors
                            .map(sensor => {
                              const label =
                                capabilities.find(
                                  def => def.type === sensor.field,
                                )?.label ?? sensor.field;
                              return `${sensor.channel} → ${label}`;
                            })
                            .join(', ')}`
                        : STRINGS.boards.noFields}
                    </Text>
                    {board.descriptor.relays.length > 0 ? (
                      <Text
                        style={[
                          styles.boardMeta,
                          { color: tokens.smart.colors.textSecondary },
                        ]}
                        testID={`boards-relays-${board.code}`}
                      >
                        {STRINGS.boards.relayChannels.replace(
                          '{channels}',
                          compressRelayChannels(board.descriptor.relays),
                        )}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text
                    style={[
                      styles.boardMeta,
                      { color: tokens.smart.colors.textSecondary },
                    ]}
                    testID={`boards-nodescriptor-${board.code}`}
                  >
                    {STRINGS.boards.noDescriptor}
                  </Text>
                )}

                {/* Footer: binding state + actions (item 12). */}
                <View style={styles.boardFooter}>
                  <Text
                    style={[
                      styles.roomLabel,
                      { color: tokens.smart.colors.textSecondary },
                    ]}
                    testID={`boards-room-${board.code}`}
                  >
                    {boundRoom
                      ? STRINGS.boards.roomLabel.replace(
                          '{name}',
                          boundRoom.name,
                        )
                      : STRINGS.boards.roomUnassigned}
                  </Text>
                  <View style={styles.boardActions}>
                    <TouchableOpacity
                      onPress={() => startAssign(board)}
                      testID={`boards-assign-${board.code}`}
                    >
                      <Text style={{ color: tokens.primary }}>
                        {boundRoom
                          ? STRINGS.boards.reassign
                          : STRINGS.boards.assign}
                      </Text>
                    </TouchableOpacity>
                    {boundRoom ? (
                      <TouchableOpacity
                        onPress={() => {
                          setUnassigning({ board, room: boundRoom });
                          setDialogError(null);
                        }}
                        testID={`boards-unassign-${board.code}`}
                      >
                        <Text style={{ color: tokens.danger }}>
                          {STRINGS.boards.unassign}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Assign confirm dialog (the devices module's centered-dialog
          recipe): pick the target room, confirm, service validates. */}
      <Modal
        visible={assigning !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAssigning(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAssigning(null)}
            accessibilityRole="button"
            accessibilityLabel={STRINGS.devices.cancel}
            testID="boards-assign-scrim"
          />
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: tokens.smart.colors.card,
                borderColor: tokens.smart.colors.cardBorder,
              },
              tokens.smart.cardShadow,
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: tokens.smart.colors.textPrimary },
              ]}
            >
              {STRINGS.boards.assignTitle}
            </Text>
            <Text
              style={[
                styles.hint,
                { color: tokens.smart.colors.textSecondary },
              ]}
            >
              {STRINGS.boards.assignConfirm
                .replace('{code}', assigning?.code ?? '')
                .replace('{room}', targetRoom?.name ?? '…')}
            </Text>
            {assignCandidates.map(candidate => (
              <Pressable
                key={candidate.id}
                style={[
                  styles.pickerChip,
                  {
                    borderColor:
                      assignTarget === candidate.id
                        ? tokens.primary
                        : tokens.smart.colors.cardBorder,
                  },
                ]}
                onPress={() => setAssignTarget(candidate.id)}
                testID={`boards-assign-target-${candidate.id}`}
              >
                <Text style={{ color: tokens.smart.colors.textPrimary }}>
                  {candidate.name}
                </Text>
              </Pressable>
            ))}
            {assignCandidates.length === 0 ? (
              <Text
                style={[
                  styles.hint,
                  { color: tokens.smart.colors.textSecondary },
                ]}
              >
                {STRINGS.boards.noRoomAvailable}
              </Text>
            ) : null}
            {dialogError ? (
              <Text style={[styles.errorText, { color: tokens.danger }]}>
                {dialogError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { borderColor: tokens.smart.colors.cardBorder },
                ]}
                onPress={() => setAssigning(null)}
                testID="boards-assign-cancel"
              >
                <Text style={{ color: tokens.smart.colors.textSecondary }}>
                  {STRINGS.devices.cancel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: tokens.primary,
                    borderColor: tokens.primary,
                  },
                  !assignTarget && { opacity: 0.5 },
                ]}
                disabled={!assignTarget || busy}
                onPress={() => {
                  void confirmAssign();
                }}
                testID="boards-assign-confirm"
              >
                <Text style={{ color: tokens.onPrimary }}>
                  {STRINGS.settings.confirm}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unassign confirm dialog (same recipe, destructive tone). */}
      <Modal
        visible={unassigning !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setUnassigning(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setUnassigning(null)}
            accessibilityRole="button"
            accessibilityLabel={STRINGS.devices.cancel}
            testID="boards-unassign-scrim"
          />
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: tokens.smart.colors.card,
                borderColor: tokens.smart.colors.cardBorder,
              },
              tokens.smart.cardShadow,
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: tokens.smart.colors.textPrimary },
              ]}
            >
              {STRINGS.boards.unassignTitle}
            </Text>
            <Text
              style={[
                styles.hint,
                { color: tokens.smart.colors.textSecondary },
              ]}
            >
              {STRINGS.boards.unassignConfirm
                .replace('{code}', unassigning?.board.code ?? '')
                .replace('{room}', unassigning?.room.name ?? '')}
            </Text>
            {dialogError ? (
              <Text style={[styles.errorText, { color: tokens.danger }]}>
                {dialogError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { borderColor: tokens.smart.colors.cardBorder },
                ]}
                onPress={() => setUnassigning(null)}
                testID="boards-unassign-cancel"
              >
                <Text style={{ color: tokens.smart.colors.textSecondary }}>
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
                disabled={busy}
                onPress={() => {
                  void confirmUnassign();
                }}
                testID="boards-unassign-confirm"
              >
                <Text style={{ color: tokens.onPrimary }}>
                  {STRINGS.settings.confirm}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

function makeStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: 16, paddingBottom: 48 },
    screenTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingRight: 12,
    },
    backText: { fontSize: 14, fontWeight: '500' },
    // One gel card per board (smart card recipe).
    boardCard: {
      borderWidth: 1,
      borderRadius: tokens.smart.radius.card,
      padding: tokens.smart.spacing.cardPadding,
      marginBottom: tokens.smart.spacing.cardGap,
      gap: 6,
      ...tokens.smart.cardShadow,
    },
    boardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    // Header column: the friendly display name over the mono wire code.
    boardTitleColumn: { flexShrink: 1, minWidth: 0 },
    // Mono-ish board code / display name: the wire identity, readable at a
    // glance.
    boardCode: {
      fontSize: tokens.smart.typography.cardTitle,
      fontWeight: '700',
      fontFamily: monoFontFamily,
    },
    // Secondary mono code shown under a descriptor displayName.
    boardCodeSecondary: {
      fontSize: tokens.smart.typography.secondary,
      fontFamily: monoFontFamily,
    },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 12, fontWeight: '600' },
    boardMeta: { fontSize: tokens.smart.typography.secondary },
    boardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    roomLabel: { fontSize: tokens.smart.typography.secondary, flexShrink: 1 },
    boardActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    emptyHint: {
      fontSize: tokens.smart.typography.secondary,
      marginTop: 24,
      textAlign: 'center',
      lineHeight: 20,
    },
    // Centered confirm dialogs (the devices module recipe).
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
      borderRadius: tokens.smart.radius.card,
      padding: 16,
      gap: 8,
    },
    modalTitle: { fontSize: 16, fontWeight: '700' },
    hint: { fontSize: 12, lineHeight: 16 },
    pickerChip: {
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    errorText: { fontSize: 12, marginTop: 4 },
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
