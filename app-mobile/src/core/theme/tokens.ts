/**
 * Theme tokens — the only color source for the UI.
 *
 * Screens never hard-code colors; they read the active {@link ThemeTokens}
 * through {@link useTheme} (or the {@link ThemeProvider} context). The token
 * set is the approved Light/Dark design system: neutral page/surface layers
 * with semantic accents (blue = primary action, green = online/active,
 * teal = temperature, blue = humidity; amber stays reserved for the
 * warning/offline semantics — connection chip).
 *
 * The nested {@link SmartTokens} block (`smart`) is the "Smart Home"
 * design-language foundation (dashboard-smart-home-redesign +
 * history-smart-home-redesign): the Dashboard tab, RootTabs, the widget
 * components and the History tab consume it; Settings migrates in its own
 * redesign.
 *
 * Legacy gel tokens (`gradient`, `surfaceGlass`, the pastel `cardTint*`
 * family, `cardInnerEdge`, `chipActiveBg`, `cardShadow`) are kept for the
 * Settings management surfaces (TemplateListScreen) until their own
 * redesign — the Dashboard and History tabs no longer consume them.
 */

/** Elevation shadow recipe (cross-platform shadow props). */
export interface CardShadow {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly elevation: number;
}

/**
 * "Smart Home" design-language block (D1, dashboard-smart-home-redesign):
 * the shared foundation for the Dashboard tab, RootTabs and the widget
 * components — one nested block per theme on the SAME
 * {@link ThemeTokens}/{@link useTheme} seam (no parallel provider).
 */
