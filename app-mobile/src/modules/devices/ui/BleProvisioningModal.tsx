/**
 * BleProvisioningModal — the BLE WiFi provisioning surface
 * (boards-ble-wifi-provisioning, AD-6): a display shell + form. ALL BLE
 * logic lives in `bleWifiProvisioningService.ts` — the modal consumes the
 * {@link BleWifiProvisioningServiceLike} seam (type-only import of the
 * service module, erased at runtime) and NEVER imports
 * react-native-ble-plx (BoardsScannerModal's thin-shell pattern, AD-5).
 * Web gating happens in BoardsScreen (`Platform.OS !== 'web'`) — this
 * modal is mounted on native only.
 *
 * Two phases:
 * - scanning (Phase A): the live list of advertising boards
 *   (`IoTBoard-{boardId}` from the service's service-UUID-filtered scan,
 *   one row per device — deduped by deviceId, RSSI shown), the R4 honest
 *   hint ("cắm điện lại board — board chỉ phát Bluetooth khi chưa có
 *   WiFi") and the scan-problem hint (BT off / permission / unavailable).
 *   When a scanned board's boardId matches `initialBoardId` (the QR
 *   label's id) it is auto-selected ONCE — the scan stops and Phase B
 *   opens for that board; the user can still tap "Đổi board" and pick
 *   another (the one-shot guard prevents an auto-select trap on the
 *   restarted scan).
 * - configuring (Phase B): the SSID field (prefilled from the service's
 *   remembered last SSID), the password field (secure text with a
 *   show/hide toggle), the byte-accurate validation gate
 *   (`validateWifiCredentials` — Send disabled while invalid), and the
 *   provision run: Send → service.provision with onStatus progress
 *   (IDLE/CONNECTING lines) → CONNECTED = success state + Đóng;
 *   FAILED:* / transport failure = typed reason mapped to an honest
 *   message with the form left editable for an immediate retry (AD: the
 *   chars stay writable after a firmware failure).
 *
 * testIDs: `boards-ble-modal` (root), `boards-ble-close`,
 * `boards-ble-scan-problem`, `boards-ble-scan-hint` (R4 hint),
 * `boards-ble-board-{boardId}` (list row),
 * `boards-ble-selected-board` (selected-board line),
 * `boards-ble-ssid-input`, `boards-ble-password-input`,
 * `boards-ble-toggle-password`, `boards-ble-validation`,
 * `boards-ble-send`, `boards-ble-change-board`, `boards-ble-status`,
 * `boards-ble-error`, `boards-ble-success`.
 *
 * Visual language: the shared Smart Home wash + `tokens.smart` — the
 * centered-dialog recipe of the devices module. All labels come from
 * `STRINGS.boards.ble`.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { STRINGS } from '@core/i18n';
import { useTheme, type ThemeTokens } from '@core/theme';

import {
  validateWifiCredentials,
  toBleProvisionErrorReason,
  type BleProvisionErrorReason,
  type BleProvisionStatus,
} from '../internal/domain/bleProvisioningContract';
import type {
  BleScanProblem,
  BleScannedBoard,
  BleScanSession,
  BleWifiProvisioningServiceLike,
} from '../internal/services/bleWifiProvisioningService';

interface BleProvisioningModalProps {
  /** Open state (BoardsScreen owns the lifecycle). */
  readonly visible: boolean;
  /** Close request (back button + the Đóng buttons). */
  readonly onClose: () => void;
  /**
   * The boardId parsed from the QR label (the not-found sheet's handoff):
   * the first scanned board matching it is auto-selected. `null` = plain
   * scan, no auto-select.
   */
  readonly initialBoardId: string | null;
  /**
   * The provisioning service seam (DI): BoardsScreen passes the real
   * service; tests inject fakes. The modal never constructs BLE objects.
   */
  readonly service: BleWifiProvisioningServiceLike;
}

/** The modal's phase. */
type BleModalPhase = 'scanning' | 'configuring';

/** The provision run state (idle → provisioning → success | failed). */
type ProvisionState = 'idle' | 'provisioning' | 'success' | 'failed';

