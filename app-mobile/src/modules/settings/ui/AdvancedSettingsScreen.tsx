/**
 * AdvancedSettingsScreen — the dedicated MQTT/InfluxDB configuration +
 * diagnostics screen (settings-information-architecture plan).
 *
 * Approved truthfulness contract:
 * - MQTT and InfluxDB each get a status dot and their OWN check/retry
 *   action: green = confirmed healthy, red = confirmed failure, amber =
 *   in progress, gray = not configured / not checked / stale after editing.
 * - MQTT status reuses the REAL telemetry connection lifecycle (the shared
 *   client's live state) — this screen never creates a parallel MQTT
 *   client; the retry action goes through the wired composition-root
 *   callback (stop → start of the real service).
 * - InfluxDB status describes the LAST EXPLICIT PROBE (a manual, one-shot
 *   query against the raw history adapter) — it never pretends to be a
 *   persistent connection and never routes through the demo history
 *   source. A probe result is bound to the EXACT persisted configuration
 *   it tested via a typed config fingerprint (fix cycle 2): editing a
 *   service's fields, or saving an edited configuration, makes the prior
 *   result stale/gray until a new explicit probe succeeds for that
 *   configuration. A probe that completes after the config changed can
 *   never validate the new config (its result stays attributed to the
 *   fingerprint captured when the probe started).
 * - Field validation stays inline (store errors below the inputs); save/
 *   check failures keep the forms open; general outcomes show in the
 *   top-center banner. Secrets keep reveal toggles and stay on-device.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
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
import {
  OperationBanner,
  useOperationFeedback,
} from '@core/ui/OperationBanner';
import type { AppSettings } from '@modules/settings/api';
import { influxConfigFingerprint } from '../internal/domain/influxFingerprint';

/** One service status-dot state (approved color semantics). */
export type ServiceDotStatus = 'healthy' | 'failed' | 'progress' | 'gray';

/**
 * How long the amber "in progress" action flag stays lit after a MQTT retry
 * tap (the status dot itself keeps following the LIVE connection state).
 * Exported for timer-lifecycle tests.
 */
export const RETRY_FLAG_RESET_MS = 1500;

interface AdvancedSettingsScreenProps {
  /** Navigate back to the Settings root. */
  readonly onBack: () => void;
  /** Current draft settings (from the store). */
  readonly settings: AppSettings;
  /**
   * The last-PERSISTED InfluxDB configuration — the exact target the raw
   * history adapter (and therefore the explicit probe) queries. Probe
   * results are fingerprinted against this config (fix cycle 2).
   */
  readonly persistedInflux: AppSettings['influx'];
  /** Field errors keyed by dotted path (e.g. `mqtt.host`). */
  readonly errors?: Record<string, string>;
  /** Update MQTT fields in the store (marks the MQTT status stale). */
  readonly onUpdateMqtt?: (patch: Partial<AppSettings['mqtt']>) => void;
  /** Update InfluxDB fields in the store (marks the Influx probe stale). */
  readonly onUpdateInflux?: (patch: Partial<AppSettings['influx']>) => void;
  /** Validate + persist the draft (forms stay open on failure). */
  readonly onSave: (
    settings: AppSettings,
  ) => Promise<{ ok: boolean; message: string }>;
  /** Live MQTT connection state (the real telemetry lifecycle). */
  readonly connectionState?: ConnectionState;
  /** Friendly cause of the last failed MQTT connection. */
  readonly lastErrorCode?: AppErrorCode | null;
  /** True when the MQTT draft differs from the persisted settings. */
  readonly mqttDirty: boolean;
  /** True when the Influx draft differs from the persisted settings. */
  readonly influxDirty: boolean;
  /** Retry the MQTT connection through the real service lifecycle. */
  readonly onMqttRetry?: () => void;
  /** Run the explicit one-shot Influx probe against the raw adapter. */
  readonly onCheckInflux?: () => Promise<'ok' | 'fail'>;
}

/** Dotted-path helper for error lookup. */
function errorFor(
  errors: Record<string, string> | undefined,
  field: string,
): string | undefined {
  return errors ? errors[field] : undefined;
}

