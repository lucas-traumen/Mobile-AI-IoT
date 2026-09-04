/**
 * OperationBanner — the ONE presentation seam for general nested-screen
 * operation feedback (approved settings-information-architecture plan).
 *
 * A compact top-center banner below the safe-area/header that receives a
 * typed severity + message + visibility. Field-level validation stays
 * inline in the forms and destructive actions keep their confirmation
 * dialogs — this module is only for whole-operation outcomes (saved, add
 * failed, quota exceeded, …).
 *
 * `useOperationFeedback` is the tiny state owner screens reuse so each
 * nested screen gets the same auto-timeout behavior without duplicating
 * logic. The component itself is pure: no timers, no navigation knowledge.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, type ThemeTokens } from '@core/theme';

/** Severity of an operation outcome. */
export type OperationSeverity = 'success' | 'error' | 'info';

/** One operation outcome shown by the banner. */
export interface OperationFeedback {
  readonly severity: OperationSeverity;
  readonly message: string;
}

/**
 * How long one outcome stays visible before auto-hiding. Exported for
 * timer-lifecycle tests.
 */
export const AUTO_HIDE_MS = 4000;

/**
 * State helper for screens showing operation feedback: `show` replaces the
 * current outcome and restarts the auto-hide timer; `clear` hides it now.
 */
export function useOperationFeedback(): {
  feedback: OperationFeedback | null;
  show: (feedback: OperationFeedback) => void;
  clear: () => void;
} {
  const [feedback, setFeedback] = useState<OperationFeedback | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setFeedback(null);
  };

  const show = (next: OperationFeedback) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    setFeedback(next);
    timer.current = setTimeout(() => {
      setFeedback(null);
      timer.current = null;
    }, AUTO_HIDE_MS);
  };

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return { feedback, show, clear };
}

/** Accent + icon per severity (theme-token driven). */
function severityStyle(
  severity: OperationSeverity,
  tokens: ThemeTokens,
): { color: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (severity) {
    case 'success':
      return { color: tokens.success, icon: 'checkmark-circle-outline' };
    case 'error':
      return { color: tokens.danger, icon: 'alert-circle-outline' };
    default:
      return { color: tokens.primary, icon: 'information-circle-outline' };
  }
}

interface OperationBannerProps {
  /** The current outcome, or `null` when nothing should show. */
  readonly feedback: OperationFeedback | null;
  /** Dismiss the banner immediately (optional). */
  readonly onDismiss?: () => void;
  /** Test hook. */
  readonly testID?: string;
}

/**
 * The top-center operation banner. Renders `null` without feedback so
 * screens can mount it unconditionally at the top of their container.
 */
export function OperationBanner({
  feedback,
  onDismiss,
  testID = 'operation-banner',
}: OperationBannerProps) {
  const { tokens } = useTheme();
  if (!feedback || !feedback.message) {
    return null;
  }
  const { color, icon } = severityStyle(feedback.severity, tokens);
  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      style={[
        styles.banner,
        { backgroundColor: tokens.surface, borderColor: color },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={styles.row}>
        <Ionicons name={icon} size={16} color={color} />
        <Text
          style={[styles.message, { color: tokens.textPrimary }]}
          numberOfLines={3}
        >
          {feedback.message}
        </Text>
        {onDismiss ? (
          <TouchableOpacity
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Đóng thông báo"
            hitSlop={8}
          >
            <Ionicons
              name="close-outline"
              size={16}
              color={tokens.textSecondary}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    alignSelf: 'center',
    maxWidth: 560,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  message: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
});
