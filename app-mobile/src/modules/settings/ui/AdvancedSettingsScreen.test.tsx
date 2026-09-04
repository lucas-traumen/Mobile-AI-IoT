/**
 * AdvancedSettingsScreen tests — the truthful per-service diagnostics
 * contract (settings-information-architecture plan):
 * - MQTT and InfluxDB each have a status dot + their OWN action;
 * - the MQTT dot follows the REAL connection lifecycle (no parallel
 *   client); unsaved MQTT edits mark it stale/gray;
 * - the InfluxDB dot describes ONLY the last explicit probe; editing fields
 *   invalidates the prior probe result (stale/gray); never configured →
 *   gray with "Chưa cấu hình";
 * - a probe result is bound to the EXACT persisted configuration it tested
 *   via a typed config fingerprint (fix cycle 2): a successful save of an
 *   edited config keeps the dot gray until a new probe succeeds, and an
 *   async probe completing after a config change cannot validate it.
 * - save failures keep the form open and surface the top-center banner.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { ThemeProvider } from '@core/theme';
import type { AppSettings } from '@modules/settings/api';

import {
  AdvancedSettingsScreen,
  RETRY_FLAG_RESET_MS,
} from './AdvancedSettingsScreen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    mqtt: {
      host: 'broker.local',
      port: 9001,
      username: undefined,
      password: undefined,
      prefix: 'home',
    },
    influx: {
      url: 'http://influx.local:8086',
      org: 'iot',
      bucket: 'sensors',
      token: 'tok',
    },
    ui: { theme: 'light' },
    ...overrides,
  };
}

/** Renderers still mounted (unmounted in afterEach — timer hygiene). */
const openRenderers: TestRenderer.ReactTestRenderer[] = [];

function makeScreen(
  props: Partial<Parameters<typeof AdvancedSettingsScreen>[0]> = {},
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  const element = (
    <ThemeProvider mode="light">
      <AdvancedSettingsScreen
        onBack={() => undefined}
        settings={props.settings ?? settings()}
        persistedInflux={props.persistedInflux ?? settings().influx}
        errors={props.errors}
        onUpdateMqtt={props.onUpdateMqtt}
        onUpdateInflux={props.onUpdateInflux}
        onSave={props.onSave ?? (async () => ({ ok: true, message: 'Đã lưu' }))}
        connectionState={props.connectionState ?? 'connected'}
        lastErrorCode={props.lastErrorCode ?? null}
        mqttDirty={props.mqttDirty ?? false}
        influxDirty={props.influxDirty ?? false}
        onMqttRetry={props.onMqttRetry}
        onCheckInflux={props.onCheckInflux}
      />
    </ThemeProvider>
  );
  act(() => {
    renderer = TestRenderer.create(element);
  });
  openRenderers.push(renderer);
  return renderer;
}

/** Unmount every renderer created by the suite (timer/act hygiene). */
afterEach(() => {
  for (const renderer of openRenderers) {
    act(() => {
      renderer.unmount();
    });
  }
  openRenderers.length = 0;
});

/** Collect all rendered text (deep Text walk). */
function allText(renderer: TestRenderer.ReactTestRenderer): string {
  const texts: string[] = [];
  const walk = (node: TestRenderer.ReactTestInstance) => {
    if (typeof node.props.children === 'string') {
      texts.push(node.props.children);
    }
    for (const child of node.children) {
      if (typeof child === 'object') {
        walk(child as TestRenderer.ReactTestInstance);
      }
    }
  };
  walk(renderer.root);
  return texts.join('\n');
}

/** Assert at least one rendered status dot carries the given status. */
function expectDot(
  renderer: TestRenderer.ReactTestRenderer,
  status: string,
): void {
  const dots = renderer.root.findAllByProps({ testID: `status-dot-${status}` });
  expect(dots.length).toBeGreaterThan(0);
}

/** Count rendered status dots carrying the given status. */
function countDots(
  renderer: TestRenderer.ReactTestRenderer,
  status: string,
): number {
  return renderer.root.findAllByProps({ testID: `status-dot-${status}` })
    .length;
}

