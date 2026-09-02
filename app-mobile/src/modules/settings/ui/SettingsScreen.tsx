/**
 * Settings screen — Vietnamese, theme-token based, sectioned (CP-R2).
 *
 * Settings is the single editing/configuration hub, but it owns only the
 * module-owned settings domain. Section order: title → Giao diện (theme
 * segmented control) → Quản lý (navigation rows into the nested device
 * management + dashboard editor screens) → Kết nối (MQTT status with a
 * friendly error label, InfluxDB status, check button, cloud hint) →
 * Nâng cao (collapsed: the MQTT + InfluxDB forms + Lưu cài đặt).
 *
 * Room/device/capability management and dashboard editing are rendered by
 * their owning modules under this tab through the app-layer coordinator —
 * this screen only navigates to them (module persistence ownership is
 * unchanged).
 *
 * All colors come from {@link useTheme} tokens; all labels from `STRINGS`.
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AppErrorCode } from '@core/errors';
import type { ConnectionState } from '@core/events';
import { errorLabel, mqttConnectionLabel, STRINGS } from '@core/i18n';
import { useTheme, type ThemeTokens } from '@core/theme';
import type { AppSettings, UiSettings } from '@modules/settings/api';

interface SettingsScreenProps {
  /** Current draft settings (from the store). */
  settings: AppSettings;
  /** Called with the edited settings when the user taps Save. */
  onSave: (settings: AppSettings) => Promise<{ ok: boolean; message: string }>;
  /** Field errors keyed by dotted path (e.g. `mqtt.host`). */
  errors?: Record<string, string>;
  /** Update MQTT fields in the store (so errors recompute live). */
  onUpdateMqtt?: (patch: Partial<AppSettings['mqtt']>) => void;
  /** Update InfluxDB fields in the store (so errors recompute live). */
  onUpdateInflux?: (patch: Partial<AppSettings['influx']>) => void;
  /** Update UI preferences (theme mode) in the draft. */
  onUpdateUi?: (patch: Partial<UiSettings>) => void;
  /**
   * Connection check action wired by the composition root: runs the InfluxDB
   * probe and reads the MQTT state separately.
   */
  onCheckConnection?: () => Promise<{
    mqtt: 'ok' | 'fail';
    influx: 'ok' | 'fail';
  }>;
  /** Open the devices-owned management screen (rooms/devices/catalog). */
  onOpenDeviceManagement?: () => void;
  /** Open the dashboard-owned layout editor. */
  onOpenDashboardEditor?: () => void;
  /**
   * Demo history data state (Settings "Dữ liệu demo (lịch sử)" toggle).
   * In-memory only — the composition-root selector resets to OFF on app
   * restart; nothing here is persisted to the settings schema.
   */
  demoHistory?: boolean;
  /** Toggle demo history data (wired to the history source selector). */
  onToggleDemoHistory?: (enabled: boolean) => void;
  /** Live MQTT connection state (Kết nối section). */
  connectionState?: ConnectionState;
  /** Friendly cause of the last failed MQTT connection (CP5). */
  lastErrorCode?: AppErrorCode | null;
}

/** Dotted-path helper for error lookup. */
function errorFor(
  errors: Record<string, string> | undefined,
  field: string,
): string | undefined {
  return errors ? errors[field] : undefined;
}