/** Map a typed provision failure to its honest message. */
function failureText(reason: BleProvisionErrorReason): string {
  switch (reason) {
    case 'BAD_AUTH':
      return STRINGS.boards.ble.failedBadAuth;
    case 'NO_SSID':
      return STRINGS.boards.ble.failedNoSsid;
    case 'TIMEOUT':
      return STRINGS.boards.ble.failedTimeout;
    case 'ERROR':
      return STRINGS.boards.ble.failedError;
    case 'TRANSPORT':
      return STRINGS.boards.ble.errorTransport;
  }
}

/** Map a scan problem to its honest hint. */
function problemText(problem: BleScanProblem): string {
  switch (problem) {
    case 'bluetoothOff':
      return STRINGS.boards.ble.errorBluetoothOff;
    case 'permissionDenied':
      return STRINGS.boards.ble.errorPermission;
    case 'unavailable':
      return STRINGS.boards.ble.errorUnavailable;
  }
}

/** The live Status notification → the progress line (or null to hide). */
function progressText(status: BleProvisionStatus | null): string | null {
  if (status === null || status.kind === 'failed') {
    return null;
  }
  return status.kind === 'connecting'
    ? STRINGS.boards.ble.statusConnecting
    : STRINGS.boards.ble.statusIdle;
}

/**
 * The BLE provisioning modal: scan list → credentials form → provision.
 */
