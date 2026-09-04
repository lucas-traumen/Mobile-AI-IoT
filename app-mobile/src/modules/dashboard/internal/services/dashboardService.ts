/**
 * Dashboard service — owns the dashboards file (CRUD + widget editing).
 *
 * Every mutation:
 * 1. validates against the widget registry (`type` must exist, binding must
 *    satisfy `validateWidgetBinding`, size must be supported),
 * 2. applies the pure layout engine (findFreeSlot / applyMove / applyResize /
 *    compactVertical),
 * 3. persists through the repository,
 * 4. updates the mirror store + publishes `dashboards:changed { activeId }`.
 *
 * Failures are returned as {@link Result} — nothing is applied on error.
 *
 * Legacy migration (Phase 1): the built-in `connection` widget type was
 * retired from the registry, so `load()` removes any persisted instance
 * (deterministically, minimally repairing the affected layouts) before the UI
 * ever sees the file. The cleanup is idempotent; when the storage rewrite
 * fails the migrated file still becomes the in-memory truth and the next
 * `load()` retries the rewrite (the persisted file is only ever replaced,
 * never seeded over).
 */

import type { EventBus } from '@core/eventbus';
import { err, Errors, ok, type AppError, type Result } from '@core/errors';
import type { Logger } from '@core/logger';

import type { CapabilityType } from '@modules/devices/api';
import type {
  WidgetConfig,
  WidgetRegistry,
  WidgetSize,
} from '@modules/widgets/api';
import { validateWidgetBinding } from '@modules/widgets/api';
import { dedupeWidgets, duplicateWidgetError } from '@modules/widgets/api';
import type { CapabilityDef } from '@modules/devices/api';

import type { Dashboard, DashboardsFile } from '../domain/dashboardSchema';
import {
  defaultDashboardsFile,
  normalizeLegacySeedLayouts,
} from '../domain/seeds';
import {
  applyMove,
  applyResize,
  collides,
  compactVertical,
  findFreeSlot,
  SIZE_DIMENSIONS,
  validateLayout,
  widgetsShareVisibleScope,
} from '../domain/layout';
import { repairLayoutAfterRemoval } from '../domain/migrationLayout';
import type { DashboardRepository } from '../data/dashboardRepository';
import type { DashboardStore } from '../ui/dashboardStore';
import { createDashboardStore } from '../ui/dashboardStore';

/** Input for adding a widget (id/layout are computed by the service). */
export interface AddWidgetInput {
  readonly type: string;
  readonly title?: string;
  /** Room the widget belongs to (validated when provided). */
  readonly roomId?: string;
  readonly binding?: {
    readonly deviceId: string;
    readonly capability: CapabilityType;
  };
  /**
   * Requested grid size (CP-R3). Must be supported by the widget
   * definition; when omitted the definition's first supported size is used.
   */
  readonly size?: WidgetSize;
}

/** The new binding for a widget (used by {@link DashboardServiceImpl.updateWidgetBinding}). */
export interface WidgetBindingInput {
  readonly deviceId: string;
  readonly capability: CapabilityType;
}

/**
 * Room existence check injected by the composition root (rooms are owned by
 * the devices module). When absent, roomId validation is skipped.
 */
export type RoomExists = (roomId: string) => boolean;

/**
 * Capability catalog supplier injected by the composition root (the catalog
 * is owned by the devices module). Lets binding validation accept
 * user-defined capabilities (CP5/CP6). When absent only the static
 * `supportedCapabilities` are accepted.
 */
export type GetCapabilities = () => readonly CapabilityDef[];

/**
 * Device-room resolver injected by the composition root (fix cycle 1): the
 * room-scoped binding authority needs to know which room a device belongs
 * to (`undefined` = device unknown, e.g. a lost binding). When absent the
 * cross-room rebind validation is skipped (legacy store consumers/tests).
 */
export type GetDeviceRoom = (deviceId: string) => string | undefined;

