/**
 * RootTabs — the root bottom-tab navigator (React Navigation), replacing
 * the hand-written shell. EXACTLY three root tabs: Dashboard / Lịch sử /
 * Cài đặt — the Dashboard tab renders the view-only dashboard screen; the
 * Template → Room → Widget management hierarchy lives INSIDE the Settings
 * tab's native stack (Template and Room are never tabs and never screens
 * of the Dashboard tab).
 *
 * Safe-area ownership (single source of truth, same contract as the
 * previous shell): the ROOT content container applies the runtime TOP
 * inset exactly once for every tab screen (children never pad the same
 * inset again; absolute overlays like AddWidgetFlow keep offsetting
 * against this padded container). The BOTTOM inset is owned by the React
 * Navigation tab bar (its built-in safe-area handling) — screens must not
 * pad it a second time.
 *
 * Theme: active/inactive tints and bar surfaces come from the active theme
 * tokens; labels from STRINGS (accessibility preserved).
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from '@react-navigation/bottom-tabs';
import { NavigationAction, StackActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { safeInset } from '@core/safeArea';
import { STRINGS } from '@core/i18n';
import { useTheme } from '@core/theme';

/**
 * The three root tabs (Dashboard hosts the view-only dashboard screen; the
 * Settings tab hosts the management stack).
 */
export type RootTabParams = {
  dashboard: undefined;
  history: undefined;
  settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParams>();

const TAB_ICONS: Record<keyof RootTabParams, keyof typeof Ionicons.glyphMap> = {
  dashboard: 'home',
  history: 'time-outline',
  settings: 'settings-outline',
};

interface RootTabsProps {
  /** The Dashboard tab content (the view-only dashboard screen). */
  readonly renderDashboard: () => React.ReactNode;
  /** The History tab content (unchanged screen). */
  readonly renderHistory: () => React.ReactNode;
  /** The Settings tab content (the typed Settings management stack). */
  readonly renderSettings: () => React.ReactNode;
  /**
   * LEAVING the Settings tab (user decision, supersedes part of the
   * re-press behavior): reset side effects — the composition root
   * discards any open editor draft (cancelEdit; never silently
   * persisted). The STACK reset itself (popToTop) is owned here.
   */
  readonly onSettingsLeave: () => void;
}

/**
 * The root tab navigator.
 *
 * @param props - see {@link RootTabsProps}.
 */
export function RootTabs({
  renderDashboard,
  renderHistory,
  renderSettings,
  onSettingsLeave,
}: RootTabsProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    // Shell-owned background so the inset-filled strips use the theme
    // background instead of the window default (previous shell contract).
    <View style={[styles.flex, { backgroundColor: tokens.background }]}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          lazy: true,
          tabBarActiveTintColor: tokens.primary,
          tabBarInactiveTintColor: tokens.textSecondary,
          tabBarStyle: {
            backgroundColor: tokens.surface,
            borderTopColor: tokens.border,
            borderTopWidth: 1,
            // The React Navigation tab bar owns the bottom inset (single
            // ownership — screens never pad the bottom for the tab bar).
          },
          tabBarLabelStyle: { fontSize: 11 },
          tabBarIcon: ({ color }) => (
            <Ionicons
              name={TAB_ICONS[route.name as keyof RootTabParams]}
              size={20}
              color={color}
            />
          ),
          tabBarButton: (props: BottomTabBarButtonProps) => (
            <TabButtonBridge {...props} testID={`tab-${route.name}`} />
          ),
        })}
      >
        <Tab.Screen
          name="dashboard"
          options={{ tabBarLabel: STRINGS.tabs.dashboard }}
        >
          {({ navigation, route }) => (
            <TabScreenContainer topInset={safeInset(insets.top)}>
              <TabPressPop navigation={navigation} routeKey={route.key}>
                {renderDashboard()}
              </TabPressPop>
            </TabScreenContainer>
          )}
        </Tab.Screen>
        <Tab.Screen
          name="history"
          options={{ tabBarLabel: STRINGS.tabs.history }}
        >
          {({ navigation, route }) => (
            <TabScreenContainer topInset={safeInset(insets.top)}>
              <TabPressPop navigation={navigation} routeKey={route.key}>
                {renderHistory()}
              </TabPressPop>
            </TabScreenContainer>
          )}
        </Tab.Screen>
        <Tab.Screen
          name="settings"
          options={{ tabBarLabel: STRINGS.tabs.settings }}
        >
          {({ navigation, route }) => (
            <TabScreenContainer topInset={safeInset(insets.top)}>
              <TabPressPop navigation={navigation} routeKey={route.key}>
                <TabLeaveReset
                  navigation={navigation}
                  routeKey={route.key}
                  onLeave={onSettingsLeave}
                >
                  {renderSettings()}
                </TabLeaveReset>
              </TabPressPop>
            </TabScreenContainer>
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </View>
  );
}

