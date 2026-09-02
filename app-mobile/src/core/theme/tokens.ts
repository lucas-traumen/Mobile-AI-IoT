/**
 * Theme tokens — the only color source for the UI.
 *
 * Screens never hard-code colors; they read the active {@link ThemeTokens}
 * through {@link useTheme} (or the {@link ThemeProvider} context). The token
 * set mirrors the mock: a light theme (light surfaces on off-white) and a
 * dark theme (GitHub-style dark surfaces).
 */

/** Elevation shadow applied to cards (cross-platform shadow recipe). */
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
  /** Elevated surface (modal-ish, raised card, badge). */
  readonly surfaceElevated: string;
  /** Primary text color. */
  readonly textPrimary: string;
  /** Secondary text (labels, hints, captions). */
  readonly textSecondary: string;
  /** Brand / action color (buttons, active chips, accents). */
  readonly primary: string;
  /** Readable text color on top of the primary color (CP6). */
  readonly onPrimary: string;
  /** Success state color (online, OK, positive delta). */
  readonly success: string;
  /** Warning state color (reconnecting, negative delta). */
  readonly warning: string;
  /** Danger state color (offline, errors, destructive actions). */
  readonly danger: string;
  /** Separator / input border color. */
  readonly border: string;
  /** Temperature accent (CP6: big reading digits, sparkline). */
  readonly temperature: string;
  /** Humidity accent (CP6: big reading digits, sparkline). */
  readonly humidity: string;
  /** Card elevation shadow (CP6, applied to every widget card). */
  readonly cardShadow: CardShadow;
  /**
   * Screen background gradient (start → end). Scoped to the gel screens
   * (Dashboard + History tab containers); other tabs keep the plain
   * `background`.
   */
  readonly gradient: readonly [string, string];
  /**
   * Semi-transparent "glass" surface — the neutral card fallback on the
   * gradient (widgets without a dedicated pastel tint).
   */
  readonly surfaceGlass: string;
  /** Pastel card tint — temperature sensor cards. */
  readonly cardTintTemperature: string;
  /** Pastel card tint — humidity sensor cards. */
  readonly cardTintHumidity: string;
  /** Pastel card tint — Đèn (relay-1) switch cards. */
  readonly cardTintSwitchLight: string;
  /** Pastel card tint — Quạt (relay-2) switch cards. */
  readonly cardTintSwitchFan: string;
  /**
   * Gel card inner edge — translucent white hairline drawn just inside the
   * card rim (History gel cards) to separate the card surface from the
   * gradient background (light: 0.4 alpha, dark: 0.12 alpha).
   */
  readonly cardInnerEdge: string;
  /**
   * Gel pill background for the ACTIVE range chip (History 1H/24H/7D row):
   * translucent teal gel tint + bold text instead of solid `primary`.
   */
  readonly chipActiveBg: string;
  /**
   * Translucent "glass edge" hairline drawn on every dashboard card rim
   * (light: 0.4 alpha, dark: 0.14 alpha) so tinted cards read as gel glass
   * on the gradient background.
   */
  readonly cardGlassBorder: string;
  /** Gel section pill background — "Môi trường" (translucent teal). */
  readonly pillEnvironmentBg: string;
  /** Gel section pill border — "Môi trường" (translucent teal). */
  readonly pillEnvironmentBorder: string;
  /** Gel section pill background — "Thiết bị" (translucent peach). */
  readonly pillDevicesBg: string;
  /** Gel section pill border — "Thiết bị" (translucent peach). */
  readonly pillDevicesBorder: string;
}

/** Light theme (default): off-white background, white cards, blue accent. */
export const LIGHT_TOKENS: ThemeTokens = {
  background: '#f7f8fa',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  textPrimary: '#2d2b2a',
  textSecondary: '#6f7782',
  primary: '#0878ff',
  onPrimary: '#ffffff',
  success: '#23a55a',
  warning: '#d29922',
  danger: '#f04438',
  border: '#e5e8ec',
  temperature: '#ff7200',
  humidity: '#08a9ba',
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  gradient: ['#f2d4b0', '#9ecbd5'],
  surfaceGlass: 'rgba(255,255,255,0.7)',
  cardTintTemperature: 'rgba(242,212,176,0.35)',
  cardTintHumidity: 'rgba(155,203,213,0.35)',
  cardTintSwitchLight: 'rgba(255,217,160,0.35)',
  cardTintSwitchFan: 'rgba(184,223,232,0.35)',
  cardInnerEdge: 'rgba(255,255,255,0.4)',
  chipActiveBg: 'rgba(155,203,213,0.35)',
  cardGlassBorder: 'rgba(255,255,255,0.4)',
  pillEnvironmentBg: 'rgba(155,203,213,0.35)',
  pillEnvironmentBorder: 'rgba(155,203,213,0.8)',
  pillDevicesBg: 'rgba(242,212,176,0.35)',
  pillDevicesBorder: 'rgba(242,212,176,0.8)',
};

/** Dark theme: deep blue-black surfaces, brighter accent colors. */
export const DARK_TOKENS: ThemeTokens = {
  background: '#0b0f14',
  surface: '#151a20',
  surfaceElevated: '#1b2128',
  textPrimary: '#f2f5f8',
  textSecondary: '#8f99a6',
  primary: '#1683ff',
  onPrimary: '#ffffff',
  success: '#35c759',
  warning: '#d29922',
  danger: '#ff453a',
  border: '#252c35',
  temperature: '#ff9d00',
  humidity: '#16c5d4',
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 3,
  },
  gradient: ['#10131a', '#1a2333'],
  surfaceGlass: 'rgba(30,40,60,0.6)',
  cardTintTemperature: 'rgba(242,212,176,0.08)',
  cardTintHumidity: 'rgba(155,203,213,0.12)',
  cardTintSwitchLight: 'rgba(255,217,160,0.10)',
  cardTintSwitchFan: 'rgba(184,223,232,0.12)',
  cardInnerEdge: 'rgba(255,255,255,0.12)',
  chipActiveBg: 'rgba(155,203,213,0.12)',
  cardGlassBorder: 'rgba(255,255,255,0.14)',
  pillEnvironmentBg: 'rgba(155,203,213,0.12)',
  pillEnvironmentBorder: 'rgba(155,203,213,0.35)',
  pillDevicesBg: 'rgba(242,212,176,0.10)',
  pillDevicesBorder: 'rgba(242,212,176,0.30)',
};
