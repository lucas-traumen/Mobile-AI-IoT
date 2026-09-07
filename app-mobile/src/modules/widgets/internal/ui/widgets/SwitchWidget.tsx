/**
 * SwitchWidget — ON/OFF toggle for a `switch` capability with inline error
 * (Smart Home anatomy, dashboard-smart-home-redesign).
 *
 * Card anatomy: ONE row — a line-style glyph inside a soft icon chip, the
 * friendly device title (with the state caption STACKED UNDER the name,
 * scope amendment 3), and the operational RN switch. NO bound device id and
 * NO visible `Đang bật`/`Đang tắt` caption: the state rides the switch
 * semantics (accessibility state `checked` + accessible value text) so
 * accessibility services keep the full state. The GLYPH resolves per device
 * first (scope amendment 2 — optional per-device `icon`), then from the
 * capability definition, then the widget default (`resolveWidgetIcon`),
 * rendered with the glyph's OWN icon family (`WidgetGlyphIcon` — Quạt's
 * `fan` is a MaterialCommunityIcons glyph, amendment 3).
 *
 * State rendering (approved Smart Home states + amendments 2–3):
 * - ON: the TEAL accent (track + icon) — an explicitly defined capability
 *   color keeps its precedence over the accent (same rule as
 *   `resolveCapabilityAccent`),
 * - OFF: neutral gray,
 * - UNKNOWN (no state entry at all, connected): muted neutral icon +
 *   switch at reduced opacity — visually DISTINCT from OFF — with the
 *   VISIBLE caption "Chưa rõ trạng thái" under the name (never plain OFF)
 *   and the accessible value text stating the unknown status.
 * - OFFLINE (MQTT connection not `'connected'`, amendments 2–3): the
 *   switch is DISABLED, the visible caption "Không thể điều khiển" sits
 *   UNDER the device name, and the ICON STAYS VISUALLY CLEAR (amendment 3:
 *   no opacity muting on the glyph — the disabled switch + the caption
 *   carry the offline signal; only the switch wrapper keeps its muted
 *   distinct styling). Offline WINS for the glyph: the offline ∩
 *   unconfirmed intersection keeps the icon clear too — only the
 *   CONNECTED-unknown state mutes the icon. This SUPERSEDES the previous "optimistic even
 *   offline" behavior (disclosed, user-directed): no optimistic flip is
 *   attempted while offline. While CONNECTED the confirmed-state
 *   optimistic toggle + rollback + reconciliation are unchanged (tapping
 *   an unknown switch still flips optimistically and renders the ON
 *   accent).
 *
 * The committed value comes from `getState` (last known `relay:feedback`/
 * `relay:command`). While connected, toggling is OPTIMISTIC: the rendered
 * switch flips immediately via a local `override`, then `sendCommand` is
 * called. When the command fails, the override is rolled back and an
 * inline error shows the failure reason (closes KNOWN ISSUE-001). When the
 * committed feedback catches up with the override, the override is cleared
 * so external state changes stay visible. The live connection state flows
 * in through the widget services seam (`useConnectionState`).
 *
 * NO one-line clamps: the title, the captions and the inline error reflow
 * at font scale (the smart view card grows via its per-type `minHeight`
 * floor) — the error message must stay fully readable, never truncated.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { STRINGS } from '@core/i18n';
import { INTER_SEMIBOLD, useTheme } from '@core/theme';

import type { WidgetConfig } from '../../domain/widgetTypes';
import { resolveWidgetIcon } from '../../domain/widgetIcon';
import { WidgetGlyphIcon } from './WidgetGlyphIcon';
import {
  useWidgetServices,
  useCapabilityState,
  useConnectionState,
} from '../widgetContext';

/** Reduced opacity of the muted UNKNOWN rendering (icon + switch). */
const UNKNOWN_OPACITY = 0.45;

/**
 * Switch widget: icon chip + friendly title + RN switch (one row), the
 * state caption (offline / unknown) and an optional inline error.
 *
 * Title fallback chain (M2 title fix): `config.title ?? bound device name ??
 * capability definition label ?? generic switch label`.
 *
 * @param props.config - widget config (binding must point at a switch cap).
 */
