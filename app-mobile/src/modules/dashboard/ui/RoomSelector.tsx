/**
 * RoomSelector — the Dashboard's controlled room navigation (Phase 1).
 *
 * Structure (approved mẫu A): a single row with the expand (☰) action at the
 * FAR LEFT followed by a non-wrapping horizontal quick strip (one text-only
 * chip per room, horizontally scrollable when they overflow) — so any room
 * count (zero → nothing, one → single chip, many → scroll + list) stays on
 * one row. Chips and full-list rows are text-only (room name, no icon):
 * icons crowded the chip width and pushed labels out on device. There is
 * deliberately NO `Tất cả` option: exactly one concrete room is active at a
 * time (CP-R3), and the no-room state is owned by the screen.
 *
 * Strictly controlled/presentational: the parent owns the selected id and
 * every side effect; this component only emits `onSelectRoom(id)` and never
 * touches stores or services. Safe-area stays owned by the tab shell.
 *
 * The full-list dialog itself lives in the shared {@link RoomListModal}
 * (D3 extraction, dashboard-smart-home-redesign) — the History screen's
 * ☰ expand opens the SAME dialog the Dashboard tab's Smart Home header
 * menu opens. The external contract of this component (props, strip
 * behavior, `@modules/dashboard/api` export) is unchanged.
 *
 * Extension seam (future-proofing): `renderRoomIndicator` lets a future
 * Phase 2 render an optional per-room indicator (status color, label, dot)
 * inside each chip/row WITHOUT another selector redesign. Phase 1 ships no
 * health inference — the callback is optional and unused by default.
 */

import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { STRINGS } from '@core/i18n';
import { useTheme } from '@core/theme';

import type { Room } from '@modules/devices/api';

import { RoomListModal } from './RoomListModal';

interface RoomSelectorProps {
  /**
   * The rooms to offer, in the PARENT's chosen order — the selector never
   * re-sorts (History passes the devices registry order; the Dashboard
   * view passes the ACTIVE Template's ordered room references resolved to
   * physical rooms).
   */
  readonly rooms: readonly Room[];
  /** Id of the currently active room (`null` before a room is chosen). */
  readonly activeRoomId: string | null;
  /**
   * Switch the active room — the parent owns the selection and every side
   * effect (History's shared persisted seam; the Dashboard view's local
   * presentation-only selection).
   */
  readonly onSelectRoom: (id: string) => void;
  /**
   * Optional per-room indicator seam (Phase 2): render a custom node inside
   * each chip/row. Receives the room and whether it is active. When omitted
   * (Phase 1 default) only the room name is rendered.
   */
  readonly renderRoomIndicator?: (
    room: Room,
    active: boolean,
  ) => React.ReactNode;
}

/**
 * The room quick strip + expandable full list.
 *
 * @param props - see {@link RoomSelectorProps}.
 */
export function RoomSelector({
  rooms,
  activeRoomId,
  onSelectRoom,
  renderRoomIndicator,
}: RoomSelectorProps) {
  const { tokens } = useTheme();
  const [listOpen, setListOpen] = useState(false);
  const styles = makeStyles(tokens);

  if (rooms.length === 0) {
    return null;
  }

  const select = (id: string) => {
    onSelectRoom(id);
    setListOpen(false);
  };

  // Text-only chip content: the room name (plus the optional indicator
  // seam node). No icon — it crowded the chip width on device. The modal
  // row styling lives in {@link RoomListModal}.
  const chipContent = (room: Room, active: boolean) => (
    <>
      <Text style={active ? styles.chipTextActive : styles.chipText}>
        {room.name}
      </Text>
      {renderRoomIndicator?.(room, active)}
    </>
  );

  return (
    <View style={styles.selector}>
      <View style={styles.stripRow}>
        <Pressable
          testID="dashboard-room-expand"
          style={styles.expandButton}
          accessibilityLabel={STRINGS.dashboard.roomList}
          onPress={() => setListOpen(true)}
        >
          <Ionicons name="list" size={18} color={tokens.textSecondary} />
        </Pressable>
        <ScrollView
          testID="dashboard-room-strip"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripContent}
        >
          {rooms.map(room => {
            const active = room.id === activeRoomId;
            return (
              <Pressable
                key={room.id}
                testID={`dashboard-room-chip-${room.id}`}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityState={{ selected: active }}
                onPress={() => select(room.id)}
              >
                {chipContent(room, active)}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <RoomListModal
        visible={listOpen}
        rooms={rooms}
        activeRoomId={activeRoomId}
        onSelectRoom={select}
        onClose={() => setListOpen(false)}
        renderRoomIndicator={renderRoomIndicator}
      />
    </View>
  );
}

type Tokens = {
  surface: string;
  surfaceElevated: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  border: string;
};

function makeStyles(tokens: Tokens): {
  selector: StyleProp<ViewStyle>;
  stripRow: StyleProp<ViewStyle>;
  stripContent: StyleProp<ViewStyle>;
  chip: StyleProp<ViewStyle>;
  chipActive: StyleProp<ViewStyle>;
  chipText: StyleProp<TextStyle>;
  chipTextActive: StyleProp<TextStyle>;
  expandButton: StyleProp<ViewStyle>;
} {
  return StyleSheet.create({
    selector: { paddingHorizontal: 16, paddingBottom: 8 },
    stripRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // The quick strip is one row that never wraps: horizontal ScrollView +
    // row content container without flexWrap (overflow scrolls instead).
    stripContent: { flexDirection: 'row', gap: 8, flexGrow: 1 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      // Approved quick-tab shape: rectangular 8–10px corners (9), neutral
      // elevated surface + border for inactive rooms.
      borderRadius: 9,
      borderWidth: 1,
      borderColor: tokens.border,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: tokens.surfaceElevated,
    },
    chipActive: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    chipText: {
      fontSize: 13,
      color: tokens.textSecondary,
      fontWeight: '600',
    },
    // The active chip keeps white-on-primary (the modal rows must NOT —
    // see RoomListModal).
    chipTextActive: { color: tokens.onPrimary, fontWeight: '600' },
    expandButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