/**
 * Widget types retired from the registry (Phase 1). They can never be added
 * again (the registry no longer defines them) and are stripped from any
 * persisted file at load time — WITHOUT rendering as `UnsupportedWidget`.
 */
const RETIRED_WIDGET_TYPES: readonly string[] = ['connection', 'history-chart'];

/**
 * Dashboard service — public operations over the persisted dashboards file.
 */
export class DashboardServiceImpl {
  private readonly repository: DashboardRepository;
  private readonly registry: WidgetRegistry;
  private readonly bus: EventBus;
  private readonly logger: Logger;
  private readonly roomExists?: RoomExists;
  private readonly getCapabilities?: GetCapabilities;
  private readonly getDeviceRoom?: GetDeviceRoom;
  private file: DashboardsFile;
  private readonly store: DashboardStore;
  private idCounter = 0;

  constructor(options: {
    repository: DashboardRepository;
    registry: WidgetRegistry;
    bus: EventBus;
    logger: Logger;
    /** Optional room existence predicate (wired to the devices registry). */
    roomExists?: RoomExists;
    /** Optional capability catalog (wired to the devices registry, CP5/CP6). */
    getCapabilities?: GetCapabilities;
    /**
     * Optional device-room resolver (wired to the devices registry, fix
     * cycle 1) — powers the authoritative room-scoped rebind validation.
     */
    getDeviceRoom?: GetDeviceRoom;
  }) {
    this.repository = options.repository;
    this.registry = options.registry;
    this.bus = options.bus;
    this.logger = options.logger;
    this.roomExists = options.roomExists;
    this.getCapabilities = options.getCapabilities;
    this.getDeviceRoom = options.getDeviceRoom;
    this.file = defaultDashboardsFile();
    this.store = createDashboardStore(this.file, {
      canRebindToRoom: this.canRebindToRoom,
    });
  }

  /**
   * Authoritative room-scoped binding check (approved plan slice E,
   * fix cycle 1): a room-scoped widget (`roomId` non-null) may only bind a
   * device that belongs to the SAME room. Global widgets (no `roomId`) may
   * bind any device, and devices with an unknown room (lost binding) are
   * allowed — that is exactly the state the rebind picker repairs. The UI
   * filters candidates; the store draft guard no-ops cross-room rebinds;
   * THIS is the persist-time authority (`updateWidgetBinding`/`applyLayout`).
   */
  private canRebindToRoom = (
    widgetRoomId: string | null | undefined,
    deviceId: string,
  ): boolean => {
    if (!widgetRoomId || !this.getDeviceRoom) {
      return true;
    }
    const deviceRoom = this.getDeviceRoom(deviceId);
    // Unknown device → the lost-binding state; allow (capability/binding
    // rules still apply, and the repair picker lists existing devices only).
    if (!deviceRoom) {
      return true;
    }
    return deviceRoom === widgetRoomId;
  };

  /** Cross-room rebind validation error for one widget, `null` when allowed. */
  private rebindRoomError(widget: WidgetConfig): AppError | null {
    if (!widget.binding) {
      return null;
    }
    if (!this.canRebindToRoom(widget.roomId, widget.binding.deviceId)) {
      return Errors.validation(
        `Widget "${widget.id}" is bound to a device from another room — rebind to a device of the widget's own room`,
      );
    }
    return null;
  }

  /** The capability catalog for binding validation (empty when not wired). */
  private catalog(): readonly CapabilityDef[] {
    return this.getCapabilities ? this.getCapabilities() : [];
  }

  /**
   * Which survivor types the LOAD MIGRATION may relocate (fix cycle 2):
   * registered built-ins only. Unknown/custom widget types are pinned —
   * their coordinates/title/binding survive migration EXACTLY.
   */
  private readonly isRegisteredWidget = (widget: WidgetConfig): boolean =>
    this.registry.get(widget.type) !== undefined;

  /** The zustand store mirrored to the UI (subscribe for re-renders). */
  getStore(): DashboardStore {
    return this.store;
  }