/**
 * Re-press the ALREADY-FOCUSED tab → that tab's navigator pops to its
 * root screen (the hand-written shell's behavior, restored): deep in the
 * Settings management stack, tapping "Cài đặt" again returns to the
 * settings root. Pressing a DIFFERENT tab keeps the default switch.
 * `popToTop` is a harmless no-op on single-screen tabs (Dashboard /
 * History render one screen each), keeping the behavior uniform.
 */
function TabPressPop({
  navigation,
  routeKey,
  children,
}: {
  /** This tab screen's own navigation object (emits `tabPress`). */
  readonly navigation: TabScreenNavigation;
  /** THIS tab screen's route key (finds its nested navigator state). */
  readonly routeKey: string;
  readonly children: React.ReactNode;
}) {
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', event => {
      // `isFocused()` is evaluated at press time — pressing the focused
      // tab pops its stack to the root; pressing another tab lets the
      // default switch proceed (no preventDefault).
      if (!navigation.isFocused()) {
        return;
      }
      event.preventDefault();
      popTabToRoot(navigation, routeKey);
    });
    return unsubscribe;
  }, [navigation, routeKey]);
  return <>{children}</>;
}

/**
 * LEAVING the Settings tab (user decision, supersedes part of the
 * re-press behavior): on `blur` the tab's stack pops to its root AND
 * `onLeave` runs (the composition root discards any open editor draft —
 * cancelEdit, never silently persisted). Returning to the tab always
 * shows the Settings root.
 *
 * NOTE: `blur` fires AFTER the tab navigator already switched (the newly
 * focused tab owns `routes[index]`), so the reset must locate THIS tab's
 * route by its own `routeKey` — never by the current index.
 */
function TabLeaveReset({
  navigation,
  routeKey,
  onLeave,
  children,
}: {
  readonly navigation: TabScreenNavigation;
  readonly routeKey: string;
  readonly onLeave: () => void;
  readonly children: React.ReactNode;
}) {
  const exitTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      // Discard FIRST (synchronous store write → the editor's
      // useSyncExternalStore re-render clears `dirty` and disables its
      // usePreventRemove guard), THEN pop in a macrotask — the removal
      // event can never hit a stale dirty guard (no discard dialog on
      // tab leave: ONE clear discard path).
      onLeave();
      exitTimer.current = setTimeout(() => {
        exitTimer.current = null;
        popTabToRoot(navigation, routeKey);
      }, 0);
    });
    return () => {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
      }
      unsubscribe();
    };
  }, [navigation, routeKey, onLeave]);
  return <>{children}</>;
}

/** The slice of a bottom-tab screen's navigation object the shell needs. */
interface TabScreenNavigation {
  addListener: (
    type: 'tabPress' | 'blur',
    listener: (event: { preventDefault: () => void }) => void,
  ) => () => void;
  isFocused: () => boolean;
  getState: () => {
    index: number;
    routes: readonly {
      readonly key: string;
      readonly state?: { readonly key: string };
    }[];
  };
  dispatch: (action: NavigationAction) => void;
}

/**
 * POP_TO_TOP targeted at THIS tab screen's nested navigator (found by the
 * screen's own route key — index-based lookup breaks on `blur`, when the
 * tab switch already moved `routes[index]`).
 */
function popTabToRoot(navigation: TabScreenNavigation, routeKey: string): void {
  const state = navigation.getState();
  const myRoute = state.routes.find(route => route.key === routeKey);
  const childKey = myRoute?.state?.key;
  if (childKey) {
    navigation.dispatch({ ...StackActions.popToTop(), target: childKey });
  }
}

/**
 * One top-inset owner: every tab screen starts below the status bar; the
 * inset is applied HERE exactly once (children must not re-apply it).
 */
function TabScreenContainer({
  children,
  topInset,
}: {
  readonly children: React.ReactNode;
  readonly topInset: number;
}) {
  return (
    <View style={[styles.flex, { paddingTop: topInset }]}>{children}</View>
  );
}

/**
 * The default tab button with a stable testID (tests + accessibility).
 * Forwarding the navigator-provided props keeps the press/role/state
 * behavior intact while giving every tab an explicit `tab-<name>` id.
 */
function TabButtonBridge({
  testID,
  children,
  onPress,
  style,
  accessibilityLabel,
  accessibilityState,
  disabled,
}: BottomTabBarButtonProps & { testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={style as never}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      disabled={disabled}
    >
      {children as React.ReactNode}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
