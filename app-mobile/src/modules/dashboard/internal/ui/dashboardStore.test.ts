/**
 * Dashboard store draft edit-mode tests (CP3).
 *
 * Verifies: enterEdit copies the dashboard widgets into an isolated draft;
 * draft move/resize/remove mutate the draft only (persisted dashboards stay
 * untouched); cancelEdit restores everything (Hủy → layout không đổi);
 * addDraftWidget appends; enterEdit guards (already editing, unknown id).
 */

import { defaultDashboardsFile } from '../domain/seeds';
import type { DashboardsFile } from '../domain/dashboardSchema';
import { createDashboardStore } from './dashboardStore';

function makeStore(file: DashboardsFile = defaultDashboardsFile()) {
  return createDashboardStore(file);
}

describe('dashboardStore draft edit mode', () => {
  it('starts outside edit mode with no draft', () => {
    const store = makeStore();
    expect(store.getState().editMode).toBe(false);
    expect(store.getState().draftWidgets).toBeNull();
  });

  it('enterEdit copies the dashboard widgets into the draft', () => {
    const store = makeStore();
    store.getState().enterEdit('main');
    const state = store.getState();
    expect(state.editMode).toBe(true);
    expect(state.draftWidgets).not.toBeNull();
    expect(state.draftWidgets!.map(w => w.id)).toEqual([
      'w-temp',
      'w-hum',
      'w-light',
      'w-fan',
    ]);
  });

  it('enterEdit is a no-op when already editing or for an unknown dashboard', () => {
    const store = makeStore();
    store.getState().enterEdit('main');
    const firstDraft = store.getState().draftWidgets;
    store.getState().enterEdit('main'); // already editing → keep the draft
    expect(store.getState().draftWidgets).toBe(firstDraft);

    const store2 = makeStore();
    store2.getState().enterEdit('ghost');
    expect(store2.getState().editMode).toBe(false);
    expect(store2.getState().draftWidgets).toBeNull();
  });

  it('draft mutations do not touch the persisted dashboards', () => {
    const store = makeStore();
    store.getState().enterEdit('main');
    store.getState().removeWidget('w-temp');
    const persisted = store.getState().dashboards.find(d => d.id === 'main')!;
    expect(persisted.widgets.map(w => w.id)).toContain('w-temp');
  });

  it('moveWidget applies a valid move to the draft only', () => {
    const store = makeStore();
    store.getState().enterEdit('main');
    // (1, 5) is below every seed row → free.
    expect(store.getState().moveWidget('w-temp', 1, 5)).toBe(true);
    const moved = store.getState().draftWidgets!.find(w => w.id === 'w-temp')!;
    expect(moved.layout).toMatchObject({ x: 1, y: 5 });
  });

  it('moveWidget rejects an overlap and leaves the draft unchanged', () => {
    const store = makeStore();
    store.getState().enterEdit('main');
    // w-hum occupies (1,0) → moving w-temp onto it is rejected.
    expect(store.getState().moveWidget('w-temp', 1, 0)).toBe(false);
    const widget = store.getState().draftWidgets!.find(w => w.id === 'w-temp')!;
    expect(widget.layout).toMatchObject({ x: 0, y: 0 });
  });

  it('resizeWidget relocates a draft widget when the spot is blocked', () => {
    const store = makeStore();
    store.getState().enterEdit('main');
    // w-temp 1x1 at (0,0) → 2x1 would hit w-hum at (1,0) and the seed's
    // side-by-side switch cards occupy row 1 → relocates to the first free
    // 2x1 slot (0,2).
    expect(store.getState().resizeWidget('w-temp', '2x1')).toBe(true);
    const resized = store
      .getState()
      .draftWidgets!.find(w => w.id === 'w-temp')!;
    expect(resized.layout).toEqual({ x: 0, y: 2, width: 2, height: 1 });
  });

  it('removeWidget removes from the draft and compacts vertically', () => {
    const file: DashboardsFile = {
      dashboards: [
        {
          id: 'main',
          name: 'Trang chủ',
          widgets: [
            {
              id: 'w-a',
              type: 'sensor-value',
              layout: { x: 0, y: 0, width: 1, height: 1 },
            },
            {
              id: 'w-b',
              type: 'room-device-list',
              layout: { x: 0, y: 2, width: 2, height: 1 },
            },
          ],
        },
      ],
      activeId: 'main',
      activeRoomId: null,
    };
    const store = makeStore(file);
    store.getState().enterEdit('main');
    store.getState().removeWidget('w-a');
    const draft = store.getState().draftWidgets!;
    expect(draft).toHaveLength(1);
    // The gap (row 0) is filled — w-b slides up.
    expect(draft[0].layout).toEqual({ x: 0, y: 0, width: 2, height: 1 });
  });

  it('addDraftWidget appends to the open draft', () => {
    const store = makeStore();
    store.getState().enterEdit('main');
    store.getState().addDraftWidget({
      id: 'w-new',
      type: 'room-device-list',
      layout: { x: 0, y: 3, width: 2, height: 1 },
    });
    expect(store.getState().draftWidgets!.some(w => w.id === 'w-new')).toBe(
      true,
    );
  });

  it('draft actions are no-ops outside edit mode', () => {
    const store = makeStore();
    expect(store.getState().moveWidget('w-temp', 1, 5)).toBe(false);
    expect(store.getState().resizeWidget('w-temp', '2x1')).toBe(false);
    store.getState().removeWidget('w-temp'); // does not throw
    expect(store.getState().draftWidgets).toBeNull();
  });

  it('cancelEdit discards the draft (Hủy → layout không đổi)', () => {
    const store = makeStore();
    const before = store
      .getState()
      .dashboards.find(d => d.id === 'main')!
      .widgets.map(w => w.id);
    store.getState().enterEdit('main');
    store.getState().removeWidget('w-temp');
    store.getState().moveWidget('w-hum', 1, 9);
    store.getState().cancelEdit();

    const state = store.getState();
    expect(state.editMode).toBe(false);
    expect(state.draftWidgets).toBeNull();
    expect(
      state.dashboards.find(d => d.id === 'main')!.widgets.map(w => w.id),
    ).toEqual(before);
  });
});

