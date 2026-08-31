/**
 * Tab shell — minimal tab navigation (no navigation library, per plan D7).
 *
 * CP-R2: exactly three tabs — Dashboard / Lịch sử / Cài đặt. Every editing
 * and management workflow lives inside the Settings tab (nested screens).
 * Labels come from STRINGS.tabs, colors from the active theme tokens
 * (active tab primary, inactive textSecondary).
 *
 * Safe-area ownership (single source of truth): the shell consumes the
 * runtime insets from `react-native-safe-area-context` and applies them
 * EXACTLY ONCE —
 * - top: the screen content container pads by the top inset so every tab
 *   screen starts below the status bar (children must not pad again);
 * - bottom: the tab bar pads by the bottom inset so labels/icons stay above
 *   the Android navigation area / iOS home indicator while the tab bar
 *   surface background fills the inset area. With inset 0 the layout is
 *   identical to the pre-safe-area shell.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { safeInset } from '@core/safeArea';
import { useTheme } from '@core/theme';
import { STRINGS } from '@core/i18n';

export type TabKey = 'dashboard' | 'history' | 'settings';

interface TabShellProps {
  /** Renders the screen for the active tab. */
  renderScreen: (tab: TabKey) => React.ReactNode;
}

/** Tab metadata: key, STRINGS label + Ionicons name (size 20). */
export const TABS: readonly {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'dashboard', label: STRINGS.tabs.dashboard, icon: 'home' },
  { key: 'history', label: STRINGS.tabs.history, icon: 'time-outline' },
  { key: 'settings', label: STRINGS.tabs.settings, icon: 'settings-outline' },
];

/**
 * App shell: bottom tab bar switching between the three tabs.
 */
export function TabShell({ renderScreen }: TabShellProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<TabKey>('dashboard');

  return (
    // Shell-owned background so the inset-filled strips (status bar area,
    // tab bar inset) use the theme background instead of the window default.
    <View style={[styles.flex, { backgroundColor: tokens.background }]}>
      <View
        testID="tab-content"
        style={[styles.content, { paddingTop: safeInset(insets.top) }]}
      >
        {renderScreen(active)}
      </View>
      <View
        testID="tab-bar"
        style={[
          styles.tabBar,
          {
            borderTopColor: tokens.border,
            backgroundColor: tokens.surface,
            // The background fills the bottom inset; the per-tab
            // paddingVertical keeps the practical touch target above it.
            paddingBottom: safeInset(insets.bottom),
          },
        ]}
      >
        {TABS.map(tab => {
          const isActive = active === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              testID={`tab-${tab.key}`}
              onPress={() => setActive(tab.key)}
            >
              <Ionicons
                name={tab.icon}
                size={20}
                color={isActive ? tokens.primary : tokens.textSecondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? tokens.primary : tokens.textSecondary,
                  },
                  isActive && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  tabLabel: { fontSize: 11 },
  tabLabelActive: { fontWeight: '600' },
});
