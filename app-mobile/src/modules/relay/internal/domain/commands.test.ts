import {
  buildRelayAddress,
  buildRelayCommand,
  buildRelayCommandTopic,
  buildRelayFeedbackTopic,
  isRelayIndex,
  isRelayRoomId,
  isRelayState,
  parseRelayFeedbackTopic,
  parseRelayStatePayload,
  relayFeedbackSubscriptionTopic,
} from './commands';

const ROOM_A = 'room-living';
const ROOM_B = 'room-bedroom';

describe('buildRelayAddress', () => {
  it('builds room-scoped addresses for slots 1..10', () => {
    for (let index = 1; index <= 10; index++) {
      expect(buildRelayAddress(ROOM_A, index)).toEqual({
        ok: true,
        value: { roomId: ROOM_A, index },
      });
    }
  });

  it('rejects slots 0 and 11 (outside 1..10)', () => {
    expect(buildRelayAddress(ROOM_A, 0).ok).toBe(false);
    expect(buildRelayAddress(ROOM_A, 11).ok).toBe(false);
    expect(buildRelayAddress(ROOM_A, -1).ok).toBe(false);
  });

  it('rejects non-integer slots', () => {
    expect(buildRelayAddress(ROOM_A, NaN).ok).toBe(false);
    expect(buildRelayAddress(ROOM_A, 1.5).ok).toBe(false);
    // @ts-expect-error – deliberately passing a string at runtime
    expect(buildRelayAddress(ROOM_A, '2').ok).toBe(false);
  });

  it('rejects malformed rooms (empty, separators, wildcards)', () => {
    expect(buildRelayAddress('', 1).ok).toBe(false);
    expect(buildRelayAddress('room/evil', 1).ok).toBe(false);
    expect(buildRelayAddress('room+', 1).ok).toBe(false);
    expect(buildRelayAddress('room#', 1).ok).toBe(false);
  });
});

describe('isRelayRoomId', () => {
  it('accepts normal room ids', () => {
    expect(isRelayRoomId('room-living')).toBe(true);
    expect(isRelayRoomId('room_1')).toBe(true);
  });

  it('rejects empty/separator/wildcard room ids', () => {
    expect(isRelayRoomId('')).toBe(false);
    expect(isRelayRoomId('a/b')).toBe(false);
    expect(isRelayRoomId('a+b')).toBe(false);
    expect(isRelayRoomId('a#b')).toBe(false);
  });
});

describe('buildRelayCommand', () => {
  it('builds ON/OFF commands for a room-scoped slot', () => {
    expect(buildRelayCommand(ROOM_A, 1, 'ON')).toEqual({
      ok: true,
      value: { roomId: ROOM_A, index: 1, state: 'ON' },
    });
    expect(buildRelayCommand(ROOM_B, 10, 'OFF')).toEqual({
      ok: true,
      value: { roomId: ROOM_B, index: 10, state: 'OFF' },
    });
  });

  it('rejects slots outside 1..10', () => {
    expect(buildRelayCommand(ROOM_A, 0, 'ON').ok).toBe(false);
    expect(buildRelayCommand(ROOM_A, 11, 'ON').ok).toBe(false);
  });

  it('rejects malformed rooms and unknown states', () => {
    expect(buildRelayCommand('', 1, 'ON').ok).toBe(false);
    expect(buildRelayCommand(ROOM_A, 1, 'TOGGLE').ok).toBe(false);
    expect(buildRelayCommand(ROOM_A, 1, 'on').ok).toBe(false); // uppercase only
  });
});

describe('buildRelayCommandTopic', () => {
  it('builds `<prefix>/room/<roomId>/cmnd/relay/<n>`', () => {
    expect(
      buildRelayCommandTopic('home', { roomId: ROOM_A, index: 1 }),
    ).toEqual({
      ok: true,
      value: `home/room/${ROOM_A}/cmnd/relay/1`,
    });
    expect(
      buildRelayCommandTopic('home', { roomId: ROOM_B, index: 10 }),
    ).toEqual({
      ok: true,
      value: `home/room/${ROOM_B}/cmnd/relay/10`,
    });
  });

  it('rejects slots 0/11 and malformed rooms', () => {
    expect(
      buildRelayCommandTopic('home', { roomId: ROOM_A, index: 0 as 1 }).ok,
    ).toBe(false);
    expect(
      buildRelayCommandTopic('home', { roomId: ROOM_A, index: 11 as 1 }).ok,
    ).toBe(false);
    expect(buildRelayCommandTopic('home', { roomId: '', index: 1 }).ok).toBe(
      false,
    );
    expect(buildRelayCommandTopic('home', { roomId: 'a/b', index: 1 }).ok).toBe(
      false,
    );
  });
});