  /**
   * Load the persisted file (seeds defaults on first run).
   *
   * Runs two deterministic, idempotent migrations before the file becomes
   * the in-memory truth: (1) persisted retired-type widgets (`connection`)
   * are removed across all dashboards with a minimal layout repair;
   * (2) UNTOUCHED legacy seed relay layouts are normalized to the approved
   * side-by-side arrangement (`normalizeLegacySeedLayouts` — customized
   * layouts are never rewritten). When anything changed the migrated
   * snapshot is persisted; a storage failure never crashes the load — the
   * migrated file still drives the UI, the failure is logged, and the next
   * `load()` retries the rewrite. Loading an already-migrated file persists
   * nothing (idempotent).
   */
  async load(): Promise<Result<void>> {
    const result = await this.repository.load();
    if (!result.ok) {
      return result;
    }
    const retired = this.migrateRetiredWidgets(result.value);
    // Exact-duplicate migration (approved room-sensor rework): within a
    // dashboard, a sensor-value binding, a switch binding or the unbound
    // room overview may appear at most once — later exact duplicates are
    // deterministically removed (first occurrence wins). Fix cycle 2: the
    // repair afterwards is MIGRATION-SPECIFIC (`repairLayoutAfterRemoval`)
    // instead of the shared `compactVertical` gravity — surviving
    // custom/unknown widgets keep their exact coordinates, and registered
    // widgets move only into the rows a removal actually vacated. Idempotent;
    // unrelated/custom layouts untouched.
    const dedupedDashboards = retired.file.dashboards.map(dashboard => {
      const kept = dedupeWidgets(dashboard.widgets);
      if (kept === dashboard.widgets) {
        return dashboard;
      }
      const removed = dashboard.widgets.filter(w => !kept.includes(w));
      return {
        ...dashboard,
        widgets: repairLayoutAfterRemoval(
          kept,
          removed,
          this.isRegisteredWidget,
        ),
      };
    });
    // Conditional legacy-seed normalization (approved responsive redesign):
    // ONLY untouched seed relay arrangements are normalized to the new
    // side-by-side layout; customized layouts are never rewritten. Idempotent
    // (already-normalized files match no condition → no write).
    const normalizedDashboards = dedupedDashboards.map(dashboard => {
      const widgets = normalizeLegacySeedLayouts(dashboard.widgets);
      return widgets === dashboard.widgets
        ? dashboard
        : { ...dashboard, widgets: [...widgets] };
    });
    const changed =
      retired.changed ||
      dedupedDashboards.some(
        (dashboard, i) => dashboard !== retired.file.dashboards[i],
      ) ||
      normalizedDashboards.some(
        (dashboard, i) => dashboard !== dedupedDashboards[i],
      );
    const migration = {
      file: changed
        ? { ...retired.file, dashboards: normalizedDashboards }
        : retired.file,
      changed,
    };
    if (migration.changed) {
      const saved = await this.repository.save(migration.file);
      if (!saved.ok) {
        this.logger.warn(
          'Dashboards: legacy layout cleanup could not be persisted; keeping the migrated snapshot in memory (will retry on next load)',
          saved.error,
        );
      }
    }
    this.file = migration.file;
    this.store.getState().setFile(this.file);
    // Align the id counter with the persisted ids so new widgets never
    // collide with `w-<n>` ids coming from the loaded file.
    let max = 0;
    for (const dashboard of this.file.dashboards) {
      for (const widget of dashboard.widgets) {
        const match = /^w-(\d+)$/.exec(widget.id);
        if (match) {
          max = Math.max(max, Number(match[1]));
        }
      }
    }
    this.idCounter = max;
    this.logger.info(
      `Dashboards: loaded ${this.file.dashboards.length} dashboards (active "${this.file.activeId}")`,
    );
    return ok(undefined);
  }