export function SwitchWidget({ config }: { config: WidgetConfig }) {
  const { tokens } = useTheme();
  const services = useWidgetServices();
  const [error, setError] = useState<string | null>(null);
  /**
   * Optimistic toggle override: `null` = show the committed value; `true`/
   * `false` = show this value until the committed feedback matches (then
   * clear) or the command fails (then roll back).
   */
  const [override, setOverride] = useState<boolean | null>(null);

  const deviceId = config.binding?.deviceId ?? '';
  const capability = config.binding?.capability ?? 'switch';
  const enabled = !!config.binding && !!deviceId;

  // CP-R1: reactive subscription via useSyncExternalStore hook.
  const state = useCapabilityState(deviceId, capability, enabled);
  // Amendment-2 offline lock: the LIVE MQTT connection snapshot decides
  // whether the switch is operational at all.
  const connection = useConnectionState();
  const offline = connection.state !== 'connected';
  // UNKNOWN = no committed observation AND no optimistic override (a tap
  // already expresses user intent — the flipped value renders confidently).
  const unknown = state === undefined && override === null;
  const committed =
    state && typeof state.value === 'boolean' ? state.value : false;
  const value = override ?? committed;

  const def = services
    .getCapabilities()
    .find(candidate => candidate.type === capability);

  // Per-device glyph (amendment 2): device icon → capability icon → default.
  const device = services.getDevices().find(item => item.id === deviceId);

  // Smart Home accents: teal for the ACTIVE state, neutral gray for OFF /
  // the muted UNKNOWN base. An explicitly defined capability color keeps
  // its precedence over the teal accent (CP5 per-capability contract).
  const activeColor = def?.color ?? tokens.smart.colors.teal;
  const neutralColor = tokens.smart.colors.neutral;

  // Muted base for the SWITCH wrapper: the UNKNOWN state or the OFFLINE
  // lock (amendment 2) — visually distinct from an operational OFF.
  const muted = unknown || offline;
  // Icon clarity (scope amendment 3, reviewer-6 fix): OFFLINE WINS for the
  // glyph — only the CONNECTED-UNKNOWN state mutes the icon chip. The
  // offline ∩ unconfirmed intersection keeps the icon at FULL clarity: the
  // disabled switch + the "Không thể điều khiển" caption carry the offline
  // signal instead.
  const iconMuted = !offline && unknown;

  // M2 title fix: seeded widgets carry no `title`, so the bound DEVICE name
  // ("Đèn"/"Quạt") must win over the capability label ("Công tắc") — works
  // for existing persisted data without a reset.
  const title =
    config.title ?? device?.name ?? def?.label ?? STRINGS.widgets.switch;

  const handleValueChange = (next: boolean) => {
    // OFFLINE lock (amendment 2): the switch is disabled offline — no
    // optimistic flip is attempted (the RN Switch does not fire while
    // disabled; this guard keeps the contract explicit).
    if (offline) {
      return;
    }
    // Optimistic render FIRST: the switch flips immediately (even before
    // relay feedback arrives) instead of waiting on the store.
    setOverride(next);
    const result = services.sendCommand(deviceId, capability, next);
    if (!result.ok) {
      // Command rejected: roll the optimistic flip back + surface why.
      setOverride(null);
      setError(result.error.message);
    } else {
      setError(null);
    }
  };

  // Committed feedback caught up with the override → the override has done
  // its job; clear it so later external state changes are not masked.
  // (Post-commit state reset — the approved optimistic-toggle pattern.)
  useEffect(() => {
    if (override !== null && committed === override) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- approved post-commit override reset
      setOverride(null);
    }
  }, [committed, override]);

  // Visible state caption (amendment 2): the offline lock explains why the
  // switch is disabled; the connected-unknown state states its status as
  // VISIBLE text — never rendered as plain OFF.
  const caption = offline
    ? STRINGS.widgets.offlineCaption
    : unknown
    ? STRINGS.widgets.unknownCaption
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View
          style={[
            styles.iconChip,
            {
              backgroundColor: tokens.smart.colors.page,
              borderColor: tokens.smart.colors.cardBorder,
              opacity: iconMuted ? UNKNOWN_OPACITY : 1,
            },
          ]}
        >
          <WidgetGlyphIcon
            icon={resolveWidgetIcon(device?.icon, def?.icon, {
              family: 'ionicons',
              name: 'power-outline',
            })}
            size={20}
            // State-aware glyph (approved semantics: teal only for the
            // active state, neutral off / muted unknown otherwise). An
            // explicitly defined capability color is an intentional
            // per-capability contract and wins in every state.
            color={def?.color ?? (value ? activeColor : neutralColor)}
          />
        </View>
        {/* Name column (scope amendment 3): the device name with the state
            caption STACKED UNDER it, aligned with the name column — the
            icon chip stays left, the switch right. */}
        <View style={styles.nameColumn}>
          <Text
            style={[styles.title, { color: tokens.smart.colors.textPrimary }]}
          >
            {title}
          </Text>
          {caption ? (
            <Text
              style={[
                styles.caption,
                { color: tokens.smart.colors.textSecondary },
              ]}
            >
              {caption}
            </Text>
          ) : null}
        </View>
        <View style={muted ? styles.unknownSwitch : undefined}>
          <Switch
            value={value}
            onValueChange={handleValueChange}
            disabled={offline}
            accessibilityLabel={title}
            // The visible on/off caption stays removed; the state remains
            // fully available to accessibility services through the switch
            // semantics (checked) + the accessible value text. The UNKNOWN
            // state and the OFFLINE lock state their own status (never
            // plain OFF).
            accessibilityState={{ checked: value, disabled: offline }}
            accessibilityValue={{
              text: offline
                ? STRINGS.widgets.offlineCaption
                : unknown
                ? STRINGS.widgets.stateUnknown
                : value
                ? STRINGS.widgets.on
                : STRINGS.widgets.off,
            }}
            // Teal is reserved for the ACTIVE state; OFF is neutral.
            trackColor={{ false: neutralColor, true: activeColor }}
            thumbColor={value ? tokens.onPrimary : tokens.surface}
          />
        </View>
      </View>
      {error ? (
        <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  // ONE friendly row: icon chip, name column (title + stacked caption),
  // operational switch.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Soft icon chip (approved anatomy): page-tinted surface + hairline border.
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Name column (scope amendment 3): the title with the state caption
  // stacked UNDER it (aligned with the name column; grows with content).
  nameColumn: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontFamily: INTER_SEMIBOLD },
  // Muted UNKNOWN/OFFLINE switch wrapper: reduced opacity (visually
  // distinct from an operational OFF). The ICON is never muted offline
  // (scope amendment 3 — icon clarity).
  unknownSwitch: { opacity: UNKNOWN_OPACITY },
  // Visible state caption (amendments 2–3): offline lock + connected-
  // unknown, stacked directly under the device name inside the name column.
  caption: { fontSize: 13, marginTop: 2, fontWeight: '500' },
  error: { fontSize: 12, marginTop: 6 },
});
