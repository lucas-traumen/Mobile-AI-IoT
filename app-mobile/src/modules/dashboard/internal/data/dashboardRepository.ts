/**
 * Dashboard persistence: AsyncStorage adapter (port + implementation).
 *
 * Same pattern as the settings/devices repositories: load → seed on first
 * run, validate with zod before trusting anything, map IO failures to
 * {@link Result}. Invalid stored data is logged and replaced with seeds
 * (never thrown).
 *
 * Template-era load contract: the repository discriminates the persisted
 * shape and reports it — `{ kind: 'seed' }` when nothing (valid) is stored,
 * `{ kind: 'file' }` with `migratedFromLegacy` when a pre-Template file was
 * structurally migrated. The dashboard SERVICE owns every migration decision
 * (stamping, registry ordering, persisting the migrated snapshot) — the
 * repository only validates, discriminates and stores. A VALID user snapshot
 * (current or legacy) is never reseeded; only unusable garbage falls back to
 * the seed (logged, never thrown).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@core/constants';
import { err, Errors, ok, type Result } from '@core/errors';
import type { Logger } from '@core/logger';

import type { WidgetConfig } from '@modules/widgets/api';

import type { DashboardsFile } from '../domain/dashboardSchema';
import {
  parseCurrentDashboardsFile,
  parseDashboardsFile,
} from '../domain/dashboardSchema';

// ---------------------------------------------------------------------------
// TEMPORARY [RESIZE-DIAG] — remove after diagnosis.
// Formatting helpers for the raw-bytes load/save logs: `id:WxH@x,y` and the
// exact JSON of the FIRST template's FIRST room's widgets (small — 4 items).
// Optional-chained so the logging can never throw on missing data.
// ---------------------------------------------------------------------------
interface DiagRawLayout {
  readonly width?: unknown;
  readonly height?: unknown;
  readonly x?: unknown;
  readonly y?: unknown;
}
interface DiagRawWidget {
  readonly id?: unknown;
  readonly layout?: DiagRawLayout | null;
}
interface DiagRawRoom {
  readonly roomId?: unknown;
  readonly widgets?: readonly DiagRawWidget[] | null;
}
interface DiagRawTemplate {
  readonly rooms?: readonly DiagRawRoom[] | null;
}
interface DiagRawFile {
  readonly templates?: readonly DiagRawTemplate[] | null;
}

/** `id:WxH@x,y` for a possibly-unvalidated (raw parsed) widget. */
function diagRawWidget(widget: DiagRawWidget): string {
  const layout = widget.layout;
  return (
    `${String(widget.id ?? '?')}:` +
    `${String(layout?.width ?? '?')}x${String(layout?.height ?? '?')}` +
    `@${String(layout?.x ?? '?')},${String(layout?.y ?? '?')}`
  );
}

/** `id:WxH@x,y` for a validated widget. */
function diagWidget(widget: WidgetConfig): string {
  return (
    `${widget.id}:${widget.layout.width}x${widget.layout.height}` +
    `@${widget.layout.x},${widget.layout.y}`
  );
}

/** `<roomId>=[w,w]` per room, all templates/rooms, from a raw parsed file. */
function diagRawRooms(file: DiagRawFile | null | undefined): string {
  if (!file?.templates || file.templates.length === 0) {
    return 'none';
  }
  return file.templates
    .map(
      (template, tIndex) =>
        `t${tIndex}[${
          template?.rooms
            ?.map(
              room =>
                `${String(room?.roomId ?? '?')}=[${(room?.widgets ?? [])
                  .map(diagRawWidget)
                  .join(',')}]`,
            )
            .join(' ') ?? 'no-rooms'
        }]`,
    )
    .join(' ');
}

/** `<roomId>=[w,w]` per room for a validated file. */
function diagRooms(file: DashboardsFile): string {
  return file.templates
    .map(
      (template, tIndex) =>
        `t${tIndex}[${template.rooms
          .map(
            room =>
              `${room.roomId}=[${room.widgets.map(diagWidget).join(',')}]`,
          )
          .join(' ')}]`,
    )
    .join(' ');
}

/** `id:WxH` list of the FIRST template's FIRST room (validated file). */
function diagFirstRoomSizes(file: DashboardsFile): string {
  return (
    file.templates[0]?.rooms[0]?.widgets
      .map(w => `${w.id}:${w.layout.width}x${w.layout.height}`)
      .join(',') ?? 'none'
  );
}

/** Raw JSON of the FIRST template's FIRST room's widgets (validated file). */
function diagFirstRoomWidgetsJson(file: DashboardsFile): string {
  const widgets = file.templates[0]?.rooms[0]?.widgets;
  return widgets === undefined ? 'none' : JSON.stringify(widgets);
}
// ---------------------------------------------------------------------------
// END TEMPORARY [RESIZE-DIAG]
// ---------------------------------------------------------------------------

