/**
 * Theme tokens — the only color source for the UI.
 *
 * Screens never hard-code colors; they read the active {@link ThemeTokens}
 * through {@link useTheme} (or the {@link ThemeProvider} context). The token
 * set is the approved Light/Dark design system: neutral page/surface layers
 * with semantic accents (blue = primary action, green = online/active,
 * orange = temperature, cyan = humidity).
 *
 * History-specific legacy gel tokens (`gradient`, `surfaceGlass`, the pastel
 * `cardTint*` family, `cardInnerEdge`, `chipActiveBg`, `cardShadow`) are kept
 * for the History screen until its own redesign; the Dashboard no longer
 * consumes any of them.
 */

/** Elevation shadow recipe (cross-platform shadow props). */
export interface CardShadow {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly elevation: number;
}

/** Semantic colors used by every screen/widget. */
export interface ThemeTokens {
  /** App background (page/grid backdrop). */
  readonly background: string;
  /** Card / form surface color. */
  readonly surface: string;
  /** The Dashboard tab's big rounded dashboard surface (prototype `dash`). */
  readonly surfaceDashboard: string;
  /** Elevated surface (modal-ish, raised card, badge, inactive tabs). */
  readonly surfaceElevated: string;
  /** Primary text color. */
  readonly textPrimary: string;
  /** Secondary text (labels, hints, captions). */
  readonly textSecondary: string;
  /** Brand / action color (buttons, active chips, accents). */
  readonly primary: string;
  /** Readable text color on top of the primary color (CP6). */
  readonly onPrimary: string;
  /** Success state color (online, OK, active relay, positive delta). */
  readonly success: string;
  /** Warning state color (reconnecting, negative delta). */
  readonly warning: string;
  /** Danger state color (offline, errors, destructive actions). */
  readonly danger: string;
  /** Neutral OFF state color (inactive switch track, idle controls). */
  readonly off: string;
  /** Separator / input border color. */
  readonly border: string;
  /** Temperature accent (CP6: big reading digits, sparkline). */
  readonly temperature: string;
  /** Humidity accent (CP6: big reading digits, sparkline). */
  readonly humidity: string;
  /**
   * Elevation for the Dashboard's rounded surface: a subtle soft shadow in
   * Light; in Dark elevation comes from the surface layer + border instead.
   */
  readonly dashboardShadow: CardShadow;
  /** Card elevation shadow (legacy — used by the History cards). */
  readonly cardShadow: CardShadow;
  /**
   * Screen background gradient (start → end). History-only legacy token
   * until the History redesign; other tabs keep the plain `background`.
   */
  readonly gradient: readonly [string, string];
  /**
   * Semi-transparent "glass" surface — History-only legacy card fallback.
   */
  readonly surfaceGlass: string;
  /** History-only pastel card tint — temperature cards. */
  readonly cardTintTemperature: string;
  /** History-only pastel card tint — humidity cards. */
  readonly cardTintHumidity: string;
  /** History-only pastel tint — Đèn (relay-1) legacy switch cards. */
  readonly cardTintSwitchLight: string;
  /** History-only pastel tint — Quạt (relay-2) legacy switch cards. */
  readonly cardTintSwitchFan: string;
  /**
   * History-only gel card inner edge — translucent white hairline drawn just
   * inside the History card rim.
   */
  readonly cardInnerEdge: string;
  /**
   * History-only gel pill background for the ACTIVE range chip
   * (History 1H/24H/7D row).
   */
  readonly chipActiveBg: string;
}

/** Light theme (default): soft page, white surfaces, blue accent. */
export const LIGHT_TOKENS: ThemeTokens = {
  background: '#f4f7fb',
  surface: '#ffffff',
  surfaceDashboard: '#ffffff',
  surfaceElevated: '#f8fafc',
  textPrimary: '#1e293b',
  textSecondary: '#64748b',
  primary: '#3b82f6',
  onPrimary: '#ffffff',
  success: '#22c55e',
  warning: '#d29922',
  danger: '#f04438',
  off: '#cbd5e1',
  border: '#e2e8f0',
  temperature: '#f97316',
  humidity: '#06b6d4',
  dashboardShadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 2,
  },
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  // History-only legacy gel tokens (unchanged until the History redesign).
  gradient: ['#f2d4b0', '#9ecbd5'],
  surfaceGlass: 'rgba(255,255,255,0.7)',
  cardTintTemperature: 'rgba(242,212,176,0.35)',
  cardTintHumidity: 'rgba(155,203,213,0.35)',
  cardTintSwitchLight: 'rgba(255,217,160,0.35)',
  cardTintSwitchFan: 'rgba(184,223,232,0.35)',
  cardInnerEdge: 'rgba(255,255,255,0.4)',
  chipActiveBg: 'rgba(155,203,213,0.35)',
};

/** Dark theme: deep blue-black layers, brighter accents, border-borne depth. */
export const DARK_TOKENS: ThemeTokens = {
  background: '#0b1220',
  surface: '#172235',
  surfaceDashboard: '#111827',
  surfaceElevated: '#1e293b',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  primary: '#60a5fa',
  // The dark primary is a bright blue → dark text keeps the contrast (CP6);
  // it matches the page color for a near-inverse treatment on active tabs.
  onPrimary: '#0b1220',
  success: '#22c55e',
  warning: '#d29922',
  danger: '#ff453a',
  off: '#475569',
  border: '#334155',
  temperature: '#fb923c',
  humidity: '#22d3ee',
  // Dark depth comes from the surface layer + border, not a shadow.
  dashboardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 3,
  },
  // History-only legacy gel tokens (unchanged until the History redesign).
  gradient: ['#10131a', '#1a2333'],
  surfaceGlass: 'rgba(30,40,60,0.6)',
  cardTintTemperature: 'rgba(242,212,176,0.08)',
  cardTintHumidity: 'rgba(155,203,213,0.12)',
  cardTintSwitchLight: 'rgba(255,217,160,0.10)',
  cardTintSwitchFan: 'rgba(184,223,232,0.12)',
  cardInnerEdge: 'rgba(255,255,255,0.12)',
  chipActiveBg: 'rgba(155,203,213,0.12)',
};
