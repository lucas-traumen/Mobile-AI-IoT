/**
 * Settings screen — Vietnamese, theme-token based, summary/navigation root
 * (settings-information-architecture plan).
 *
 * The root is a SUMMARY + NAVIGATION surface, never a configuration form:
 * - Giao diện: exactly two explicit theme choices (`Sáng` / `Tối`) applied
 *   immediately — the removed `Hệ thống` choice cannot appear here.
 * - Quản lý: navigation rows into the nested screens — the Dashboard
 *   & Templates management entry (the Template → Room → Widget hierarchy
 *   lives INSIDE Settings; the Dashboard tab itself stays view-only),
 *   device management, plus the dedicated `Cấu hình nâng cao` screen.
 * - Dữ liệu demo: in-memory toggle (not persisted).
 * - Kết nối: NO permanent status cards and NO combined check button. The
 *   root shows only a concise actionable warning row when a service is in
 *   a CONFIRMED failure state (MQTT `failed`); details and per-service
 *   diagnostics live in the advanced screen.
 *
 * Room/device/capability management is rendered by its owning module under
 * this tab through the app-layer navigator — this screen only navigates to
 * it (module persistence ownership is unchanged).
 *
 * All colors come from {@link useTheme} tokens; all labels from `STRINGS`.
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AppErrorCode } from '@core/errors';
import type { ConnectionState } from '@core/events';
import { errorLabel, STRINGS } from '@core/i18n';
import { useTheme, type ThemeTokens } from '@core/theme';
import type { UiSettings } from '@modules/settings/api';

interface SettingsScreenProps {
  /** Current draft settings (the theme buttons read `ui.theme`). */
  settings: UiSettings;
  /** Field errors keyed by dotted path (unused at the root; reserved). */
  errors?: Record<string, string>;
  /** Update UI preferences (theme mode) — applied immediately. */
  onUpdateUi?: (patch: Partial<UiSettings>) => void;
  /**
   * Open the Template → Room → Widget management hierarchy (the Settings
   * stack's management entry; the Dashboard tab stays view-only).
   */
  onOpenDashboardManager?: () => void;
  /** Open the devices-owned management screen (rooms/devices/catalog). */
  onOpenDeviceManagement?: () => void;
  /** Open the dedicated advanced configuration screen. */
  onOpenAdvanced?: () => void;
  /**
   * Demo history data state (Settings "Dữ liệu demo (lịch sử)" toggle).
   * In-memory only — the composition-root selector resets to OFF on app
   * restart; nothing here is persisted to the settings schema.
   */
  demoHistory?: boolean;
  /** Toggle demo history data (wired to the history source selector). */
  onToggleDemoHistory?: (enabled: boolean) => void;
  /** Live MQTT connection state (failure-only summary row). */
  connectionState?: ConnectionState;
  /** Friendly cause of the last failed MQTT connection (CP5). */
  lastErrorCode?: AppErrorCode | null;
}

/** One management navigation row (icon + title + description + chevron). */
function ManageRow({
  icon,
  title,
  description,
  tokens,
  onPress,
  testID,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  tokens: ThemeTokens;
  onPress: () => void;
  testID?: string;
  tone?: 'danger';
}) {
  const accent = tone === 'danger' ? tokens.danger : tokens.primary;
  return (
    <TouchableOpacity
      style={[
        styles.manageRow,
        {
          backgroundColor: tokens.surface,
          borderColor: tone === 'danger' ? tokens.danger : tokens.border,
        },
      ]}
      testID={testID}
      onPress={onPress}
    >
      <View
        style={[styles.manageIcon, { backgroundColor: tokens.surfaceElevated }]}
      >
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={styles.manageText}>
        <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
          {title}
        </Text>
        <Text style={[styles.rowMeta, { color: tokens.textSecondary }]}>
          {description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.textSecondary} />
    </TouchableOpacity>
  );
}

/**
 * Settings root screen — summary + navigation (CP-R2 sectioned layout).
 */
