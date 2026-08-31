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
}

/** Light theme (default): off-white background, white cards, blue accent. */
export const LIGHT_TOKENS: ThemeTokens = {
  background: '#f7f8fa',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  textPrimary: '#16191d',
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
};