  /**
   * Deterministic + idempotent removal of retired widget types (see
   * {@link RETIRED_WIDGET_TYPES}): only retired-type widgets are dropped,
   * every other widget (including unknown custom types) is kept, and each
   * affected dashboard receives the migration-specific minimal repair
   * (`repairLayoutAfterRemoval` — custom/unknown coordinates preserved,
   * registered widgets slide only into vacated rows). A dashboard that
   * held only retired widgets becomes empty — the dashboard itself
   * survives (no data loss beyond the retired type).
   */
  private migrateRetiredWidgets(file: DashboardsFile): {
    file: DashboardsFile;
    changed: boolean;
  } {
    let changed = false;
    const dashboards = file.dashboards.map(dashboard => {
      const kept = dashboard.widgets.filter(
        w => !RETIRED_WIDGET_TYPES.includes(w.type),
      );
      if (kept.length === dashboard.widgets.length) {
        return dashboard;
      }
      changed = true;
      const removed = dashboard.widgets.filter(w =>
        RETIRED_WIDGET_TYPES.includes(w.type),
      );
      return {
        ...dashboard,
        widgets: repairLayoutAfterRemoval(
          kept,
          removed,
          this.isRegisteredWidget,
        ),
      };
    });
    return changed
      ? { file: { ...file, dashboards }, changed }
      : { file, changed };
  }

  /** All dashboards. */
  getDashboards(): readonly Dashboard[] {
    return this.file.dashboards;
  }

  /** The active dashboard id. */
  getActiveId(): string {
    return this.file.activeId;
  }

  /** The active room filter id (`null` = "Tất cả"). */
  getActiveRoomId(): string | null {
    return this.file.activeRoomId ?? null;
  }

  /** The active dashboard (falls back to the first one when inconsistent). */
  getActiveDashboard(): Dashboard {
    return (
      this.file.dashboards.find(d => d.id === this.file.activeId) ??
      this.file.dashboards[0]
    );
  }

  /** Find a dashboard by id (`undefined` when unknown). */
  findDashboard(id: string): Dashboard | undefined {
    return this.file.dashboards.find(d => d.id === id);
  }

  /** Create a dashboard with a generated id (`dash-<n>`); becomes active. */
  async createDashboard(name: string): Promise<Result<void>> {
    if (name.trim().length === 0) {
      return err(Errors.validation('Dashboard name is required'));
    }
    const dashboard: Dashboard = {
      id: this.nextId('dash'),
      name: name.trim(),
      widgets: [],
    };
    const next: DashboardsFile = {
      ...this.file,
      dashboards: [...this.file.dashboards, dashboard],
      activeId: dashboard.id,
    };
    return this.commit(next);
  }

  /**
   * Delete a dashboard.
   *
   * @returns `err('validation')` when it is the last dashboard; when the
   *   active dashboard is deleted, the first remaining becomes active.
   */
  async deleteDashboard(id: string): Promise<Result<void>> {
    if (!this.file.dashboards.some(d => d.id === id)) {
      return err(Errors.notFound(`Dashboard "${id}" does not exist`));
    }
    if (this.file.dashboards.length === 1) {
      return err(Errors.validation('Cannot delete the last dashboard'));
    }
    const remaining = this.file.dashboards.filter(d => d.id !== id);
    const wasActive = this.file.activeId === id;
    const next: DashboardsFile = {
      ...this.file,
      dashboards: remaining,
      activeId: wasActive ? remaining[0].id : this.file.activeId,
    };
    return this.commit(next);
  }

  /** Set the dashboard shown by the UI (must exist). */
  async setActiveDashboard(id: string): Promise<Result<void>> {
    if (!this.file.dashboards.some(d => d.id === id)) {
      return err(Errors.notFound(`Dashboard "${id}" does not exist`));
    }
    if (this.file.activeId === id) {
      return ok(undefined);
    }
    return this.commit({ ...this.file, activeId: id });
  }

  /**
   * Set the active room filter (`null` = "Tất cả", every widget shown).
   * Non-null ids must exist in the devices registry (injected predicate).
   */
  async setActiveRoom(id: string | null): Promise<Result<void>> {
    if (id !== null && this.roomExists && !this.roomExists(id)) {
      return err(Errors.notFound(`Room "${id}" does not exist`));
    }
    if ((this.file.activeRoomId ?? null) === id) {
      return ok(undefined);
    }
    return this.commit({ ...this.file, activeRoomId: id });
  }

