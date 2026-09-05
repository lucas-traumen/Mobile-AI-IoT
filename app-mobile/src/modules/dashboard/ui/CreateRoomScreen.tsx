/**
 * CreateRoomScreen — "+ Thêm phòng" for one Template (official hierarchy,
 * one level per screen). Two explicit paths:
 *
 * 1. EXISTING physical room: lists registry rooms NOT yet referenced by this
 *    Template (a Template may reference a physical room at most once) and
 *    adds the reference.
 * 2. NEW physical room: a name form. The room is created through the
 *    devices module (which owns physical rooms — no `templateId` field is
 *    ever added to a physical room) and then referenced by this Template.
 *
 * Cross-store truthfulness (approved compensation contract): creating the
 * physical room and adding the reference span TWO repositories. If the
 * reference add fails after the room was created, the navigator's
 * compensation removes the just-created room when possible and the outcome
 * is reported as a PARTIAL success (`kind: 'partial'`) — never as full
 * success. The screen shows the truthful copy either way.
 */

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { STRINGS } from '@core/i18n';
import { INTER_SEMIBOLD, useTheme } from '@core/theme';

import type { Room } from '@modules/devices/api';
import { type ActionOutcome } from './ConfirmDialog';

/**
 * Outcome of the create-new-room path (app-layer compensation contract).
 * `partial` = the physical room was created but the Template reference add
 * failed (compensation attempted) — the caller must show the truthful
 * partial-success copy instead of navigating.
 */
export type CreateRoomOutcome =
  | (ActionOutcome & { readonly kind: 'added' })
  | (ActionOutcome & { readonly kind: 'partial' })
  | (ActionOutcome & { readonly kind: 'error' });

interface CreateRoomScreenProps {
  /** Physical rooms NOT yet referenced by the Template (derived upstream). */
  readonly availableRooms: readonly Room[];
  /** Add an existing physical room's reference. */
  readonly onAddExisting: (roomId: string) => Promise<ActionOutcome>;
  /** Create a new physical room + add its reference (compensation-aware). */
  readonly onCreateNew: (name: string) => Promise<CreateRoomOutcome>;
  /** Abort + go back. */
  readonly onCancel: () => void;
}

/**
 * The add-room screen.
 *
 * @param props - see {@link CreateRoomScreenProps}.
 */
export function CreateRoomScreen({
  availableRooms,
  onAddExisting,
  onCreateNew,
  onCancel,
}: CreateRoomScreenProps) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitNew = async () => {
    const name = newName.trim();
    if (name.length === 0) {
      setError(STRINGS.devices.requiredField);
      return;
    }
    setBusy(true);
    try {
      const result = await onCreateNew(name);
      if (result.ok && result.kind === 'added') {
        // Success: the navigator returns to the room list.
        setNewName('');
        setError(null);
        return;
      }
      setError(
        result.kind === 'partial'
          ? STRINGS.templates.roomAddPartial
          : result.message || 'Lỗi',
      );
    } finally {
      setBusy(false);
    }
  };

  const addExisting = async (roomId: string) => {
    setBusy(true);
    try {
      const result = await onAddExisting(roomId);
      if (!result.ok) {
        setError(result.message || 'Lỗi');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onCancel} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={tokens.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{STRINGS.templates.createRoomTitle}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>
          {STRINGS.templates.createRoomExisting}
        </Text>
        <Text style={styles.hint}>
          {STRINGS.templates.createRoomExistingHint}
        </Text>
        {availableRooms.length === 0 ? (
          <Text style={styles.emptyHint}>
            {STRINGS.templates.noRoomAvailable}
          </Text>
        ) : (
          availableRooms.map(room => (
            <Pressable
              key={room.id}
              style={[
                styles.roomRow,
                { backgroundColor: tokens.surface, borderColor: tokens.border },
              ]}
              disabled={busy}
              onPress={() => {
                void addExisting(room.id);
              }}
              testID={`create-room-existing-${room.id}`}
              accessibilityRole="button"
            >
              <Ionicons name="bed-outline" size={18} color={tokens.primary} />
              <Text style={styles.roomRowText}>{room.name}</Text>
              <Text style={[styles.roomRowAction, { color: tokens.primary }]}>
                + {STRINGS.templates.add}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>
          {STRINGS.templates.createRoomNew}
        </Text>
        <Text style={styles.hint}>{STRINGS.templates.createRoomNewHint}</Text>
        <TextInput
          style={styles.input}
          value={newName}
          onChangeText={value => {
            setNewName(value);
            setError(null);
          }}
          placeholder={STRINGS.templates.createRoomNewName}
          placeholderTextColor={tokens.textSecondary}
          testID="create-room-new-name"
        />
        {error ? (
          <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text>
        ) : null}
        <Pressable
          style={[styles.createButton, { backgroundColor: tokens.primary }]}
          disabled={busy}
          onPress={() => {
            void submitNew();
          }}
          testID="create-room-new-submit"
          accessibilityRole="button"
        >
          <Text style={[styles.createButtonText, { color: tokens.onPrimary }]}>
            {STRINGS.templates.createRoomNew}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const makeStyles = (tokens: {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  onPrimary: string;
}) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: tokens.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    backButton: { padding: 4 },
    headerText: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 20,
      fontFamily: INTER_SEMIBOLD,
      color: tokens.textPrimary,
    },
    content: { padding: 16, paddingBottom: 40 },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: tokens.textPrimary,
      marginTop: 8,
      marginBottom: 4,
    },
    hint: { fontSize: 12, color: tokens.textSecondary, marginBottom: 10 },
    roomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    roomRowText: {
      flex: 1,
      fontSize: 14,
      color: tokens.textPrimary,
      fontWeight: '500',
    },
    roomRowAction: { fontSize: 13, fontWeight: '700' },
    input: {
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 10,
      backgroundColor: tokens.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: tokens.textPrimary,
    },
    error: { fontSize: 13, marginTop: 8 },
    createButton: {
      borderRadius: 10,
      alignItems: 'center',
      paddingVertical: 11,
      marginTop: 12,
    },
    createButtonText: { fontWeight: '700', fontSize: 14 },
    emptyHint: { fontSize: 13, color: tokens.textSecondary, marginBottom: 8 },
  });
