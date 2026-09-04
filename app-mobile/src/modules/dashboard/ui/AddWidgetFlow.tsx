/**
 * AddWidgetFlow — full-screen modal for adding a widget (approved
 * room-sensor rework): ONE TAP on an available, not-yet-displayed choice.
 *
 * The EDITOR ROOM IS AUTHORITATIVE: the flow receives the room currently
 * being edited and never asks for it again — every assembled input carries
 * `roomId = editorRoomId`.
 *
 * The choice list is derived from the room's projected sensors (one row per
 * registration), the room's relays (one row per relay) and the room overview
 * (one row). The flow receives the current widget list (draft while a draft
 * is open, persisted otherwise) and hides every ALREADY-DISPLAYED choice —
 * duplicate prevention at the UI seam (the dashboard service remains the
 * authoritative guard).
 *
 * Selecting a row sends a complete default-size `AddWidgetInput` in one tap
 * (resize stays an editor action). There are NO category, device,
 * capability or size steps and NO history option (History is a derived tab,
 * never a widget).
 *
 * Footer/header: Hủy aborts. The flow is purely presentational: it calls
 * `onAdd` and the parent closes it. The overlay keeps its safe-area
 * ownership (top offset + footer bottom padding) exactly as before.
 */

import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { overlayFooterBottomPadding, safeInset } from '@core/safeArea';
import { STRINGS } from '@core/i18n';
import { useTheme } from '@core/theme';

import type { CapabilityDef, Device } from '@modules/devices/api';
import { projectSensorRegistrations } from '@modules/devices/api';
import type { AddWidgetInput } from '@modules/dashboard/api';
import { widgetUniquenessKey } from '@modules/widgets/api';
import type { WidgetConfig } from '@modules/widgets/api';

/** One tappable add choice (a complete widget input + display copy). */
export interface WidgetAddChoice {
  /** Stable row key (also the testID suffix). */
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  /** Ionicons glyph name. */
  readonly icon: string;
  /** The complete, default-size input sent on tap. */
  readonly input: AddWidgetInput;
}

interface AddWidgetFlowProps {
  /** The room being edited — AUTHORITATIVE for the new widget. */
  readonly editorRoomId: string;
  /** Human-readable editor room name (shown for confirmation). */
  readonly editorRoomName: string;
  /** All devices (room-scoped candidates are derived inside). */
  readonly devices: readonly Device[];
  /** Capability catalog (labels/icons for sensor rows). */
  readonly capabilities?: readonly CapabilityDef[];
  /**
   * The current widget list (draft while a draft is open, persisted
   * otherwise) — already-displayed choices are hidden immediately.
   */
  readonly widgets: readonly WidgetConfig[];
  /** Add the widget (parent owns the service call + close). */
  readonly onAdd: (input: AddWidgetInput) => void;
  /** Abort + close the flow. */
  readonly onCancel: () => void;
}

/**
 * The one-tap add-widget flow (editor-room authoritative).
 *
 * @param props - see {@link AddWidgetFlowProps}.
 */