/** Press the Influx check action and drain the async probe. */
async function pressInfluxCheck(
  renderer: TestRenderer.ReactTestRenderer,
): Promise<void> {
  await act(async () => {
    renderer.root
      .findByProps({ testID: 'advanced-influx-check' })
      .props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Stateful harness simulating the coordinator wiring: `settings` is the
 * draft, `persistedInflux` is the last-persisted config (what the raw
 * adapter probes), `influxDirty` is draft-vs-persisted, and save commits
 * the draft into the persisted config (fix cycle 2 probe truthfulness).
 */
function renderProbeHarness(
  props: {
    onCheckInflux?: () => Promise<'ok' | 'fail'>;
  } = {},
): { renderer: TestRenderer.ReactTestRenderer } {
  let renderer!: TestRenderer.ReactTestRenderer;
  function Harness() {
    const [draft, setDraft] = React.useState(settings());
    const [persisted, setPersisted] = React.useState(settings());
    const influxDirty =
      JSON.stringify(draft.influx) !== JSON.stringify(persisted.influx);
    return (
      <ThemeProvider mode="light">
        <AdvancedSettingsScreen
          onBack={() => undefined}
          settings={draft}
          persistedInflux={persisted.influx}
          onUpdateInflux={patch =>
            setDraft(d => ({ ...d, influx: { ...d.influx, ...patch } }))
          }
          onSave={async candidate => {
            setPersisted(candidate);
            return { ok: true, message: 'Đã lưu' };
          }}
          mqttDirty={false}
          influxDirty={influxDirty}
          onCheckInflux={props.onCheckInflux ?? (async () => 'ok')}
        />
      </ThemeProvider>
    );
  }
  act(() => {
    renderer = TestRenderer.create(<Harness />);
  });
  openRenderers.push(renderer);
  return { renderer };
}

/** Edit the Influx URL input (the only field with the base URL value). */
async function editInfluxUrl(
  renderer: TestRenderer.ReactTestRenderer,
  value: string,
): Promise<void> {
  await act(async () => {
    renderer.root
      .findByProps({ value: 'http://influx.local:8086' })
      .props.onChangeText(value);
  });
}

/** Commit the draft through the save action. */
async function pressSave(
  renderer: TestRenderer.ReactTestRenderer,
): Promise<void> {
  await act(async () => {
    renderer.root.findByProps({ testID: 'advanced-save' }).props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AdvancedSettingsScreen status semantics', () => {
  it('shows the live MQTT state (green when connected) and the gray Influx dot before any probe', () => {
    const renderer = makeScreen({ connectionState: 'connected' });
    expect(
      renderer.root.findByProps({ testID: 'advanced-mqtt-status' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'advanced-influx-status' }),
    ).toBeTruthy();
    // Influx: never probed → gray, not pretending to be connected.
    expectDot(renderer, 'gray');
    expectDot(renderer, 'healthy');
    expect(allText(renderer)).toContain('MQTT Online');
  });

  it('marks MQTT stale/gray while the MQTT draft has unsaved edits', () => {
    const renderer = makeScreen({ mqttDirty: true });
    expectDot(renderer, 'gray');
    expect(allText(renderer)).toContain('Đã chỉnh sửa — hãy kiểm tra lại');
  });

  it('marks the Influx probe stale/gray when Influx fields were edited', () => {
    const renderer = makeScreen({ influxDirty: true });
    expectDot(renderer, 'gray');
    expect(allText(renderer)).toContain('Đã chỉnh sửa');
  });

  it('shows gray + not-configured when Influx fields are empty', () => {
    const renderer = makeScreen({
      settings: settings({
        influx: { url: '', org: '', bucket: '', token: '' },
      }),
    });
    expect(allText(renderer)).toContain('Chưa cấu hình InfluxDB');
    // The check action is disabled without a configuration.
    expect(
      renderer.root.findByProps({ testID: 'advanced-influx-check' }).props
        .disabled,
    ).toBe(true);
  });

  it('shows red for a confirmed MQTT failure with the error label', () => {
    const renderer = makeScreen({
      connectionState: 'failed',
      lastErrorCode: 'timeout' as never,
    });
    expectDot(renderer, 'failed');
  });

  it('shows amber while connecting/reconnecting', () => {
    const renderer = makeScreen({ connectionState: 'reconnecting' });
    expectDot(renderer, 'progress');
  });
});

describe('AdvancedSettingsScreen independent actions', () => {
  it('the MQTT retry drives the wired real-lifecycle callback', async () => {
    const onMqttRetry = jest.fn();
    const renderer = makeScreen({ onMqttRetry });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'advanced-mqtt-retry' })
        .props.onPress();
    });
    expect(onMqttRetry).toHaveBeenCalledTimes(1);
  });

  it('the Influx check probes through the wired raw-adapter callback', async () => {
    const onCheckInflux = jest.fn(async () => 'ok' as const);
    const renderer = makeScreen({ onCheckInflux });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'advanced-influx-check' })
        .props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onCheckInflux).toHaveBeenCalledTimes(1);
    // Confirmed healthy after a successful explicit probe.
    expectDot(renderer, 'healthy');
  });

  it('a failed explicit probe turns the Influx dot red and keeps the form open', async () => {
    const onCheckInflux = jest.fn(async () => 'fail' as const);
    const renderer = makeScreen({ onCheckInflux });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'advanced-influx-check' })
        .props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expectDot(renderer, 'failed');
    // Form still open: the save button is still rendered.
    expect(renderer.root.findByProps({ testID: 'advanced-save' })).toBeTruthy();
  });
});