export function SettingsScreen({
  settings,
  onUpdateUi,
  onOpenDashboardManager,
  onOpenDeviceManagement,
  onOpenAdvanced,
  demoHistory,
  onToggleDemoHistory,
  connectionState,
  lastErrorCode,
}: SettingsScreenProps) {
  const { tokens } = useTheme();

  const themeOptions: readonly {
    value: UiSettings['theme'];
    label: string;
  }[] = [
    { value: 'light', label: STRINGS.settings.light },
    { value: 'dark', label: STRINGS.settings.dark },
  ];

  // Failure-only connection summary: the root never shows permanent status
  // cards and never runs a combined check — a confirmed MQTT failure gets
  // one concise, actionable warning row linking to the advanced screen.
  const mqttFailed = connectionState === 'failed';

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: tokens.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: tokens.textPrimary }]}>
        {STRINGS.settings.title}
      </Text>

      {/* Giao diện (explicit light/dark only — no `system` choice) */}
      <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
        {STRINGS.settings.interface}
      </Text>
      <View style={styles.themeRow}>
        {themeOptions.map(option => {
          const active = settings.theme === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.themeButton,
                { borderColor: tokens.border },
                active && {
                  backgroundColor: tokens.primary,
                  borderColor: tokens.primary,
                },
              ]}
              onPress={() => {
                if (onUpdateUi) {
                  onUpdateUi({ theme: option.value });
                }
              }}
              testID={`settings-theme-${option.value}`}
            >
              <Text
                style={[
                  styles.themeButtonText,
                  { color: active ? tokens.onPrimary : tokens.textSecondary },
                  active && styles.themeButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Quản lý (nested screens owned by their modules; the Template →
          Room → Widget hierarchy is reachable ONLY through the first row) */}
      <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
        {STRINGS.settings.manageSection}
      </Text>
      {onOpenDashboardManager ? (
        <ManageRow
          icon="grid-outline"
          title={STRINGS.settings.manageDashboard}
          description={STRINGS.settings.manageDashboardDesc}
          tokens={tokens}
          onPress={onOpenDashboardManager}
          testID="settings-open-dashboard-manager"
        />
      ) : null}
      {onOpenDeviceManagement ? (
        <ManageRow
          icon="hardware-chip-outline"
          title={STRINGS.settings.manageDevices}
          description={STRINGS.settings.manageDevicesDesc}
          tokens={tokens}
          onPress={onOpenDeviceManagement}
          testID="settings-open-devices"
        />
      ) : null}
      {onOpenAdvanced ? (
        <ManageRow
          icon="settings-outline"
          title={STRINGS.settings.advancedTitle}
          description={STRINGS.settings.advancedDesc}
          tokens={tokens}
          onPress={onOpenAdvanced}
          testID="settings-open-advanced"
        />
      ) : null}

      {/* Demo history data (in-memory toggle, not persisted). */}
      {onToggleDemoHistory ? (
        <View
          style={[
            styles.manageRow,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
          testID="settings-demo-history-row"
        >
          <View
            style={[
              styles.manageIcon,
              { backgroundColor: tokens.surfaceElevated },
            ]}
          >
            <Ionicons
              name="stats-chart-outline"
              size={18}
              color={tokens.primary}
            />
          </View>
          <View style={styles.manageText}>
            <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
              {STRINGS.settings.demoHistory}
            </Text>
            <Text style={[styles.rowMeta, { color: tokens.textSecondary }]}>
              {STRINGS.settings.demoHistoryHint}
            </Text>
          </View>
          <Switch
            testID="settings-demo-history"
            value={demoHistory ?? false}
            onValueChange={onToggleDemoHistory}
            trackColor={{ false: tokens.border, true: tokens.primary }}
          />
        </View>
      ) : null}

      {/* Kết nối: concise failure-only summary (never a status card grid). */}
      {mqttFailed ? (
        <ManageRow
          icon="warning-outline"
          title={STRINGS.settings.mqtt}
          description={
            lastErrorCode
              ? `${STRINGS.dashboard.mqttOffline} — ${errorLabel(
                  lastErrorCode,
                )} · ${STRINGS.settings.connectionWarning}`
              : STRINGS.settings.connectionWarning
          }
          tokens={tokens}
          tone="danger"
          onPress={() => {
            if (onOpenAdvanced) {
              onOpenAdvanced();
            }
          }}
          testID="settings-connection-warning"
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
  },
  themeButtonText: { fontSize: 14 },
  themeButtonTextActive: { fontWeight: '600' },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  manageIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500' },
  rowMeta: { fontSize: 12 },
});