export function AddWidgetFlow({
  editorRoomId,
  editorRoomName,
  devices,
  capabilities = [],
  widgets,
  onAdd,
  onCancel,
}: AddWidgetFlowProps) {
  const { tokens } = useTheme();
  // Safe-area seam: the overlay is absolutely positioned inside the shell's
  // content container (which is already padded by the runtime TOP inset), so
  // the flow offsets itself up by that inset to cover the status-bar strip
  // and pads its own header. The footer keeps the cancel tappable above the
  // bottom system area (the shell's tab bar reserves the BOTTOM inset below
  // the overlay).
  const insets = useSafeAreaInsets();
  const topInset = safeInset(insets.top);

  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  // Room-scoped candidates: projected sensor registrations (one row per
  // metric — legacy multi-capability boards contribute one row EACH),
  // relay devices (one row per relay) and the room overview.
  const choices = useMemo<WidgetAddChoice[]>(() => {
    const roomSensors = projectSensorRegistrations(
      devices,
      capabilities,
    ).filter(registration => registration.roomId === editorRoomId);
    const roomRelays = devices.filter(
      device =>
        device.roomId === editorRoomId && device.binding.kind === 'relay',
    );
    const rows: WidgetAddChoice[] = roomSensors.map(registration => {
      const def = capabilities.find(
        candidate => candidate.type === registration.field,
      );
      return {
        key: `sensor:${registration.deviceId}:${registration.field}`,
        label: def?.label ?? registration.field,
        description: registration.deviceName,
        icon: def?.icon ?? 'pulse-outline',
        input: {
          type: 'sensor-value',
          binding: {
            deviceId: registration.deviceId,
            capability: registration.field,
          },
          roomId: editorRoomId,
        },
      };
    });
    for (const relay of roomRelays) {
      rows.push({
        key: `relay:${relay.id}`,
        label: relay.name,
        description: STRINGS.widgets.switchDesc,
        icon: 'toggle-outline',
        input: {
          type: 'switch',
          binding: { deviceId: relay.id, capability: 'switch' },
          roomId: editorRoomId,
        },
      });
    }
    rows.push({
      key: 'room-overview',
      label: STRINGS.widgets.roomDeviceList,
      description: STRINGS.widgets.roomDeviceListDesc,
      icon: 'list-outline',
      input: { type: 'room-device-list', roomId: editorRoomId },
    });
    return rows;
  }, [devices, capabilities, editorRoomId]);

  // Duplicate prevention at the UI seam: a choice whose uniqueness key is
  // already displayed disappears immediately (the dashboard service remains
  // the authoritative guard if the UI ever fails).
  const displayedKeys = useMemo(
    () => new Set(widgets.map(widget => widgetUniquenessKey(widget))),
    [widgets],
  );
  const available = choices.filter(
    choice =>
      !displayedKeys.has(
        widgetUniquenessKey({
          type: choice.input.type,
          roomId: choice.input.roomId,
          binding: choice.input.binding,
        }),
      ),
  );

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
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>{STRINGS.dashboard.addWidget}</Text>
          <Text style={styles.headerRoom} numberOfLines={1}>
            {STRINGS.dashboard.editorRoom}: {editorRoomName}
          </Text>
        </View>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={styles.cancelHeader}>{STRINGS.widgets.cancel}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {available.length === 0 ? (
          <Text style={styles.hint}>{STRINGS.widgets.disabled}</Text>
        ) : (
          available.map(choice => (
            <Pressable
              key={choice.key}
              style={[
                styles.choiceRow,
                { backgroundColor: tokens.surface, borderColor: tokens.border },
              ]}
              onPress={() => onAdd(choice.input)}
              testID={`add-widget-choice-${choice.key}`}
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.choiceIcon,
                  { backgroundColor: tokens.surfaceElevated },
                ]}
              >
                <Ionicons
                  name={choice.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color={tokens.primary}
                />
              </View>
              <View style={styles.choiceText}>
                <Text style={styles.choiceLabel}>{choice.label}</Text>
                {choice.description ? (
                  <Text style={styles.choiceDesc}>{choice.description}</Text>
                ) : null}
              </View>
              <Text style={[styles.choiceAdd, { color: tokens.primary }]}>
                + {STRINGS.widgets.add}
              </Text>
            </Pressable>
          ))
        )}
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
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    headerTextWrap: { flex: 1, minWidth: 0 },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: tokens.textPrimary,
    },
    headerRoom: {
      fontSize: 12,
      color: tokens.textSecondary,
      marginTop: 2,
    },
    cancelHeader: { fontSize: 14, color: tokens.danger, fontWeight: '600' },
    content: { padding: 16 },
    choiceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    choiceIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    choiceText: { flex: 1 },
    choiceLabel: { fontSize: 15, fontWeight: '600', color: tokens.textPrimary },
    choiceDesc: { fontSize: 12, color: tokens.textSecondary, marginTop: 2 },
    choiceAdd: { fontWeight: '700', fontSize: 13 },
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
  });
}
