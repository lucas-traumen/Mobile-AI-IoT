/**
 * Sensor topic build/parse tests (approved room-sensor contract): the
 * topic carries the exact `{roomId, field}` identity; malformed topics,
 * wrong prefixes and wildcard-like segments are rejected.
 */

import {
  parseSensorTopic,
  sensorTopic,
  sensorSubscriptionTopic,
} from './topics';

describe('sensorTopic', () => {
  it('builds the room-scoped per-field topic', () => {
    expect(
      sensorTopic('home', { roomId: 'room-living', field: 'temperature' }),
    ).toBe('home/room/room-living/sensor/temperature');
  });
});

describe('sensorSubscriptionTopic', () => {
  it('is the room/field wildcard', () => {
    expect(sensorSubscriptionTopic('home')).toBe('home/room/+/sensor/+');
  });
});

describe('parseSensorTopic', () => {
  it('parses a well-formed topic into its identity', () => {
    expect(
      parseSensorTopic('home/room/room-living/sensor/temperature', 'home'),
    ).toEqual({
      ok: true,
      value: { roomId: 'room-living', field: 'temperature' },
    });
  });

  it('rejects a wrong prefix', () => {
    expect(
      parseSensorTopic('other/room/room-living/sensor/temperature', 'home').ok,
    ).toBe(false);
    expect(parseSensorTopic('home/tele/sensor', 'home').ok).toBe(false);
  });

  it('rejects malformed shapes', () => {
    expect(parseSensorTopic('home/room/room-living/sensor', 'home').ok).toBe(
      false,
    );
    expect(
      parseSensorTopic('home/room/room-living/other/temperature', 'home').ok,
    ).toBe(false);
    expect(
      parseSensorTopic('home/room/room-living/sensor/temperature/extra', 'home')
        .ok,
    ).toBe(false);
  });

  it('rejects empty segments', () => {
    expect(parseSensorTopic('home/room//sensor/temperature', 'home').ok).toBe(
      false,
    );
    expect(parseSensorTopic('home/room/r1/sensor/', 'home').ok).toBe(false);
  });

  it('rejects wildcard-like segments (no silent dispatch widening)', () => {
    expect(parseSensorTopic('home/room/+/sensor/temperature', 'home').ok).toBe(
      false,
    );
    expect(parseSensorTopic('home/room/r1/sensor/temp+#', 'home').ok).toBe(
      false,
    );
  });
});
