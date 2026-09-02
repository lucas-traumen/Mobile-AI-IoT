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
 * Extension seam (future-proofing): `renderRoomIndicator` lets a future
 * Phase 2 render an optional per-room indicator (status color, label, dot)
 * inside each chip/row WITHOUT another selector redesign. Phase 1 ships no
 * health inference — the callback is optional and unused by default.
 */

import React, { useState } from 'react';
import {
  FlatList,
  Modal,
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

interface RoomSelectorProps {
  /** All rooms (ordered by the devices registry). */
  readonly rooms: readonly Room[];
  /** Id of the currently active room (`null` before a room is chosen). */
  readonly activeRoomId: string | null;
  /** Switch the shared active room (parent owns the side effects). */
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

  // Text-only chip/row content: the room name (plus the optional indicator
  // seam node). No icon — it crowded the chip width on device. `isRow`
  // switches the name to the modal row text styles: rows sit on the sheet
  // background, so the ACTIVE row must NEVER use `onPrimary` (invisible
  // white-on-white on the light sheet) — chips keep white-on-blue.
  const nameStyle = (active: boolean, isRow: boolean): StyleProp<TextStyle> => {
    if (isRow) {
      return active ? styles.rowTextActive : styles.rowText;
    }
    return active ? styles.chipTextActive : styles.chipText;
  };
  const rowContent = (room: Room, active: boolean, isRow: boolean) => (
    <>
      <Text style={nameStyle(active, isRow)}>{room.name}</Text>
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
                {rowContent(room, active, false)}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Modal
        testID="dashboard-room-modal"
        visible={listOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setListOpen(false)}
      >
        <View style={styles.scrim} testID="dashboard-room-modal-scrim">
          <View style={styles.sheet} testID="dashboard-room-modal-sheet">
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {STRINGS.dashboard.roomList}
              </Text>
              <Pressable
                testID="dashboard-room-close"
                accessibilityLabel={STRINGS.dashboard.close}
                onPress={() => setListOpen(false)}
              >
                <Text style={styles.sheetClose}>{STRINGS.dashboard.close}</Text>
              </Pressable>
            </View>
            <FlatList
              data={rooms}
              keyExtractor={room => room.id}
              renderItem={({ item }) => {
                const active = item.id === activeRoomId;
                return (
                  <Pressable
                    testID={`dashboard-room-row-${item.id}`}
                    style={[styles.row, active && styles.rowActive]}
                    accessibilityState={{ selected: active }}
                    onPress={() => select(item.id)}
                  >
                    {rowContent(item, active, true)}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

type Tokens = {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
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
  rowText: StyleProp<TextStyle>;
  rowTextActive: StyleProp<TextStyle>;
  expandButton: StyleProp<ViewStyle>;
  scrim: StyleProp<ViewStyle>;
  sheet: StyleProp<ViewStyle>;
  sheetHeader: StyleProp<ViewStyle>;
  sheetTitle: StyleProp<TextStyle>;
  sheetClose: StyleProp<TextStyle>;
  row: StyleProp<ViewStyle>;
  rowActive: StyleProp<ViewStyle>;
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
      borderRadius: 18,
      borderWidth: 1,
      borderColor: tokens.border,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: tokens.surface,
    },
    chipActive: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    chipText: { fontSize: 13, color: tokens.textPrimary, fontWeight: '500' },
    chipTextActive: { color: tokens.onPrimary, fontWeight: '600' },
    // Modal row text: always readable on the sheet (rowActive paints the
    // elevated surface) — the active row gets the brand color, never
    // `onPrimary`, which is invisible on the light sheet.
    rowText: { fontSize: 13, color: tokens.textPrimary, fontWeight: '500' },
    rowTextActive: { color: tokens.primary, fontWeight: '600' },
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
    // CENTERED dialog: the scrim centers the sheet (with side padding), so
    // no row can slide under the Android navigation bar (bottom-anchoring
    // made the last row look faded/cut).
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    sheet: {
      width: '100%',
      maxHeight: '70%',
      backgroundColor: tokens.background,
      borderRadius: 16,
      paddingBottom: 16,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border,
    },
    sheetTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: tokens.textPrimary,
    },
    sheetClose: { fontSize: 14, fontWeight: '600', color: tokens.primary },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    rowActive: { backgroundColor: tokens.surfaceElevated },
  });
}