  /**
   * Add a widget to a dashboard.
   *
   * The widget type must be registered, its binding must satisfy the
   * definition rules and its size must be supported. The first supported
   * size is placed in the first free slot.
   *
   * While a draft edit is open, the widget is appended to the draft instead
   * of the persisted dashboard (slot computed against the draft); it becomes
   * durable only when the draft is committed via {@link applyLayout}.
   */
  async addWidget(
    dashboardId: string,
    input: AddWidgetInput,
  ): Promise<Result<void>> {
    const dashboard = this.findDashboard(dashboardId);
    if (!dashboard) {
      return err(Errors.notFound(`Dashboard "${dashboardId}" does not exist`));
    }
    if (
      input.roomId !== undefined &&
      this.roomExists &&
      !this.roomExists(input.roomId)
    ) {
      return err(Errors.notFound(`Room "${input.roomId}" does not exist`));
    }
    const def = this.registry.get(input.type);
    if (!def) {
      return err(Errors.validation(`Unknown widget type "${input.type}"`));
    }
    if (def.supportedSizes.length === 0) {
      return err(
        Errors.validation(`Widget type "${input.type}" has no supported sizes`),
      );
    }
    // CP-R3: honor the user-selected size; reject unsupported requests.
    let size = def.supportedSizes[0];
    if (input.size !== undefined) {
      if (!def.supportedSizes.includes(input.size)) {
        return err(
          Errors.validation(
            `Size "${input.size}" is not supported by widget type "${input.type}"`,
          ),
        );
      }
      size = input.size;
    }
    const sizeDims = SIZE_DIMENSIONS[size];
    // Draft mode: place against the working copy, not the persisted layout.
    const state = this.store.getState();
    const draft = state.editMode ? state.draftWidgets : null;
    const base = draft ?? dashboard.widgets;
    // CP-R3: the slot search is scoped to the widget's room (different rooms
    // reuse coordinates; globals collide with everything).
    const slot = findFreeSlot(
      base,
      sizeDims.width,
      sizeDims.height,
      input.roomId,
    );
    if (slot === null) {
      return err(Errors.validation('No free space on this dashboard'));
    }
    const widget: WidgetConfig = {
      id: this.nextId('w'),
      type: input.type,
      title: input.title as string | undefined,
      roomId: input.roomId,
      binding: input.binding ? { ...input.binding } : undefined,
      layout: { x: slot.x, y: slot.y, ...sizeDims },
    };
    const bindingResult = validateWidgetBinding(def, widget, this.catalog());
    if (!bindingResult.ok) {
      return err(Errors.validation(bindingResult.error));
    }
    // Room-authoritative binding check (approved room-authoritative
    // contract): a room-scoped widget may only bind a device of its OWN
    // room. Enforced here BEFORE any draft/persisted mutation — UI
    // filtering alone is insufficient.
    const roomError = this.rebindRoomError(widget);
    if (roomError !== null) {
      return err(roomError);
    }
    // Approved uniqueness invariant: within the dashboard, a sensor-value
    // binding, a switch binding or the unbound room overview appears at
    // most once — checked against the working list (draft when a draft is
    // open, persisted otherwise).
    const duplicateError = duplicateWidgetError(base, widget);
    if (duplicateError !== null) {
      return err(Errors.validation(duplicateError));
    }
    if (draft) {
      state.addDraftWidget(widget);
      return ok(undefined);
    }
    const next: DashboardsFile = {
      ...this.file,
      dashboards: this.file.dashboards.map(d =>
        d.id === dashboardId ? { ...d, widgets: [...d.widgets, widget] } : d,
      ),
    };
    return this.commit(next);
  }