export interface SmartTokens {
  /** Smart palette colors (page/card/text layers + teal/amber accents). */
  readonly colors: {
    /** Page background (the ambient gradient's base stop). */
    readonly page: string;
    /** Card surface. */
    readonly card: string;
    /** Primary text. */
    readonly textPrimary: string;
    /** Secondary text (labels, hints, captions, inactive tabs). */
    readonly textSecondary: string;
    /** Teal accent (active tab, ON switch, temperature accent). */
    readonly teal: string;
    /**
     * Amber accent — reserved for warning/offline semantics (the Dashboard
     * connection chip) and the ambient wash endpoint; NOT a data accent
     * (scope amendment 2 moved humidity to the blue `humidity` token).
     */
    readonly amber: string;
    /** Hairline card border. */
    readonly cardBorder: string;
    /** Ambient wash endpoint — teal tint at 3–5% alpha (top-left). */
    readonly tealTint: string;
    /** Ambient wash endpoint — amber tint at 3–5% alpha (bottom-right). */
    readonly amberTint: string;
    /** Neutral gray (OFF switch track/icon; muted unknown base). */
    readonly neutral: string;
  };
  /** Smart spacing scale (points). */
  readonly spacing: {
    /** Horizontal screen padding — narrow canvas. */
    readonly screenH: number;
    /** Horizontal screen padding — wide canvas (>= stacked breakpoint). */
    readonly screenHWide: number;
    /** Card inner padding. */
    readonly cardPadding: number;
    /** Gap between cards. */
    readonly cardGap: number;
  };
  /** Smart typography scale (font sizes in points). */
  readonly typography: {
    /** Header room name (may wrap to two lines). */
    readonly screenTitle: number;
    /** Card/widget title. */
    readonly cardTitle: number;
    /** Secondary captions (status lines, section labels). */
    readonly secondary: number;
    /** Big sensor reading. */
    readonly sensorValue: number;
    /**
     * Sensor no-data dash line (scope amendment 3): the muted `—` renders
     * at 28–32 (secondary color) with the smaller baseline-aligned unit —
     * big enough to read as the value slot, never the 40–44 accent size
     * (real readings keep {@link sensorValue}).
     */
    readonly sensorNoDataValue: number;
    /**
     * History chart-card statistic value (history-smart-home-redesign):
     * the Thấp nhất / Cao nhất / Trung bình numbers under a chart — bigger
     * than body text, smaller than the live sensor reading.
     */
    readonly statsValue: number;
    /** Sensor unit beside the reading. */
    readonly unit: number;
  };
  /** Smart corner radii. */
  readonly radius: {
    /** Card corner radius. */
    readonly card: number;
  };
  /**
   * Card elevation shadow: a subtle soft shadow in Light; Dark depth is
   * border-borne (zeroed recipe — the hairline `cardBorder` carries it).
   */
  readonly cardShadow: CardShadow;
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
  /**
   * Temperature accent (big reading digits + value/unit accent). VALUE
   * changed to the Smart Home teal (D2, approved): every consumer (History
   * charts, management previews, widgets) stays consistent through the
   * shared resolver.
   */
  readonly temperature: string;
  /**
   * Humidity accent (big reading digits + value/unit accent). VALUE
   * changed to the Smart Home blue (scope amendment 2: humidity accent
   * reads blue; amber stays reserved for warning/offline semantics).
   */
  readonly humidity: string;
  /**
   * The "Smart Home" design-language block (D1) — consumed first by the
   * Dashboard tab, RootTabs and the widget components; History/Settings
   * migrate in their own redesigns.
   */
  readonly smart: SmartTokens;
  /**
   * Elevation for the Dashboard's rounded surface: a subtle soft shadow in
   * Light; in Dark elevation comes from the surface layer + border instead.
   */
  readonly dashboardShadow: CardShadow;
  /** Card elevation shadow (legacy — used by the Settings surfaces). */
  readonly cardShadow: CardShadow;
  /**
   * Screen background gradient (start → end). Legacy gel token used by the
   * Settings management surfaces until their own redesign; the Dashboard
   * and History tabs use the smart ambient wash (`smart.colors.*Tint` +
   * `page`) instead, other tabs keep the plain `background`.
   */
  readonly gradient: readonly [string, string];
  /**
   * Semi-transparent "glass" surface — legacy gel card fallback (the
   * Settings management surfaces).
   */
  readonly surfaceGlass: string;
  /** Legacy gel pastel card tint — temperature cards. */
  readonly cardTintTemperature: string;
  /** Legacy gel pastel card tint — humidity cards. */
  readonly cardTintHumidity: string;
  /** Legacy gel pastel tint — Đèn (relay-1) legacy switch cards. */
  readonly cardTintSwitchLight: string;
  /** Legacy gel pastel tint — Quạt (relay-2) legacy switch cards. */
  readonly cardTintSwitchFan: string;
  /**
   * Legacy gel card inner edge — translucent white hairline drawn just
   * inside the gel card rim (the Settings room preview).
   */
  readonly cardInnerEdge: string;
  /**
   * Legacy gel pill background for the ACTIVE chip state (the Settings
   * room preview/editor headers).
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
  // D2 (approved): temperature → Smart teal; amendment 2: humidity →
  // Smart blue (amber stays reserved for warning/offline semantics).
  temperature: '#168C88',
  humidity: '#3B7FC4',
  smart: {
    colors: {
      page: '#F3F6F7',
      card: '#FFFFFF',
      textPrimary: '#16242C',
      textSecondary: '#667780',
      teal: '#168C88',
      amber: '#E9A23B',
      cardBorder: 'rgba(30,55,65,0.10)',
      tealTint: 'rgba(22,140,136,0.05)',
      amberTint: 'rgba(233,162,59,0.05)',
      neutral: '#C2CDD2',
    },
    spacing: {
      screenH: 16,
      screenHWide: 24,
      cardPadding: 16,
      cardGap: 16,
    },
    typography: {
      screenTitle: 27,
      cardTitle: 17,
      secondary: 13,
      sensorValue: 42,
      sensorNoDataValue: 30,
      statsValue: 22,
      unit: 17,
    },
    radius: {
      card: 14,
    },
    cardShadow: {
      shadowColor: '#0F2A2E',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 14,
      elevation: 2,
    },
  },
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
  // Legacy gel tokens (Settings management surfaces only — the History tab
  // moved to the smart block in history-smart-home-redesign; unchanged
  // until the Settings redesign).
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
  // D2 (approved): temperature → Smart teal; amendment 2: humidity →
  // Smart blue (amber stays reserved for warning/offline semantics).
  temperature: '#2AA79F',
  humidity: '#6AA9E0',
  smart: {
    colors: {
      // User-approved dark palette proposal (2026-09-05).
      page: '#101A1D',
      card: '#1A2529',
      textPrimary: '#E8EEF0',
      textSecondary: '#8FA0A8',
      teal: '#2AA79F',
      amber: '#F0B45C',
      cardBorder: 'rgba(255,255,255,0.08)',
      tealTint: 'rgba(42,167,159,0.05)',
      amberTint: 'rgba(240,180,92,0.05)',
      neutral: '#3E4B52',
    },
    spacing: {
      screenH: 16,
      screenHWide: 24,
      cardPadding: 16,
      cardGap: 16,
    },
    typography: {
      screenTitle: 27,
      cardTitle: 17,
      secondary: 13,
      sensorValue: 42,
      sensorNoDataValue: 30,
      statsValue: 22,
      unit: 17,
    },
    radius: {
      card: 14,
    },
    // Dark depth is border-borne: the hairline cardBorder carries it.
    cardShadow: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },
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
  // Legacy gel tokens (Settings management surfaces only — the History tab
  // moved to the smart block in history-smart-home-redesign; unchanged
  // until the Settings redesign).
  gradient: ['#10131a', '#1a2333'],
  surfaceGlass: 'rgba(30,40,60,0.6)',
  cardTintTemperature: 'rgba(242,212,176,0.08)',
  cardTintHumidity: 'rgba(155,203,213,0.12)',
  cardTintSwitchLight: 'rgba(255,217,160,0.10)',
  cardTintSwitchFan: 'rgba(184,223,232,0.12)',
  cardInnerEdge: 'rgba(255,255,255,0.12)',
  chipActiveBg: 'rgba(155,203,213,0.12)',
};
