import {
  buildRelayCommand,
  buildRelayCommandTopic,
  buildRelayFeedbackTopic,
  isRelayIndex,
  isRelayState,
  parseRelayStatePayload,
} from './commands';

describe('buildRelayCommand', () => {
  it('builds ON/OFF commands for relays 1..3', () => {
    for (const index of [1, 2, 3]) {
      expect(buildRelayCommand(index, 'ON')).toEqual({
        ok: true,
        value: { index, state: 'ON' },
      });
      expect(buildRelayCommand(index, 'OFF')).toEqual({
        ok: true,
        value: { index, state: 'OFF' },
      });
    }
  });

  it('rejects index 0', () => {
    const result = buildRelayCommand(0, 'ON');
    expect(result.ok).toBe(false);
  });

  it('rejects index 4', () => {
    const result = buildRelayCommand(4, 'ON');
    expect(result.ok).toBe(false);
  });

  it('rejects non-integer indices (strings and floats)', () => {
    expect(buildRelayCommand(NaN, 'ON').ok).toBe(false);
    expect(buildRelayCommand(1.5, 'ON').ok).toBe(false);
    // @ts-expect-error – deliberately passing a string at runtime
    expect(buildRelayCommand('2', 'ON').ok).toBe(false);
  });

  it('rejects unknown states', () => {
    expect(buildRelayCommand(1, 'TOGGLE').ok).toBe(false);
    expect(buildRelayCommand(1, 'on').ok).toBe(false); // must be uppercase
  });
});

describe('buildRelayCommandTopic', () => {
  it('builds `prefix/cmnd/relay/<n>` for relays 1..3', () => {
    expect(buildRelayCommandTopic('home', 1)).toEqual({
      ok: true,
      value: 'home/cmnd/relay/1',
    });
    expect(buildRelayCommandTopic('home', 2)).toEqual({
      ok: true,
      value: 'home/cmnd/relay/2',
    });
    expect(buildRelayCommandTopic('home', 3)).toEqual({
      ok: true,
      value: 'home/cmnd/relay/3',
    });
  });

  it('rejects indices outside 1..3', () => {
    expect(buildRelayCommandTopic('home', 0).ok).toBe(false);
    expect(buildRelayCommandTopic('home', 4).ok).toBe(false);
    expect(buildRelayCommandTopic('home', -1).ok).toBe(false);
  });
});

describe('buildRelayFeedbackTopic', () => {
  it('builds `prefix/stat/relay/<n>` for relays 1..3', () => {
    expect(buildRelayFeedbackTopic('home', 1)).toEqual({
      ok: true,
      value: 'home/stat/relay/1',
    });
    expect(buildRelayFeedbackTopic('home', 3)).toEqual({
      ok: true,
      value: 'home/stat/relay/3',
    });
  });

  it('rejects indices outside 1..3', () => {
    expect(buildRelayFeedbackTopic('home', 0).ok).toBe(false);
    expect(buildRelayFeedbackTopic('home', 9).ok).toBe(false);
  });
});

describe('guards', () => {
  it('isRelayIndex matches only 1..3', () => {
    expect(isRelayIndex(1)).toBe(true);
    expect(isRelayIndex(3)).toBe(true);
    expect(isRelayIndex(0)).toBe(false);
    expect(isRelayIndex(4)).toBe(false);
  });

  it('isRelayState matches ON/OFF only', () => {
    expect(isRelayState('ON')).toBe(true);
    expect(isRelayState('OFF')).toBe(true);
    expect(isRelayState('on')).toBe(false);
    expect(isRelayState('TOGGLE')).toBe(false);
  });
});

describe('parseRelayStatePayload', () => {
  it('parses ON/OFF (case-insensitive, trimmed)', () => {
    expect(parseRelayStatePayload('ON')).toEqual({ ok: true, value: 'ON' });
    expect(parseRelayStatePayload(' off ')).toEqual({ ok: true, value: 'OFF' });
  });

  it('rejects anything else', () => {
    expect(parseRelayStatePayload('MAYBE').ok).toBe(false);
    expect(parseRelayStatePayload('1').ok).toBe(false);
  });
});