  /** Remove a widget from a dashboard, then compact the layout vertically. */
  async removeWidget(
    dashboardId: string,
    widgetId: string,
  ): Promise<Result<void>> {
    const dashboard = this.findDashboard(dashboardId);
    if (!dashboard) {
      return err(Errors.notFound(`Dashboard "${dashboardId}" does not exist`));
    }
    if (!dashboard.widgets.some(w => w.id === widgetId)) {
      return err(Errors.notFound(`Widget "${widgetId}" does not exist`));
    }
    const widgets = compactVertical(
      dashboard.widgets.filter(w => w.id !== widgetId),
    );
    return this.updateDashboardWidgets(dashboardId, widgets);
  }

  /** Move a widget to a target position (bounds + overlap reject). */
  async moveWidget(
    dashboardId: string,
    widgetId: string,
    x: number,
    y: number,
  ): Promise<Result<void>> {
    const dashboard = this.findDashboard(dashboardId);
    if (!dashboard) {
      return err(Errors.notFound(`Dashboard "${dashboardId}" does not exist`));
    }
    const moved = applyMove(dashboard.widgets, widgetId, x, y);
    if (!moved.ok) {
      return err(Errors.validation(moved.error));
    }
    return this.updateDashboardWidgets(dashboardId, moved.value);
  }

  /**
   * Resize a widget (size must be supported by its definition).
   *
   * Keeps the current position when free; otherwise relocates to the first
   * free slot; rejects when no spot exists.
   */
  async resizeWidget(
    dashboardId: string,
    widgetId: string,
    size: WidgetSize,
  ): Promise<Result<void>> {
    const dashboard = this.findDashboard(dashboardId);
    if (!dashboard) {
      return err(Errors.notFound(`Dashboard "${dashboardId}" does not exist`));
    }
    const widget = dashboard.widgets.find(w => w.id === widgetId);
    if (!widget) {
      return err(Errors.notFound(`Widget "${widgetId}" does not exist`));
    }
    const def = this.registry.get(widget.type);
    if (!def) {
      return err(Errors.validation(`Unknown widget type "${widget.type}"`));
    }
    if (!def.supportedSizes.includes(size)) {
      return err(
        Errors.validation(
          `Size "${size}" is not supported by widget type "${widget.type}"`,
        ),
      );
    }
    const dims = SIZE_DIMENSIONS[size];
    const resized = applyResize(
      dashboard.widgets,
      widgetId,
      dims.width,
      dims.height,
    );
    if (!resized.ok) {
      return err(Errors.validation(resized.error));
    }
    return this.updateDashboardWidgets(dashboardId, resized.value);
  }

  /**
   * Replace a dashboard's widget list atomically (draft edit mode commit).
   *
   * Validates every widget against the registry (type known, binding rules,
   * size supported), validates the whole layout (unique ids, bounds, no
   * overlaps), then persists + publishes. Nothing is applied on any error.
   */
  async applyLayout(
    dashboardId: string,
    widgets: readonly WidgetConfig[],
  ): Promise<Result<void>> {
    const dashboard = this.findDashboard(dashboardId);
    if (!dashboard) {
      return err(Errors.notFound(`Dashboard "${dashboardId}" does not exist`));
    }
    for (const widget of widgets) {
      const def = this.registry.get(widget.type);
      if (!def) {
        return err(Errors.validation(`Unknown widget type "${widget.type}"`));
      }
      const bindingResult = validateWidgetBinding(def, widget, this.catalog());
      if (!bindingResult.ok) {
        return err(Errors.validation(bindingResult.error));
      }
      const roomError = this.rebindRoomError(widget);
      if (roomError !== null) {
        return err(roomError);
      }
      const size = `${widget.layout.width}x${widget.layout.height}`;
      if (!def.supportedSizes.includes(size as WidgetSize)) {
        return err(
          Errors.validation(
            `Size "${size}" is not supported by widget type "${widget.type}"`,
          ),
        );
      }
    }
    // Approved uniqueness invariant (authoritative even when the UI fails):
    // the incoming layout may not introduce exact duplicates.
    for (let i = 0; i < widgets.length; i++) {
      const duplicateError = duplicateWidgetError(
        widgets.slice(0, i),
        widgets[i]!,
      );
      if (duplicateError !== null) {
        return err(Errors.validation(duplicateError));
      }
    }
    return this.updateDashboardWidgets(dashboardId, widgets);
  }