/** One labelled input row (label + themed input + optional field error). */
function FieldRow({
  label,
  tokens,
  error,
  children,
}: {
  label: string;
  tokens: ThemeTokens;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text style={[styles.label, { color: tokens.textSecondary }]}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

/** One management navigation row (icon + title + description + chevron). */
function ManageRow({
  icon,
  title,
  description,
  tokens,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  tokens: ThemeTokens;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.manageRow,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
      testID={testID}
      onPress={onPress}
    >
      <View
        style={[styles.manageIcon, { backgroundColor: tokens.surfaceElevated }]}
      >
        <Ionicons name={icon} size={18} color={tokens.primary} />
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
 * Settings form screen (CP-R2 sectioned layout).
 */
export function SettingsScreen({
  settings,
  onSave,
  errors,
  onUpdateMqtt,
  onUpdateInflux,
  onUpdateUi,
  onCheckConnection,
  onOpenDeviceManagement,
  onOpenDashboardEditor,
  demoHistory,
  onToggleDemoHistory,
  connectionState,
  lastErrorCode,
}: SettingsScreenProps) {
  const { tokens } = useTheme();
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showToken, setShowToken] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [influxStatus, setInfluxStatus] = React.useState<'ok' | 'fail' | null>(
    null,
  );
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const setMqtt = (patch: Partial<AppSettings['mqtt']>) => {
    if (onUpdateMqtt) {
      onUpdateMqtt(patch);
    }
  };
  const setInflux = (patch: Partial<AppSettings['influx']>) => {
    if (onUpdateInflux) {
      onUpdateInflux(patch);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await onSave(settings);
    setSaving(false);
    setMessage(result.message);
  };

  const handleCheck = async () => {
    if (!onCheckConnection) {
      return;
    }
    setChecking(true);
    const outcome = await onCheckConnection();
    setChecking(false);
    setInfluxStatus(outcome.influx);
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: tokens.surface,
      borderColor: tokens.border,
      color: tokens.textPrimary,
    },
  ];

  const themeOptions: readonly {
    value: UiSettings['theme'];
    label: string;
  }[] = [
    { value: 'system', label: STRINGS.settings.system },
    { value: 'dark', label: STRINGS.settings.dark },
    { value: 'light', label: STRINGS.settings.light },
  ];

  const mqttFailed = connectionState === 'failed';

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: tokens.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: tokens.textPrimary }]}>
          {STRINGS.settings.title}
        </Text>

        {/* Giao diện (theme mode) */}
        <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
          {STRINGS.settings.interface}
        </Text>
        <View style={styles.themeRow}>
          {themeOptions.map(option => {
            const active = settings.ui.theme === option.value;
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

        {/* Quản lý (nested screens owned by their modules) */}
        <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
          {STRINGS.settings.manageSection}
        </Text>
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
        {onOpenDashboardEditor ? (
          <ManageRow
            icon="grid-outline"
            title={STRINGS.settings.editDashboard}
            description={STRINGS.settings.editDashboardDesc}
            tokens={tokens}
            onPress={onOpenDashboardEditor}
            testID="settings-open-editor"
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

        {/* Kết nối */}
        <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
          {STRINGS.settings.connectionSection}
        </Text>
        <View
          style={[
            styles.row,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
        >
          <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
            {STRINGS.settings.mqtt}
          </Text>
          <Text
            style={[
              styles.rowMeta,
              { color: mqttFailed ? tokens.danger : tokens.textSecondary },
            ]}
          >
            {connectionState
              ? mqttConnectionLabel(connectionState) +
                (mqttFailed && lastErrorCode
                  ? ` — ${errorLabel(lastErrorCode)}`
                  : '')
              : STRINGS.settings.statusUnknown}
          </Text>
        </View>
        <View
          style={[
            styles.row,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
        >
          <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
            {STRINGS.settings.influx}
          </Text>
          <Text
            style={[
              styles.rowMeta,
              {
                color:
                  influxStatus === 'ok'
                    ? tokens.success
                    : influxStatus === 'fail'
                    ? tokens.danger
                    : tokens.textSecondary,
              },
            ]}
          >
            {checking
              ? STRINGS.settings.checking
              : influxStatus === 'ok'
              ? STRINGS.settings.success
              : influxStatus === 'fail'
              ? STRINGS.settings.failed
              : STRINGS.settings.statusUnknown}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.addRow,
            { borderColor: tokens.border },
            (!onCheckConnection || checking) && styles.buttonDisabled,
          ]}
          onPress={() => {
            void handleCheck();
          }}
          disabled={!onCheckConnection || checking}
          accessibilityRole="button"
          accessibilityLabel={STRINGS.settings.checkConnection}
        >
          <Text style={[styles.addRowText, { color: tokens.primary }]}>
            {STRINGS.settings.checkConnection}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.hint, { color: tokens.textSecondary }]}>
          {STRINGS.settings.cloudHint}
        </Text>

        {/* Nâng cao (collapsed) */}
        <TouchableOpacity
          style={[
            styles.advancedToggle,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
          onPress={() => setShowAdvanced(value => !value)}
        >
          <Text style={[styles.rowTitle, { color: tokens.textPrimary }]}>
            {STRINGS.settings.advancedSection}
          </Text>
          <Text style={[styles.chevron, { color: tokens.textSecondary }]}>
            {showAdvanced ? '▾' : '▸'}
          </Text>
        </TouchableOpacity>

        {showAdvanced ? (
          <View>
            <Text style={[styles.hint, { color: tokens.textSecondary }]}>
              {STRINGS.settings.advancedHint}
            </Text>

            {/* MQTT Broker */}
            <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
              {STRINGS.settings.mqttBroker}
            </Text>

            <FieldRow
              label={STRINGS.settings.host}
              tokens={tokens}
              error={errorFor(errors, 'mqtt.host')}
            >
              <TextInput
                style={inputStyle}
                value={settings.mqtt.host}
                onChangeText={value => setMqtt({ host: value })}
                placeholder="192.168.1.10"
                placeholderTextColor={tokens.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </FieldRow>

            <FieldRow
              label={STRINGS.settings.port}
              tokens={tokens}
              error={errorFor(errors, 'mqtt.port')}
            >
              <TextInput
                style={inputStyle}
                value={String(settings.mqtt.port)}
                onChangeText={value => setMqtt({ port: Number(value) || 0 })}
                placeholder="9001"
                placeholderTextColor={tokens.textSecondary}
                keyboardType="number-pad"
              />
            </FieldRow>

            <FieldRow label={STRINGS.settings.username} tokens={tokens}>
              <TextInput
                style={inputStyle}
                value={settings.mqtt.username ?? ''}
                onChangeText={value => setMqtt({ username: value })}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </FieldRow>

            <FieldRow label={STRINGS.settings.password} tokens={tokens}>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[inputStyle, styles.passwordInput]}
                  value={settings.mqtt.password ?? ''}
                  onChangeText={value => setMqtt({ password: value })}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(v => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? STRINGS.settings.hide : STRINGS.settings.show
                  }
                >
                  <Text style={[styles.eyeText, { color: tokens.primary }]}>
                    {showPassword
                      ? STRINGS.settings.hide
                      : STRINGS.settings.show}
                  </Text>
                </TouchableOpacity>
              </View>
            </FieldRow>

            <FieldRow
              label={STRINGS.settings.prefix}
              tokens={tokens}
              error={errorFor(errors, 'mqtt.prefix')}
            >
              <TextInput
                style={inputStyle}
                value={settings.mqtt.prefix}
                onChangeText={value => setMqtt({ prefix: value })}
                placeholder="home"
                placeholderTextColor={tokens.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </FieldRow>

            {/* InfluxDB */}
            <Text style={[styles.sectionTitle, { color: tokens.textPrimary }]}>
              {STRINGS.settings.influxDb}
            </Text>

            <FieldRow
              label={STRINGS.settings.url}
              tokens={tokens}
              error={errorFor(errors, 'influx.url')}
            >
              <TextInput
                style={inputStyle}
                value={settings.influx.url}
                onChangeText={value => setInflux({ url: value })}
                placeholder="http://192.168.1.10:8086"
                placeholderTextColor={tokens.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </FieldRow>

            <FieldRow
              label={STRINGS.settings.org}
              tokens={tokens}
              error={errorFor(errors, 'influx.org')}
            >
              <TextInput
                style={inputStyle}
                value={settings.influx.org}
                onChangeText={value => setInflux({ org: value })}
                placeholder="iot"
                placeholderTextColor={tokens.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </FieldRow>

            <FieldRow
              label={STRINGS.settings.bucket}
              tokens={tokens}
              error={errorFor(errors, 'influx.bucket')}
            >
              <TextInput
                style={inputStyle}
                value={settings.influx.bucket}
                onChangeText={value => setInflux({ bucket: value })}
                placeholder="sensors"
                placeholderTextColor={tokens.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </FieldRow>

            <FieldRow
              label={STRINGS.settings.token}
              tokens={tokens}
              error={errorFor(errors, 'influx.token')}
            >
              <View style={styles.passwordRow}>
                <TextInput
                  style={[inputStyle, styles.passwordInput]}
                  value={settings.influx.token}
                  onChangeText={value => setInflux({ token: value })}
                  secureTextEntry={!showToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowToken(v => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showToken ? STRINGS.settings.hide : STRINGS.settings.show
                  }
                >
                  <Text style={[styles.eyeText, { color: tokens.primary }]}>
                    {showPassword
                      ? STRINGS.settings.hide
                      : STRINGS.settings.show}
                  </Text>
                </TouchableOpacity>
              </View>
            </FieldRow>

            {message ? (
              <Text style={[styles.message, { color: tokens.primary }]}>
                {message}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: tokens.primary },
                saving && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text
                style={[styles.saveButtonText, { color: tokens.onPrimary }]}
              >
                {saving ? STRINGS.settings.saving : STRINGS.settings.save}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
  label: { fontSize: 13, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1 },
  eyeButton: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  eyeText: { fontSize: 13, fontWeight: '600' },
  error: { fontSize: 12, marginTop: 4 },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowTitle: { fontSize: 15, fontWeight: '500' },
  rowMeta: { fontSize: 12 },
  addRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  addRowText: { fontSize: 14, fontWeight: '600' },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 20,
    marginBottom: 8,
  },
  chevron: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 8, lineHeight: 18 },
  message: { fontSize: 13, marginTop: 12 },
  saveButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  saveButtonText: { fontSize: 15, fontWeight: '600' },
});