describe('buildRelayFeedbackTopic', () => {
  it('builds `<prefix>/room/<roomId>/stat/relay/<n>`', () => {
    expect(
      buildRelayFeedbackTopic('home', { roomId: ROOM_A, index: 2 }),
    ).toEqual({
      ok: true,
      value: `home/room/${ROOM_A}/stat/relay/2`,
    });
  });

  it('rejects slots outside 1..10', () => {
    expect(
      buildRelayFeedbackTopic('home', { roomId: ROOM_A, index: 0 as 1 }).ok,
    ).toBe(false);
    expect(
      buildRelayFeedbackTopic('home', { roomId: ROOM_A, index: 11 as 1 }).ok,
    ).toBe(false);
  });
});

describe('relayFeedbackSubscriptionTopic', () => {
  it('wildcards room + slot with the configured prefix', () => {
    expect(relayFeedbackSubscriptionTopic('home')).toBe(
      'home/room/+/stat/relay/+',
    );
    expect(relayFeedbackSubscriptionTopic('factory/house-a')).toBe(
      'factory/house-a/room/+/stat/relay/+',
    );
  });
});

describe('parseRelayFeedbackTopic', () => {
  it('extracts the room-scoped address from a feedback topic', () => {
    expect(
      parseRelayFeedbackTopic(`home/room/${ROOM_A}/stat/relay/2`, 'home'),
    ).toEqual({
      ok: true,
      value: { roomId: ROOM_A, index: 2 },
    });
    expect(
      parseRelayFeedbackTopic('home/room/kitchen/stat/relay/10', 'home'),
    ).toEqual({
      ok: true,
      value: { roomId: 'kitchen', index: 10 },
    });
  });

  it('rejects wrong prefixes', () => {
    expect(
      parseRelayFeedbackTopic(`office/room/${ROOM_A}/stat/relay/2`, 'home').ok,
    ).toBe(false);
  });

  it('rejects non-relay / foreign topic structures', () => {
    expect(parseRelayFeedbackTopic('home/tele/sensor', 'home').ok).toBe(false);
    expect(
      parseRelayFeedbackTopic(`home/room/${ROOM_A}/cmnd/relay/2`, 'home').ok,
    ).toBe(false);
    expect(
      parseRelayFeedbackTopic(`home/room/${ROOM_A}/stat/relay`, 'home').ok,
    ).toBe(false);
    expect(
      parseRelayFeedbackTopic(`home/room/${ROOM_A}/stat/relay/2/extra`, 'home')
        .ok,
    ).toBe(false);
  });

  it('rejects slots 0 and 11', () => {
    expect(
      parseRelayFeedbackTopic(`home/room/${ROOM_A}/stat/relay/0`, 'home').ok,
    ).toBe(false);
    expect(
      parseRelayFeedbackTopic(`home/room/${ROOM_A}/stat/relay/11`, 'home').ok,
    ).toBe(false);
  });

  it('rejects an empty room segment', () => {
    expect(parseRelayFeedbackTopic('home/room//stat/relay/2', 'home').ok).toBe(
      false,
    );
  });

  it('escapes regex metacharacters in the configured prefix', () => {
    expect(
      parseRelayFeedbackTopic('aXb/room/kitchen/stat/relay/1', 'a.b').ok,
    ).toBe(false);
    expect(
      parseRelayFeedbackTopic('a.b/room/kitchen/stat/relay/1', 'a.b'),
    ).toEqual({
      ok: true,
      value: { roomId: 'kitchen', index: 1 },
    });
  });
});

describe('guards', () => {
  it('isRelayIndex matches only 1..10', () => {
    expect(isRelayIndex(1)).toBe(true);
    expect(isRelayIndex(10)).toBe(true);
    expect(isRelayIndex(0)).toBe(false);
    expect(isRelayIndex(11)).toBe(false);
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