/** The status dot (color semantics per the approved contract). */
function StatusDot({
  status,
  tokens,
}: {
  status: ServiceDotStatus;
  tokens: ThemeTokens;
}) {
  const color =
    status === 'healthy'
      ? tokens.success
      : status === 'failed'
      ? tokens.danger
      : status === 'progress'
      ? tokens.temperature
      : tokens.textSecondary;
  return (
    <View
      testID={`status-dot-${status}`}
      style={[styles.dot, { backgroundColor: color }]}
    />
  );
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

function influxConfigured(settings: AppSettings): boolean {
  return (
    settings.influx.url.trim().length > 0 &&
    settings.influx.org.trim().length > 0 &&
    settings.influx.bucket.trim().length > 0 &&
    settings.influx.token.trim().length > 0
  );
}

/**
 * The dedicated advanced configuration screen (MQTT + InfluxDB).
 */
export function AdvancedSettingsScreen({
  onBack,
  settings,
  persistedInflux,
  errors,
  onUpdateMqtt,
  onUpdateInflux,
  onSave,
  connectionState,
  lastErrorCode,
  mqttDirty,
  influxDirty,
  onMqttRetry,
  onCheckInflux,
}: AdvancedSettingsScreenProps) {
  const { tokens } = useTheme();
  const { feedback, exiting, show, clear } = useOperationFeedback();
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [mqttChecking, setMqttChecking] = useState(false);
  /**
   * Last explicit Influx probe, bound to the exact configuration it tested
   * (fix cycle 2): `null` = never probed this session; the fingerprint is
   * captured from the persisted config when the probe STARTS, so a result
   * completing after an edit/save can never validate the new config.
   */
  const [influxProbe, setInfluxProbe] = useState<{
    result: 'ok' | 'fail';
    /** Fingerprint of the persisted Influx config the probe tested. */
    fingerprint: string;
  } | null>(null);
  const [influxChecking, setInfluxChecking] = useState(false);
  // Lifecycle-safe retry flag timer (fix cycle 1): the handle is stored and
  // cleared on retrigger AND on unmount so no state update can ever fire
  // after the screen is gone (no post-teardown React warnings).
  const mqttCheckingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (mqttCheckingTimer.current) {
        clearTimeout(mqttCheckingTimer.current);
        mqttCheckingTimer.current = null;
      }
    };
  }, []);

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
    show({
      severity: result.ok ? 'success' : 'error',
      message: result.message,
    });
  };

  const handleMqttRetry = () => {
    if (!onMqttRetry || mqttChecking) {
      return;
    }
    // Real lifecycle only: the wired callback stops/starts the actual
    // telemetry service (shared client). The status dot follows the live
    // connection state (amber while reconnecting).
    setMqttChecking(true);
    onMqttRetry();
    // The connection state resolves asynchronously; release the amber
    // "in progress" flag after a short action window — the dot keeps
    // following the live state afterwards. The handle is stored (retrigger
    // + unmount clear it) so no setState can ever fire post-teardown.
    if (mqttCheckingTimer.current) {
      clearTimeout(mqttCheckingTimer.current);
    }
    mqttCheckingTimer.current = setTimeout(() => {
      mqttCheckingTimer.current = null;
      setMqttChecking(false);
    }, RETRY_FLAG_RESET_MS);
  };

  const handleInfluxCheck = async () => {
    if (!onCheckInflux || influxChecking) {
      return;
    }
    // Capture the target identity BEFORE the await: the raw adapter queries
    // the persisted config, so this is the exact configuration being
    // tested — an async completion after an edit/save stays attributed to
    // it (and therefore stale for any new config).
    const probedFingerprint = influxConfigFingerprint(persistedInflux);
    setInfluxChecking(true);
    setInfluxProbe(null);
    try {
      const outcome = await onCheckInflux();
      setInfluxProbe({ result: outcome, fingerprint: probedFingerprint });
      show({
        severity: outcome === 'ok' ? 'success' : 'error',
        message:
          outcome === 'ok'
            ? 'InfluxDB: kiểm tra thành công'
            : 'InfluxDB: kiểm tra thất bại',
      });
    } finally {
      setInfluxChecking(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: tokens.surface,
      borderColor: tokens.border,
      color: tokens.textPrimary,
    },
  ];

  // MQTT status: live lifecycle; gray while the draft has unsaved edits
  // (the live state describes the PERSISTED config, not the draft).
  const mqttConfigured = settings.mqtt.host.trim().length > 0;
  const mqttDot: ServiceDotStatus = mqttDirty
    ? 'gray'
    : !mqttConfigured
    ? 'gray'
    : mqttChecking
    ? 'progress'
    : connectionState === 'connected'
    ? 'healthy'
    : connectionState === 'failed'
    ? 'failed'
    : connectionState === 'connecting' || connectionState === 'reconnecting'
    ? 'progress'
    : 'gray';
  const mqttStatusText = mqttDirty
    ? STRINGS.settings.statusStale
    : !mqttConfigured
    ? STRINGS.settings.mqttNotConfigured
    : connectionState
    ? mqttConnectionLabel(connectionState) +
      (connectionState === 'failed' && lastErrorCode
        ? ` — ${errorLabel(lastErrorCode)}`
        : '')
    : STRINGS.settings.statusUnknown;

  // Influx status: last explicit probe only — never a persistent connection.
  // The probe is FRESH only while the persisted config still matches the
  // exact configuration it tested (fingerprint); an edit or a save of an
  // edited config keeps the dot gray until a new probe succeeds.
  const influxConfigured = influxConfiguredFlag(settings);
  const probeFresh =
    influxProbe !== null &&
    influxProbe.fingerprint === influxConfigFingerprint(persistedInflux);
  const influxDot: ServiceDotStatus = influxChecking
    ? 'progress'
    : !influxConfigured
    ? 'gray'
    : influxDirty
    ? 'gray'
    : probeFresh && influxProbe.result === 'ok'
    ? 'healthy'
    : probeFresh && influxProbe.result === 'fail'
    ? 'failed'
    : 'gray';
  const influxStatusText = influxChecking
    ? STRINGS.settings.checking
    : !influxConfigured
    ? STRINGS.settings.influxNotConfigured
    : influxDirty
    ? STRINGS.settings.statusStale
    : probeFresh && influxProbe.result === 'ok'
    ? STRINGS.settings.success
    : probeFresh && influxProbe.result === 'fail'
    ? STRINGS.settings.failed
    : STRINGS.settings.statusUnknown;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: tokens.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.backRow}
          accessibilityLabel={STRINGS.settings.back}
          testID="advanced-settings-back"
          onPress={onBack}
        >
          <Ionicons name="arrow-back" size={18} color={tokens.primary} />
          <Text style={[styles.backText, { color: tokens.primary }]}>
            {STRINGS.settings.back}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: tokens.textPrimary }]}>
          {STRINGS.settings.advancedTitle}
        </Text>

        {/* MQTT section: live status + own retry action + form */}
        <View
          style={[
            styles.statusCard,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
          testID="advanced-mqtt-status"
        >
          <StatusDot status={mqttDot} tokens={tokens} />
          <View style={styles.statusTextWrap}>
            <Text style={[styles.statusTitle, { color: tokens.textPrimary }]}>
              {STRINGS.settings.mqttSection}
            </Text>
            <Text style={[styles.statusMeta, { color: tokens.textSecondary }]}>
              {mqttStatusText}
            </Text>
            <Text style={[styles.statusHint, { color: tokens.textSecondary }]}>
              {STRINGS.settings.mqttStatusHint}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.statusAction, { borderColor: tokens.primary }]}
            onPress={handleMqttRetry}
            disabled={!onMqttRetry || !mqttConfigured}
            accessibilityRole="button"
            accessibilityLabel={STRINGS.settings.retry}
            testID="advanced-mqtt-retry"
          >
            <Text style={[styles.statusActionText, { color: tokens.primary }]}>
              {STRINGS.settings.retry}
            </Text>
          </TouchableOpacity>
        </View>

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
                {showPassword ? STRINGS.settings.hide : STRINGS.settings.show}
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

        {/* InfluxDB section: explicit probe status + own check action */}
        <View
          style={[
            styles.statusCard,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
          testID="advanced-influx-status"
        >
          <StatusDot status={influxDot} tokens={tokens} />
          <View style={styles.statusTextWrap}>
            <Text style={[styles.statusTitle, { color: tokens.textPrimary }]}>
              {STRINGS.settings.influxDb}
            </Text>
            <Text style={[styles.statusMeta, { color: tokens.textSecondary }]}>
              {influxStatusText}
            </Text>
            <Text style={[styles.statusHint, { color: tokens.textSecondary }]}>
              {STRINGS.settings.influxStatusHint}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.statusAction, { borderColor: tokens.primary }]}
            onPress={() => {
              void handleInfluxCheck();
            }}
            disabled={!onCheckInflux || influxChecking || !influxConfigured}
            accessibilityRole="button"
            accessibilityLabel={STRINGS.settings.checkNow}
            testID="advanced-influx-check"
          >
            <Text style={[styles.statusActionText, { color: tokens.primary }]}>
              {STRINGS.settings.checkNow}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: tokens.textSecondary }]}>
          {STRINGS.settings.influxProbeHint}
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
                {showToken ? STRINGS.settings.hide : STRINGS.settings.show}
              </Text>
            </TouchableOpacity>
          </View>
        </FieldRow>

        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: tokens.primary },
            saving && styles.buttonDisabled,
          ]}
          onPress={() => {
            void handleSave();
          }}
          disabled={saving}
          testID="advanced-save"
        >
          <Text style={[styles.saveButtonText, { color: tokens.onPrimary }]}>
            {saving ? STRINGS.settings.saving : STRINGS.settings.save}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Top-center operation feedback (field errors stay inline). */}
      <OperationBanner
        feedback={feedback}
        exiting={exiting}
        onDismiss={clear}
      />
    </KeyboardAvoidingView>
  );
}

/** Alias kept for the influx status helper naming clarity. */
function influxConfiguredFlag(settings: AppSettings): boolean {
  return influxConfigured(settings);
}

const styles = StyleSheet.create({
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
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  statusTextWrap: { flex: 1 },
  statusTitle: { fontSize: 15, fontWeight: '600' },
  statusMeta: { fontSize: 12, marginTop: 2 },
  statusHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  statusAction: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusActionText: { fontSize: 13, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
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
  hint: { fontSize: 12, marginTop: 8, lineHeight: 18 },
  saveButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  saveButtonText: { fontSize: 15, fontWeight: '600' },
});