  /**
   * Rebind a widget to a different device capability (lost-binding repair).
   *
   * The new capability must be supported by the widget's registered
   * definition; the layout is untouched. A room-scoped widget can only
   * rebind to a device of its OWN room (authoritative check, fix cycle 1) —
   * the UI filters candidates and the store draft guard no-ops cross-room
   * rebinds, but this service seam is what makes a cross-room binding
   * unpersistable.
   */
  async updateWidgetBinding(
    dashboardId: string,
    widgetId: string,
    binding: WidgetBindingInput,
  ): Promise<Result<void>> {
    const dashboard = this.findDashboard(dashboardId);
    if (!dashboard) {
      return err(Errors.notFound(`Dashboard "${dashboardId}" does not exist`));
    }
    const widget = dashboard.widgets.find(w => w.id === widgetId);
    if (!widget) {
      return err(Errors.notFound(`Widget "${widgetId}" does not exist`));
    }
    const def = this.registry.get(widget.type);
    if (!def) {
      return err(Errors.validation(`Unknown widget type "${widget.type}"`));
    }
    const candidate: WidgetConfig = { ...widget, binding: { ...binding } };
    const bindingResult = validateWidgetBinding(def, candidate, this.catalog());
    if (!bindingResult.ok) {
      return err(Errors.validation(bindingResult.error));
    }
    const roomError = this.rebindRoomError(candidate);
    if (roomError !== null) {
      return err(roomError);
    }
    return this.updateDashboardWidgets(
      dashboardId,
      dashboard.widgets.map(w => (w.id === widgetId ? candidate : w)),
    );
  }

  /**
   * Retarget / globalize widgets that belong to a removed room (CP5).
   *
   * - `toId` non-null: widgets with `roomId === fromId` move to `toId`.
   * - `toId` null: the widgets become global (their `roomId` is dropped).
   *
   * No-op (ok) when no widget references the room. Layouts are untouched.
   */
  /**
   * Migrate every widget bound to a removed room (CP5 cascade, called from
   * the devices registry). `toId === null` makes the widgets global; a room
   * id retargets them.
   *
   * Fix cycle 1: retargeting alone can collide the moved widgets with the
   * target room's widgets (or with each other when two source rooms merge).
   * Each affected dashboard therefore runs a **deterministic room-aware
   * relocation** before commit, preserving globals/other-room layouts:
   *
   * 1. Retarget the room ids.
   * 2. In original order, any retargeted widget that collides inside its
   *    new visible scope is relocated to the first free room-scoped slot
   *    (`findFreeSlot` against the working list, self excluded — already
   *    relocated widgets are accounted for).
   * 3. The whole list is validated (`validateLayout`); nothing is persisted
   *    when invalid — the caller receives an explicit failure and can roll
   *    its own state back.
   */
  async migrateWidgetsFromRoom(
    fromId: string,
    toId: string | null,
  ): Promise<Result<void>> {
    let changed = false;
    for (const dashboard of this.file.dashboards) {
      if (!dashboard.widgets.some(w => w.roomId === fromId)) {
        continue;
      }
      changed = true;
    }
    if (!changed) {
      return ok(undefined);
    }
    const dashboards: Dashboard[] = [];
    for (const dashboard of this.file.dashboards) {
      if (!dashboard.widgets.some(w => w.roomId === fromId)) {
        dashboards.push(dashboard);
        continue;
      }
      const retargeted: WidgetConfig[] = dashboard.widgets.map(w => {
        if (w.roomId !== fromId) {
          return w;
        }
        return toId === null
          ? { ...w, roomId: undefined }
          : { ...w, roomId: toId };
      });
      // Only retargeted widgets may be relocated — existing widgets of the
      // target room keep their layouts (the mover moves around them).
      const moverIds = new Set(
        dashboard.widgets.filter(w => w.roomId === fromId).map(w => w.id),
      );
      // Relocate colliding movers in original order (deterministic).
      let working = [...retargeted];
      for (const moved of retargeted) {
        if (!moverIds.has(moved.id)) {
          continue;
        }
        const others = working.filter(
          o => o.id !== moved.id && widgetsShareVisibleScope(moved, o),
        );
        if (!others.some(o => collides(o.layout, moved.layout))) {
          continue;
        }
        const slot = findFreeSlot(
          working.filter(o => o.id !== moved.id),
          moved.layout.width,
          moved.layout.height,
          moved.roomId,
        );
        if (slot === null) {
          return err(
            Errors.validation(
              `No free space to migrate widget "${moved.id}" into room "${
                toId ?? 'global'
              }"`,
            ),
          );
        }
        working = working.map(o =>
          o.id === moved.id
            ? { ...o, layout: { ...o.layout, x: slot.x, y: slot.y } }
            : o,
        );
      }
      const validity = validateLayout(working);
      if (!validity.ok) {
        return err(Errors.validation(validity.error));
      }
      dashboards.push({ ...dashboard, widgets: working });
    }
    return this.commit({ ...this.file, dashboards });
  }

