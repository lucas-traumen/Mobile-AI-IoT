/**
 * Settings store — thin ViewModel over {@link SettingsService}.
 *
 * No business logic here: it holds UI state (draft form fields, save status)
 * and forwards validated input to the service.
 */

import { create } from 'zustand';

import {
  defaultSettings,
  parseSettings,
  type AppSettings,
  type MqttSettings,
  type SettingsService,
  type UiSettings,
} from '@modules/settings/api';

/** Field-level error map keyed by dotted path (e.g. `mqtt.host`). */
export interface SettingsFormErrors {
  [field: string]: string;
}

interface SettingsState {
  /** Latest persisted settings (what telemetry/history actually use). */
  current: AppSettings;
  /** In-editing draft (mirrors the form). */
  draft: AppSettings;
  /** Field-level validation errors of the current draft. */
  errors: SettingsFormErrors;
  /** True while a save is in flight. */
  saving: boolean;
  /** Last save result message ("" = none). */
  saveMessage: string;
  setCurrent(settings: AppSettings): void;
  updateMqtt(patch: Partial<MqttSettings>): void;
  updateInflux(patch: Partial<AppSettings['influx']>): void;
  updateUi(patch: Partial<UiSettings>): void;
  save(): Promise<void>;
}

function recomputeErrors(settings: AppSettings): SettingsFormErrors {
  const result = parseSettings(settings);
  if (result.ok) {
    return {};
  }
  const errors: SettingsFormErrors = {};
  for (const message of result.errors) {
    const field = message.split(':')[0];
    errors[field] = message;
  }
  return errors;
}

/** Create a zustand store bound to a settings service. */
export function createSettingsStore(service: SettingsService) {
  return create<SettingsState>((set, get) => ({
    current: defaultSettings(),
    draft: defaultSettings(),
    errors: {},
    saving: false,
    saveMessage: '',

    setCurrent: settings =>
      set({ current: settings, draft: settings, saveMessage: '' }),

    updateMqtt: patch =>
      set(state => {
        const draft = {
          ...state.draft,
          mqtt: { ...state.draft.mqtt, ...patch },
        };
        return { draft, errors: recomputeErrors(draft), saveMessage: '' };
      }),

    updateInflux: patch =>
      set(state => {
        const draft = {
          ...state.draft,
          influx: { ...state.draft.influx, ...patch },
        };
        return { draft, errors: recomputeErrors(draft), saveMessage: '' };
      }),

    updateUi: patch =>
      set(state => {
        const draft = {
          ...state.draft,
          ui: { ...state.draft.ui, ...patch },
        };
        return { draft, errors: recomputeErrors(draft), saveMessage: '' };
      }),

    save: async () => {
      const { draft } = get();
      const errors = recomputeErrors(draft);
      if (Object.keys(errors).length > 0) {
        set({
          errors,
          saveMessage: 'Fix the highlighted fields before saving.',
        });
        return;
      }
      set({ saving: true, saveMessage: '' });
      const result = await service.save(draft);
      set({ saving: false });
      if (result.ok) {
        set({ saveMessage: 'Settings saved and applied.' });
      } else {
        set({ saveMessage: `Save failed: ${result.error.message}` });
      }
    },
  }));
}

/** The zustand store instance shape returned by {@link createSettingsStore}. */
export type SettingsStore = ReturnType<typeof createSettingsStore>;