describe('dashboardStore room-scoped editor seam (CP-R3)', () => {
  it('enterEdit records the editor room and keeps ALL widgets in the draft', () => {
    const store = makeStore();
    store.getState().enterEdit('main', 'room-living');
    const state = store.getState();
    expect(state.editMode).toBe(true);
    expect(state.editorRoomId).toBe('room-living');
    // Draft retains every widget (other rooms included), not just the
    // selected room's — Save must preserve them.
    expect(state.draftWidgets).toHaveLength(4);
  });

  it('enterEdit without a room keeps editorRoomId null (legacy callers)', () => {
    const store = makeStore();
    store.getState().enterEdit('main');
    expect(store.getState().editorRoomId).toBeNull();
  });

  it('setEditorRoom switches the visible room without resetting the draft', () => {
    const store = makeStore();
    store.getState().enterEdit('main', 'room-living');
    store.getState().removeWidget('w-temp');
    const draftAfterRemove = store.getState().draftWidgets;
    store.getState().setEditorRoom('room-bedroom');
    const state = store.getState();
    expect(state.editorRoomId).toBe('room-bedroom');
    // Draft untouched by the room switch.
    expect(state.draftWidgets).toBe(draftAfterRemove);
    expect(state.editMode).toBe(true);
  });

  it('setEditorRoom is a no-op outside edit mode', () => {
    const store = makeStore();
    store.getState().setEditorRoom('room-living');
    expect(store.getState().editorRoomId).toBeNull();
    expect(store.getState().editMode).toBe(false);
  });

  it('draft move respects the editor room scope (other-room widgets preserved)', () => {
    const file: DashboardsFile = {
      dashboards: [
        {
          id: 'main',
          name: 'Trang chủ',
          widgets: [
            {
              id: 'w-a',
              type: 'sensor-value',
              roomId: 'r1',
              layout: { x: 0, y: 0, width: 1, height: 1 },
            },
            {
              id: 'w-b',
              type: 'room-device-list',
              roomId: 'r2',
              layout: { x: 0, y: 0, width: 2, height: 1 },
            },
          ],
        },
      ],
      activeId: 'main',
      activeRoomId: null,
    };
    const store = makeStore(file);
    store.getState().enterEdit('main', 'r1');
    // w-b belongs to r2 — invisible while editing r1, so w-a may share (0,0).
    expect(store.getState().moveWidget('w-a', 0, 0)).toBe(true);
    const draft = store.getState().draftWidgets!;
    expect(draft.find(w => w.id === 'w-b')!.layout).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 1,
    });
  });

  it('cancelEdit clears the editor room', () => {
    const store = makeStore();
    store.getState().enterEdit('main', 'room-living');
    store.getState().cancelEdit();
    expect(store.getState().editorRoomId).toBeNull();
  });

  it('rebindDraftWidget retargets the binding inside the draft only', () => {
    const store = makeStore();
    store.getState().enterEdit('main', 'room-living');
    store.getState().rebindDraftWidget('w-temp', 'sensor-02', 'humidity');
    const draft = store.getState().draftWidgets!;
    expect(draft.find(w => w.id === 'w-temp')!.binding).toEqual({
      deviceId: 'sensor-02',
      capability: 'humidity',
    });
    // Persisted dashboard untouched until Save.
    const persisted = store
      .getState()
      .dashboards.find(d => d.id === 'main')!.widgets;
    expect(persisted.find(w => w.id === 'w-temp')!.binding).toEqual({
      deviceId: 'sensor-01',
      capability: 'temperature',
    });
    // No-op outside edit mode.
    store.getState().cancelEdit();
    store.getState().rebindDraftWidget('w-temp', 'x', 'y');
    expect(store.getState().draftWidgets).toBeNull();
  });
});