export function BleProvisioningModal({
  visible,
  onClose,
  initialBoardId,
  service,
}: BleProvisioningModalProps) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  const [phase, setPhase] = useState<BleModalPhase>('scanning');
  const [boards, setBoards] = useState<readonly BleScannedBoard[]>([]);
  const [problem, setProblem] = useState<BleScanProblem | null>(null);
  const [selected, setSelected] = useState<BleScannedBoard | null>(null);

  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [provisionState, setProvisionState] = useState<ProvisionState>('idle');
  const [progress, setProgress] = useState<BleProvisionStatus | null>(null);
  const [failureReason, setFailureReason] =
    useState<BleProvisionErrorReason | null>(null);

  // Scan lifecycle: the session lives in a ref (tap handlers stop it
  // without a re-render); `scanEpoch` restarts the scan for "Đổi board".
  const sessionRef = useRef<BleScanSession | null>(null);
  const [scanEpoch, setScanEpoch] = useState(0);
  // One-shot auto-select (AD: the QR boardId selects the first matching
  // advertisement once — a "Đổi board" must not re-trap the user). The
  // guard resets only on a FRESH OPEN (visible false → true), never on a
  // scan restart.
  const autoSelectDoneRef = useRef(false);
  const wasVisibleRef = useRef(false);

  const stopScan = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      return undefined;
    }
    let cancelled = false;
    if (!wasVisibleRef.current) {
      // Fresh open: one-shot auto-select re-armed.
      autoSelectDoneRef.current = false;
      wasVisibleRef.current = true;
    }
    // Fresh open: empty state + remembered SSID (never the password —
    // the service has no API for one) + a live scan.
    void service.loadLastSsid().then(lastSsid => {
      if (!cancelled && lastSsid !== null) {
        setSsid(lastSsid);
      }
    });
    sessionRef.current = service.startScan(
      board => {
        if (cancelled) {
          return;
        }
        setBoards(previous =>
          previous.some(item => item.deviceId === board.deviceId)
            ? previous
            : [...previous, board],
        );
        if (
          !autoSelectDoneRef.current &&
          initialBoardId !== null &&
          board.boardId === initialBoardId
        ) {
          // The QR board is advertising: select it and open the form.
          autoSelectDoneRef.current = true;
          stopScan();
          setSelected(board);
          setPhase('configuring');
        }
      },
      scanProblem => {
        if (!cancelled) {
          setProblem(scanProblem);
        }
      },
    );
    return () => {
      cancelled = true;
      stopScan();
    };
  }, [visible, service, initialBoardId, scanEpoch, stopScan]);

  const pickBoard = (board: BleScannedBoard) => {
    stopScan();
    setSelected(board);
    setPhase('configuring');
  };

  const changeBoard = () => {
    // Back to Phase A: a fresh scan (the one-shot auto-select stays
    // consumed so the QR board cannot re-trap the user).
    setSelected(null);
    setProvisionState('idle');
    setProgress(null);
    setFailureReason(null);
    setProblem(null);
    setBoards([]);
    setPhase('scanning');
    setScanEpoch(epoch => epoch + 1);
  };

  const validation = validateWifiCredentials(ssid, password);
  const sendDisabled =
    selected === null || provisionState === 'provisioning' || !validation.ok;

  const sendProvision = async () => {
    if (
      selected === null ||
      !validation.ok ||
      provisionState === 'provisioning'
    ) {
      return;
    }
    setProvisionState('provisioning');
    setProgress(null);
    setFailureReason(null);
    try {
      await service.provision({
        deviceId: selected.deviceId,
        ssid,
        password,
        onStatus: setProgress,
      });
      setProvisionState('success');
      // AD-4: remember the SSID of a SUCCESSFUL send only — never the
      // password (the service has no API that would accept one).
      await service.saveLastSsid(ssid);
    } catch (error: unknown) {
      setFailureReason(toBleProvisionErrorReason(error));
      setProvisionState('failed');
    }
  };

  const validationText = ((): string | null => {
    if (validation.ok) {
      return null;
    }
    if (ssid.length === 0 && password.length === 0) {
      return null; // pristine form — the disabled button says enough
    }
    switch (validation.error) {
      case 'ssidRequired':
        return STRINGS.boards.ble.ssidRequired;
      case 'ssidTooLong':
        return STRINGS.boards.ble.ssidTooLong;
      case 'passwordTooLong':
        return STRINGS.boards.ble.passwordTooLong;
    }
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="boards-ble-modal"
    >
      <View style={styles.modalBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={STRINGS.boards.ble.close}
          testID="boards-ble-scrim"
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
            {STRINGS.boards.ble.title}
          </Text>

          {phase === 'scanning' ? (
            <>
              <Text
                style={[
                  styles.hint,
                  { color: tokens.smart.colors.textSecondary },
                ]}
              >
                {STRINGS.boards.ble.scanHint}
              </Text>
              {problem !== null ? (
                <Text
                  style={[styles.errorText, { color: tokens.danger }]}
                  testID="boards-ble-scan-problem"
                >
                  {problemText(problem)}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.listLabel,
                  { color: tokens.smart.colors.textPrimary },
                ]}
              >
                {STRINGS.boards.ble.listLabel}
              </Text>
              {boards.map(board => (
                <TouchableOpacity
                  key={board.deviceId}
                  style={[
                    styles.boardRow,
                    { borderColor: tokens.smart.colors.cardBorder },
                  ]}
                  onPress={() => pickBoard(board)}
                  testID={`boards-ble-board-${board.boardId}`}
                >
                  <Text
                    style={[
                      styles.boardIdText,
                      { color: tokens.smart.colors.textPrimary },
                    ]}
                  >
                    {board.boardId}
                  </Text>
                  <Text
                    style={[
                      styles.rssiText,
                      { color: tokens.smart.colors.textSecondary },
                    ]}
                  >
                    {board.rssi === null ? '' : `${board.rssi} dBm`}
                  </Text>
                </TouchableOpacity>
              ))}
              <Text
                style={[
                  styles.hint,
                  { color: tokens.smart.colors.textSecondary },
                ]}
                testID="boards-ble-scan-hint"
              >
                {STRINGS.boards.ble.scanEmptyHint}
              </Text>
            </>
          ) : (
            <>
              {selected !== null ? (
                <Text
                  style={[
                    styles.selectedBoard,
                    { color: tokens.smart.colors.textSecondary },
                  ]}
                  testID="boards-ble-selected-board"
                >
                  {selected.boardId}
                </Text>
              ) : null}
              <Text
                style={[
                  styles.fieldLabel,
                  { color: tokens.smart.colors.textPrimary },
                ]}
              >
                {STRINGS.boards.ble.ssidLabel}
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    borderColor: tokens.smart.colors.cardBorder,
                    color: tokens.smart.colors.textPrimary,
                  },
                ]}
                value={ssid}
                onChangeText={setSsid}
                autoCapitalize="none"
                autoCorrect={false}
                editable={provisionState !== 'provisioning'}
                testID="boards-ble-ssid-input"
              />
              <Text
                style={[
                  styles.fieldLabel,
                  { color: tokens.smart.colors.textPrimary },
                ]}
              >
                {STRINGS.boards.ble.passwordLabel}
              </Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.passwordInput,
                    {
                      borderColor: tokens.smart.colors.cardBorder,
                      color: tokens.smart.colors.textPrimary,
                    },
                  ]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={provisionState !== 'provisioning'}
                  testID="boards-ble-password-input"
                />
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    { borderColor: tokens.smart.colors.cardBorder },
                  ]}
                  onPress={() => setShowPassword(shows => !shows)}
                  accessibilityLabel={
                    showPassword
                      ? STRINGS.boards.ble.hide
                      : STRINGS.boards.ble.show
                  }
                  testID="boards-ble-toggle-password"
                >
                  <Text style={{ color: tokens.smart.colors.textSecondary }}>
                    {showPassword
                      ? STRINGS.boards.ble.hide
                      : STRINGS.boards.ble.show}
                  </Text>
                </TouchableOpacity>
              </View>
              {validationText !== null ? (
                <Text
                  style={[styles.errorText, { color: tokens.danger }]}
                  testID="boards-ble-validation"
                >
                  {validationText}
                </Text>
              ) : null}

              {provisionState === 'success' ? (
                <Text
                  style={[
                    styles.successText,
                    { color: tokens.smart.colors.teal },
                  ]}
                  testID="boards-ble-success"
                >
                  {STRINGS.boards.ble.success}
                </Text>
              ) : null}
              {provisionState === 'failed' && failureReason !== null ? (
                <Text
                  style={[styles.errorText, { color: tokens.danger }]}
                  testID="boards-ble-error"
                >
                  {failureText(failureReason)}
                </Text>
              ) : null}
              {provisionState !== 'success' && provisionState !== 'failed' ? (
                <Text
                  style={[
                    styles.hint,
                    { color: tokens.smart.colors.textSecondary },
                  ]}
                  testID="boards-ble-status"
                >
                  {progressText(progress) ?? STRINGS.boards.ble.statusIdle}
                </Text>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    { borderColor: tokens.smart.colors.cardBorder },
                  ]}
                  onPress={changeBoard}
                  disabled={provisionState === 'provisioning'}
                  testID="boards-ble-change-board"
                >
                  <Text style={{ color: tokens.smart.colors.textSecondary }}>
                    {STRINGS.boards.ble.changeBoard}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    {
                      backgroundColor: tokens.primary,
                      borderColor: tokens.primary,
                    },
                    sendDisabled && { opacity: 0.5 },
                  ]}
                  disabled={sendDisabled}
                  onPress={() => {
                    void sendProvision();
                  }}
                  testID="boards-ble-send"
                >
                  <Text style={{ color: tokens.onPrimary }}>
                    {STRINGS.boards.ble.send}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity
            style={[
              styles.modalButton,
              styles.closeButton,
              { borderColor: tokens.smart.colors.cardBorder },
            ]}
            onPress={onClose}
            testID="boards-ble-close"
          >
            <Text style={{ color: tokens.smart.colors.textSecondary }}>
              {STRINGS.boards.ble.close}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    // Centered-dialog recipe (the devices module standard).
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
    listLabel: { fontSize: 13, fontWeight: '600' },
    boardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    boardIdText: { fontSize: 14, fontWeight: '600' },
    rssiText: { fontSize: 12 },
    selectedBoard: { fontSize: 12 },
    fieldLabel: { fontSize: 13, fontWeight: '600' },
    textInput: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
    },
    passwordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    passwordInput: { flex: 1 },
    toggleButton: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    successText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
    errorText: { fontSize: 12, lineHeight: 16, marginTop: 4 },
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
    closeButton: { alignSelf: 'flex-end', marginTop: 4 },
  });
}