/** What a successful `load()` found in storage. */
export type LoadedDashboardsFile =
  | {
      /** Nothing valid was persisted (first run or unusable garbage). */
      readonly kind: 'seed';
    }
  | {
      /** A valid persisted file (current, or migrated from the legacy shape). */
      readonly kind: 'file';
      readonly file: DashboardsFile;
      /** True when the stored file used the pre-Template legacy shape. */
      readonly migratedFromLegacy: boolean;
    };

/** Port: persisted dashboards access (no storage knowledge in domain). */
export interface DashboardRepository {
  /**
   * Load the persisted file. Reports `seed` when nothing valid is stored
   * (the service decides what a first-run file looks like) and the
   * `migratedFromLegacy` flag so the service can persist the migration.
   */
  load(): Promise<Result<LoadedDashboardsFile>>;
  /** Persist a file; validates before writing. */
  save(file: DashboardsFile): Promise<Result<void>>;
}

/** AsyncStorage-backed implementation of {@link DashboardRepository}. */
export class AsyncStorageDashboardRepository implements DashboardRepository {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async load(): Promise<Result<LoadedDashboardsFile>> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.dashboards);
      // TEMPORARY [RESIZE-DIAG] — remove after diagnosis. Distinguish
      // raw===null (first run) vs JSON-fail vs validation-fail definitively.
      this.logger.info(
        `[RESIZE-DIAG] repo.load raw===null ? ${raw === null}` +
          `${raw === null ? '' : ` len=${raw.length}`}`,
      );
      if (raw === null) {
        return ok({ kind: 'seed' });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        this.logger.warn(
          'Dashboards: stored value is not valid JSON, seeding defaults',
          e,
        );
        return ok({ kind: 'seed' });
      }
      // TEMPORARY [RESIZE-DIAG] — remove after diagnosis. RAW stored bytes:
      // every room's sizes + the exact first-room widgets JSON, all BEFORE
      // any migration/validation.
      this.logger.info(
        `[RESIZE-DIAG] repo.load raw rooms[0].widgets=${
          JSON.stringify(
            (parsed as DiagRawFile | null)?.templates?.[0]?.rooms?.[0]?.widgets,
          ) ?? 'null'
        } all=${diagRawRooms(parsed as DiagRawFile | null)}`,
      );
      const result = parseDashboardsFile(parsed);
      if (!result.ok) {
        this.logger.warn(
          'Dashboards: stored value failed validation, seeding defaults',
          result.errors,
        );
        // TEMPORARY [RESIZE-DIAG] — remove after diagnosis. The warn above
        // passes errors as a second arg which the logger may not serialize
        // visibly; this line guarantees the exact zod issues are printed.
        this.logger.info(
          `[RESIZE-DIAG] repo.load VALIDATION FAILED ` +
            `errors=${JSON.stringify(result.errors)}`,
        );
        return ok({ kind: 'seed' });
      }
      // TEMPORARY [RESIZE-DIAG] — remove after diagnosis. Parse succeeded:
      // kind=file, plus whether this was a legacy-shape migration.
      this.logger.info(
        `[RESIZE-DIAG] repo.load parse OK kind=file ` +
          `migrated=${result.migrated}`,
      );
      // TEMPORARY [RESIZE-DIAG] — remove after diagnosis. Parsed sizes right
      // after validation (still pre-service-migration).
      this.logger.info(
        `[RESIZE-DIAG] repo.load parsed=${diagFirstRoomSizes(result.value)}`,
      );
      return ok({
        kind: 'file',
        file: result.value,
        migratedFromLegacy: result.migrated,
      });
    } catch (e) {
      return err(Errors.unknown('Failed to read dashboards from storage', e));
    }
  }

  async save(file: DashboardsFile): Promise<Result<void>> {
    // Save-time validation: only the CURRENT (Template) shape is persistable
    // — the legacy shape can never be written back (the service migrates
    // before any save).
    const result = parseCurrentDashboardsFile(file);
    if (!result.ok) {
      return err(
        Errors.validation(
          'Cannot persist invalid dashboards file',
          result.errors,
        ),
      );
    }
    try {
      const serialized = JSON.stringify(result.value);
      // TEMPORARY [RESIZE-DIAG] — remove after diagnosis. Exact bytes about
      // to hit AsyncStorage: all-room sizes + full raw JSON of rooms[0].
      this.logger.info(
        `[RESIZE-DIAG] repo.save widgets=${diagRooms(result.value)}`,
      );
      this.logger.info(
        `[RESIZE-DIAG] repo.save rooms[0].widgets.json=` +
          `${diagFirstRoomWidgetsJson(result.value)} ` +
          `len=${serialized.length}`,
      );
      await AsyncStorage.setItem(STORAGE_KEYS.dashboards, serialized);
      return ok(undefined);
    } catch (e) {
      return err(Errors.unknown('Failed to write dashboards to storage', e));
    }
  }
}