  /**
   * Remove every widget binding a removed device (across all dashboards),
   * compacting each affected dashboard. Cascade for `devices:changed`.
   */
  async removeWidgetsForDevice(deviceId: string): Promise<Result<void>> {
    let changed = false;
    const dashboards = this.file.dashboards.map(dashboard => {
      const kept = dashboard.widgets.filter(
        w => w.binding?.deviceId !== deviceId,
      );
      if (kept.length === dashboard.widgets.length) {
        return dashboard;
      }
      changed = true;
      return { ...dashboard, widgets: compactVertical(kept) };
    });
    if (!changed) {
      return ok(undefined);
    }
    return this.commit({ ...this.file, dashboards });
  }

  /**
   * Remove every widget bound to ONE exact device capability (across all
   * dashboards), compacting each affected dashboard (approved binding-level
   * cascade): removing one projected sensor metric of a surviving legacy
   * multi-capability device cleans only that metric's widgets — sibling
   * metrics stay.
   */
  async removeWidgetsForBinding(
    deviceId: string,
    capability: string,
  ): Promise<Result<void>> {
    let changed = false;
    const dashboards = this.file.dashboards.map(dashboard => {
      const kept = dashboard.widgets.filter(
        w =>
          !(
            w.binding?.deviceId === deviceId &&
            w.binding?.capability === capability
          ),
      );
      if (kept.length === dashboard.widgets.length) {
        return dashboard;
      }
      changed = true;
      return { ...dashboard, widgets: compactVertical(kept) };
    });
    if (!changed) {
      return ok(undefined);
    }
    return this.commit({ ...this.file, dashboards });
  }

  /** Replace one dashboard's widgets and commit (after compaction). */
  private async updateDashboardWidgets(
    dashboardId: string,
    widgets: readonly WidgetConfig[],
  ): Promise<Result<void>> {
    const validity = validateLayout(widgets);
    if (!validity.ok) {
      // Should never happen post-compaction; guard anyway.
      return err(Errors.validation(validity.error));
    }
    const next: DashboardsFile = {
      ...this.file,
      dashboards: this.file.dashboards.map(d =>
        d.id === dashboardId ? { ...d, widgets: [...widgets] } : d,
      ),
    };
    return this.commit(next);
  }

  private async commit(next: DashboardsFile): Promise<Result<void>> {
    const saved = await this.repository.save(next);
    if (!saved.ok) {
      return saved;
    }
    this.file = next;
    this.store.getState().setFile(next);
    this.logger.info(
      `Dashboards: committed ${next.dashboards.length} dashboards (active "${next.activeId}")`,
    );
    this.bus.emit('dashboards:changed', { activeId: next.activeId });
    return ok(undefined);
  }

  /** Generate a stable, unique id: `<prefix>-<counter>`. */
  private nextId(prefix: 'dash' | 'w'): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }
}
