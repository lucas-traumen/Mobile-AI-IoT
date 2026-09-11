/**
 * CreateRoomScreen tests — focused render + visual contract (reviewer
 * MAJOR-3, settings-smart-home-sync fix cycle 1).
 *
 * The screen is a dumb four-prop form (see `hierarchyRoutes.tsx`
 * CreateRoomRoute for the realistic wiring), so these tests pin the
 * presentation contract only, not the create/add flows:
 * - AMBIENT WASH: the diagonal Smart Home wash (tealTint → page →
 *   amberTint) in light AND dark,
 * - SMART ROWS: the existing-room cards render the full smart card recipe
 *   (card surface + hairline border + token radius + the smart card
 *   shadow added this cycle) — one per available room,
 * - SMART FORM: the name input sits on the smart card surface with the
 *   hairline border; the create action uses the smart teal with the
 *   readable `onPrimary` label.
 */

import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

import { DARK_TOKENS, LIGHT_TOKENS, ThemeProvider } from '@core/theme';

import type { Room } from '@modules/devices/api';

import { OK_OUTCOME } from './ConfirmDialog';
import { CreateRoomScreen } from './CreateRoomScreen';

const AVAILABLE_ROOMS: readonly Room[] = [
  { id: 'room-garage', name: 'Nhà để xe', order: 0 },
  { id: 'room-attic', name: 'Gác xép', order: 1 },
];

/** Render the screen with realistic props (CreateRoomRoute shape). */
function renderScreen(mode: 'light' | 'dark'): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <CreateRoomScreen
          availableRooms={AVAILABLE_ROOMS}
          onAddExisting={async () => OK_OUTCOME}
          onCreateNew={async () => ({ ok: true, message: '', kind: 'added' })}
          onCancel={() => undefined}
        />
      </ThemeProvider>,
    );
  });
  return renderer;
}

/** Flatten an RN style (object or array of objects) into one plain object. */
function flatStyles(style: unknown): Record<string, unknown> {
  const layers = Array.isArray(style) ? style : [style];
  return Object.assign(
    {},
    ...(layers.filter(
      layer => layer !== null && typeof layer === 'object',
    ) as Record<string, unknown>[]),
  );
}

/** Views whose flattened style carries ALL the given style entries. */
function viewsWithStyle(
  root: ReactTestInstance,
  match: Record<string, unknown>,
): ReactTestInstance[] {
  return root.findAllByType(View).filter(view => {
    const flat = flatStyles(view.props.style);
    return Object.entries(match).every(([key, value]) => flat[key] === value);
  });
}

describe('CreateRoomScreen ambient wash (settings-smart-home-sync)', () => {
  it('renders the diagonal teal→page→amber wash in light AND dark', () => {
    for (const [mode, tokens] of [
      ['light', LIGHT_TOKENS],
      ['dark', DARK_TOKENS],
    ] as const) {
      const renderer = renderScreen(mode);
      const gradient = renderer.root.findByType(LinearGradient);
      expect(gradient.props.colors).toEqual([
        tokens.smart.colors.tealTint,
        tokens.smart.colors.page,
        tokens.smart.colors.amberTint,
      ]);
      expect(gradient.props.start).toEqual({ x: 0, y: 0 });
      expect(gradient.props.end).toEqual({ x: 1, y: 1 });
      act(() => {
        renderer.unmount();
      });
    }
  });
});

describe('CreateRoomScreen smart rows + form (light AND dark)', () => {
  it('renders every existing-room card on the FULL smart card recipe', () => {
    for (const [mode, tokens] of [
      ['light', LIGHT_TOKENS],
      ['dark', DARK_TOKENS],
    ] as const) {
      const renderer = renderScreen(mode);
      // Card surface + hairline border + token radius + the smart card
      // shadow (reviewer MAJOR-2: the shadow was missing on these cards).
      const cards = viewsWithStyle(renderer.root, {
        backgroundColor: tokens.smart.colors.card,
        borderColor: tokens.smart.colors.cardBorder,
        borderRadius: tokens.smart.radius.card,
        elevation: tokens.smart.cardShadow.elevation,
      });
      expect(cards).toHaveLength(AVAILABLE_ROOMS.length);
      act(() => {
        renderer.unmount();
      });
    }
  });

  it('renders the smart input + teal create action', () => {
    for (const [mode, tokens] of [
      ['light', LIGHT_TOKENS],
      ['dark', DARK_TOKENS],
    ] as const) {
      const renderer = renderScreen(mode);

      // The new-room name input sits on the smart card surface with the
      // hairline card border.
      const input = renderer.root.findByProps({
        testID: 'create-room-new-name',
      }) as ReactTestInstance;
      expect(input.type).toBe(TextInput);
      const inputStyle = flatStyles(input.props.style);
      expect(inputStyle.backgroundColor).toBe(tokens.smart.colors.card);
      expect(inputStyle.borderColor).toBe(tokens.smart.colors.cardBorder);

      // The create action is the smart teal (D2 invariant) with the
      // readable onPrimary label.
      const submit = renderer.root.findByProps({
        testID: 'create-room-new-submit',
      }) as ReactTestInstance;
      const submitStyle = flatStyles(submit.props.style);
      expect(submitStyle.backgroundColor).toBe(tokens.primary);
      const submitText = submit.findByType(Text);
      expect(flatStyles(submitText.props.style).color).toBe(tokens.onPrimary);
      act(() => {
        renderer.unmount();
      });
    }
  });
});