describe('AdvancedSettingsScreen probe truthfulness (fix cycle 2)', () => {
  it('keeps the probe result stale across a successful save of an edited config; a new probe restores it', async () => {
    const { renderer } = renderProbeHarness();

    // 1. Explicit probe of the persisted config succeeds → green.
    await pressInfluxCheck(renderer);
    expectDot(renderer, 'healthy');

    // 2. Edit the Influx draft → the probe result is stale/gray.
    await editInfluxUrl(renderer, 'http://influx2.local:8086');
    expect(countDots(renderer, 'healthy')).toBe(0);

    // 3. A SUCCESSFUL save commits the edited config (influxDirty=false) —
    //    the old probe must NOT become green again: it never tested the
    //    newly saved configuration.
    await pressSave(renderer);
    expect(countDots(renderer, 'healthy')).toBe(0);

    // 4. A new explicit probe of the now-persisted config succeeds → green.
    await pressInfluxCheck(renderer);
    expectDot(renderer, 'healthy');
  });

  it('an async probe completing after an edit+save cannot validate the new config', async () => {
    let resolveProbe!: (value: 'ok' | 'fail') => void;
    const onCheckInflux = jest.fn(
      () =>
        new Promise<'ok' | 'fail'>(resolve => {
          resolveProbe = resolve;
        }),
    );
    const { renderer } = renderProbeHarness({ onCheckInflux });

    // Probe starts against the persisted config (result still pending).
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'advanced-influx-check' })
        .props.onPress();
    });
    expect(onCheckInflux).toHaveBeenCalledTimes(1);

    // While in flight: the config is edited AND saved.
    await editInfluxUrl(renderer, 'http://influx2.local:8086');
    await pressSave(renderer);

    // The stale probe then completes successfully — it stays attributed to
    // the OLD configuration and must not mark the new config healthy.
    await act(async () => {
      resolveProbe('ok');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(countDots(renderer, 'healthy')).toBe(0);
    expect(countDots(renderer, 'failed')).toBe(0);
    // Unknown for the newly persisted (never-probed) configuration: gray.
    expect(countDots(renderer, 'gray')).toBeGreaterThan(0);
  });
});

describe('AdvancedSettingsScreen save flow', () => {
  it('keeps the form open and shows the top-center banner on a save failure', async () => {
    const renderer = makeScreen({
      onSave: async () => ({ ok: false, message: 'Lưu thất bại: disk full' }),
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'advanced-save' }).props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // The form is still open (save button still present).
    expect(renderer.root.findByProps({ testID: 'advanced-save' })).toBeTruthy();
    // Top-center banner carries the failure.
    expect(
      renderer.root.findByProps({ testID: 'operation-banner' }),
    ).toBeTruthy();
    expect(allText(renderer)).toContain('Lưu thất bại: disk full');
  });

  it('shows the success banner after a successful save', async () => {
    const renderer = makeScreen();
    await act(async () => {
      renderer.root.findByProps({ testID: 'advanced-save' }).props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(allText(renderer)).toContain('Đã lưu');
  });
});

describe('AdvancedSettingsScreen retry timer lifecycle (fix cycle 1)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('the amber retry flag releases itself after the window (real lifecycle flag)', async () => {
    const onMqttRetry = jest.fn();
    const renderer = makeScreen({ onMqttRetry });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'advanced-mqtt-retry' })
        .props.onPress();
    });
    expect(onMqttRetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(RETRY_FLAG_RESET_MS);
    });
    // The flag reset itself — the same retry action can be pressed again.
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'advanced-mqtt-retry' })
        .props.onPress();
    });
    expect(onMqttRetry).toHaveBeenCalledTimes(2);
  });

  it('cancels the retry-flag timer on unmount (no post-teardown setState)', async () => {
    const onMqttRetry = jest.fn();
    const renderer = makeScreen({ onMqttRetry });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'advanced-mqtt-retry' })
        .props.onPress();
    });
    expect(onMqttRetry).toHaveBeenCalledTimes(1);

    const clearSpy = jest.spyOn(global, 'clearTimeout');
    await act(async () => {
      renderer.unmount();
    });
    // The unmount cleanup cleared the pending flag timer.
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();

    // Any remaining timers fire as a safe no-op (no act/unmounted warnings —
    // this assertion doubles as the noise guard: a post-teardown setState
    // would reject the act() promise below in strict test builds).
    await act(async () => {
      jest.runAllTimers();
    });
  });
});
